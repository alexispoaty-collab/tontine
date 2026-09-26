import type { Frequency, PayoutMode } from "../../generated/prisma/client";
import type { Db } from "../db-types";
import { DomainError, isUniqueViolation } from "../errors";
import { tempEmailFor, normalizePhone as normalize } from "../../lib/phone";
import { requireMember } from "./access";

export function normalizePhone(raw: string): string {
  const p = normalize(raw);
  if (!p) throw new DomainError("INVALID_PHONE", "Numéro invalide. Exemple attendu : +241 77 12 34 56.");
  return p;
}

const looksLikePhone = (name: string) => /^\+?\d[\d\s]*$/.test(name.trim());
const cleanName = (n: string) => n.trim().replace(/\s+/g, " ");

export type CreateTontineInput = {
  actorUserId: string; name: string; contributionAmount: number; frequency: Frequency; startDate: string;
  payoutMode: PayoutMode; beneficiaryContributes: boolean; penaltyAmount: number; penaltyGraceDays: number;
};

// Le créateur devient président. La tontine reste en brouillon jusqu'à son activation.
export async function createTontine(db: Db, i: CreateTontineInput) {
  const name = cleanName(i.name);
  if (name.length < 2 || name.length > 150) throw new DomainError("INVALID_NAME", "Le nom doit compter entre 2 et 150 caractères.");
  if (!Number.isInteger(i.contributionAmount) || i.contributionAmount <= 0 || i.contributionAmount > 100_000_000) {
    throw new DomainError("INVALID_AMOUNT", "La cotisation doit être un montant entier en FCFA, supérieur à zéro.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.startDate) || Number.isNaN(Date.parse(i.startDate))) {
    throw new DomainError("INVALID_DATE", "Date de première échéance invalide.");
  }
  for (const v of [i.penaltyAmount, i.penaltyGraceDays]) {
    if (!Number.isInteger(v) || v < 0) throw new DomainError("INVALID_PENALTY", "La pénalité et le délai de grâce doivent être des entiers positifs ou nuls.");
  }
  return db.$transaction(async (tx) => {
    const t = await tx.tontine.create({
      data: {
        name, contributionAmount: i.contributionAmount, frequency: i.frequency, startDate: new Date(i.startDate),
        payoutMode: i.payoutMode, beneficiaryContributes: i.beneficiaryContributes,
        penaltyAmount: i.penaltyAmount, penaltyGraceDays: i.penaltyGraceDays, createdById: i.actorUserId,
        members: { create: { userId: i.actorUserId, role: "PRESIDENT" } },
      },
    });
    await tx.auditLog.create({ data: { tontineId: t.id, action: "tontine.created", performedById: i.actorUserId, details: { name } } });
    return t;
  });
}

// Ajout d'un membre par son numéro, par le président ou le trésorier, en brouillon uniquement.
// Si le numéro n'a pas encore de compte, il est créé : la personne se connectera plus tard avec ce numéro.
export async function addMember(db: Db, i: { tontineId: string; actorUserId: string; name: string; phone: string }) {
  const phone = normalizePhone(i.phone);
  const name = cleanName(i.name);
  if (name.length < 2 || name.length > 100) throw new DomainError("INVALID_NAME", "Indiquez le nom du membre (2 à 100 caractères).");
  try {
    return await db.$transaction(async (tx) => {
      const t = await tx.tontine.findUnique({ where: { id: i.tontineId } });
      if (!t) throw new DomainError("NOT_FOUND", "Tontine introuvable.");
      if (t.status !== "DRAFT") throw new DomainError("NOT_DRAFT", "Les membres ne peuvent plus changer après l'activation.");
      await requireMember(tx, i.tontineId, i.actorUserId, ["PRESIDENT", "TREASURER"]);
      let user = await tx.user.findUnique({ where: { phoneNumber: phone } });
      if (!user) user = await tx.user.create({ data: { name, phoneNumber: phone, email: tempEmailFor(phone) } });
      else if (looksLikePhone(user.name)) user = await tx.user.update({ where: { id: user.id }, data: { name } });
      const m = await tx.tontineMember.create({ data: { tontineId: i.tontineId, userId: user.id, role: "MEMBER" } });
      await tx.tontineMember.updateMany({ where: { tontineId: i.tontineId }, data: { payoutPosition: null } }); // l'ordre est à refaire
      await tx.auditLog.create({ data: { tontineId: i.tontineId, action: "member.added", entityType: "TontineMember", entityId: m.id, performedById: i.actorUserId, details: { name: user.name, phone } } });
      return m;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new DomainError("ALREADY_MEMBER", "Ce numéro fait déjà partie de la tontine.");
    throw e;
  }
}

export async function removeMember(db: Db, i: { tontineId: string; actorUserId: string; memberId: string }) {
  return db.$transaction(async (tx) => {
    const t = await tx.tontine.findUnique({ where: { id: i.tontineId } });
    if (!t || t.status !== "DRAFT") throw new DomainError("NOT_DRAFT", "Les membres ne peuvent plus changer après l'activation.");
    await requireMember(tx, i.tontineId, i.actorUserId, ["PRESIDENT"]);
    const m = await tx.tontineMember.findUnique({ where: { id: i.memberId }, include: { user: true } });
    if (!m || m.tontineId !== i.tontineId) throw new DomainError("NOT_FOUND", "Membre introuvable.");
    if (m.role === "PRESIDENT") throw new DomainError("CANNOT_REMOVE_PRESIDENT", "Le président ne peut pas être retiré.");
    await tx.tontineMember.delete({ where: { id: m.id } });
    await tx.tontineMember.updateMany({ where: { tontineId: i.tontineId }, data: { payoutPosition: null } });
    await tx.auditLog.create({ data: { tontineId: i.tontineId, action: "member.removed", entityType: "TontineMember", entityId: m.id, performedById: i.actorUserId, details: { name: m.user.name } } });
  });
}

// Un seul trésorier, distinct du président (sinon personne ne pourrait valider ses propres cotisations).
export async function setTreasurer(db: Db, i: { tontineId: string; actorUserId: string; memberId: string }) {
  return db.$transaction(async (tx) => {
    const t = await tx.tontine.findUnique({ where: { id: i.tontineId } });
    if (!t || t.status !== "DRAFT") throw new DomainError("NOT_DRAFT", "Les rôles ne peuvent plus changer après l'activation.");
    await requireMember(tx, i.tontineId, i.actorUserId, ["PRESIDENT"]);
    const m = await tx.tontineMember.findUnique({ where: { id: i.memberId } });
    if (!m || m.tontineId !== i.tontineId) throw new DomainError("NOT_FOUND", "Membre introuvable.");
    if (m.role === "PRESIDENT") throw new DomainError("PRESIDENT_CANNOT_BE_TREASURER", "Le trésorier doit être une autre personne que le président.");
    await tx.tontineMember.updateMany({ where: { tontineId: i.tontineId, role: "TREASURER" }, data: { role: "MEMBER" } });
    await tx.tontineMember.update({ where: { id: m.id }, data: { role: "TREASURER" } });
    await tx.auditLog.create({ data: { tontineId: i.tontineId, action: "treasurer.set", entityType: "TontineMember", entityId: m.id, performedById: i.actorUserId, details: {} } });
  });
}

export async function updateUserName(db: Db, i: { userId: string; name: string }) {
  const name = cleanName(i.name);
  if (name.length < 2 || name.length > 100 || looksLikePhone(name)) throw new DomainError("INVALID_NAME", "Indiquez votre nom complet.");
  return db.user.update({ where: { id: i.userId }, data: { name } });
}

export const needsName = (name: string) => looksLikePhone(name);

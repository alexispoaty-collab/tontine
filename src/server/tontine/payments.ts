import type { PaymentMethod } from "../../generated/prisma/client";
import type { Db } from "../db-types";
import { DomainError, isUniqueViolation } from "../errors";
import { isManager, requireMember } from "./access";
import { LEDGER_TX, lockLedger, recomputeContribution, recomputeCycle } from "./ledger";

const MOBILE_MONEY: PaymentMethod[] = ["AIRTEL_MONEY", "MOOV_MONEY"];
export const normalizeReference = (r?: string | null) => r?.trim().toUpperCase().replace(/\s+/g, "") || null;

type PaymentInput = { amount: number; method: PaymentMethod; operatorReference?: string | null; paidAt: Date; note?: string | null };

function checkPayment(p: PaymentInput) {
  if (!Number.isInteger(p.amount) || p.amount <= 0) throw new DomainError("INVALID_AMOUNT", "Le montant doit être un entier positif, en FCFA.");
  const ref = normalizeReference(p.operatorReference);
  if (MOBILE_MONEY.includes(p.method) && !ref) {
    throw new DomainError("REFERENCE_REQUIRED", "Indiquez l'identifiant de transaction figurant dans le SMS Airtel Money ou Moov Money.");
  }
  return ref;
}

const REF_USED = () => new DomainError("REFERENCE_ALREADY_USED", "Cette référence de transaction a déjà servi pour un autre paiement.");

// Un membre déclare son paiement, ou le trésorier/président le fait pour lui (membre sans smartphone).
// Autorisé sur tous les tours d'une tontine active : payer en avance ou en retard est normal.
export async function declarePayment(db: Db, input: PaymentInput & { contributionId: string; actorUserId: string }) {
  const ref = checkPayment(input);
  try {
    return await db.$transaction(async (tx) => {
      const c = await tx.contribution.findUnique({ where: { id: input.contributionId }, include: { cycle: { include: { tontine: true } } } });
      if (!c) throw new DomainError("NOT_FOUND", "Cotisation introuvable.");
      if (c.cycle.tontine.status !== "ACTIVE") throw new DomainError("TONTINE_NOT_ACTIVE", "La tontine n'est pas active.");
      const actor = await requireMember(tx, c.cycle.tontineId, input.actorUserId);
      if (actor.id !== c.memberId && !isManager(actor.role)) {
        throw new DomainError("FORBIDDEN", "Vous ne pouvez déclarer que vos propres paiements.");
      }
      const d = await tx.paymentDeclaration.create({
        data: {
          contributionId: c.id, amount: input.amount, method: input.method, operatorReference: ref,
          paidAt: input.paidAt, note: input.note?.trim() || null, declaredById: input.actorUserId,
        },
      });
      await tx.auditLog.create({
        data: { tontineId: c.cycle.tontineId, action: "declaration.created", entityType: "PaymentDeclaration", entityId: d.id,
          performedById: input.actorUserId, details: { amount: d.amount, method: d.method, reference: ref, contributionId: c.id } },
      });
      return d;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw REF_USED();
    throw e;
  }
}

// Validation ou rejet par le trésorier ou le président. Personne ne valide sa propre cotisation.
export async function reviewDeclaration(
  db: Db,
  input: { declarationId: string; actorUserId: string; decision: "VALIDATE" | "REJECT"; reason?: string; now?: Date },
) {
  const now = input.now ?? new Date();
  return db.$transaction(async (tx) => {
    const d0 = await tx.paymentDeclaration.findUnique({ where: { id: input.declarationId }, include: { contribution: { include: { cycle: true } } } });
    if (!d0) throw new DomainError("NOT_FOUND", "Déclaration introuvable.");
    await lockLedger(tx, d0.contribution.cycleId, d0.contributionId);
    const d = await tx.paymentDeclaration.findUniqueOrThrow({ where: { id: d0.id } });
    if (d.status !== "DECLARED") throw new DomainError("ALREADY_REVIEWED", "Cette déclaration a déjà été traitée.");
    const tontineId = d0.contribution.cycle.tontineId;
    const actor = await requireMember(tx, tontineId, input.actorUserId, ["TREASURER", "PRESIDENT"]);
    if (actor.id === d0.contribution.memberId) {
      throw new DomainError("SELF_REVIEW", "Votre propre cotisation doit être validée par un autre responsable (trésorier ou président).");
    }

    if (input.decision === "REJECT") {
      const reason = input.reason?.trim();
      if (!reason) throw new DomainError("REASON_REQUIRED", "Indiquez le motif du rejet : le membre le verra.");
      const r = await tx.paymentDeclaration.update({
        where: { id: d.id }, data: { status: "REJECTED", reviewedById: input.actorUserId, reviewedAt: now, rejectionReason: reason },
      });
      await tx.auditLog.create({ data: { tontineId, action: "declaration.rejected", entityType: "PaymentDeclaration", entityId: d.id, performedById: input.actorUserId, details: { reason } } });
      return { declaration: r };
    }

    const v = await tx.paymentDeclaration.update({
      where: { id: d.id }, data: { status: "VALIDATED", reviewedById: input.actorUserId, reviewedAt: now, rejectionReason: null },
    });
    const contribution = await recomputeContribution(tx, d.contributionId, now);
    const cycle = await recomputeCycle(tx, d0.contribution.cycleId);
    await tx.auditLog.create({
      data: { tontineId, action: "declaration.validated", entityType: "PaymentDeclaration", entityId: d.id, performedById: input.actorUserId,
        details: { amount: v.amount, reference: v.operatorReference, contributionStatus: contribution.status, cycleCollected: cycle.totalCollected } },
    });
    return { declaration: v, contribution, cycle };
  }, LEDGER_TX);
}

// Correction d'une déclaration rejetée (même ligne : la référence reste unique).
export async function resubmitDeclaration(db: Db, input: PaymentInput & { declarationId: string; actorUserId: string }) {
  const ref = checkPayment(input);
  try {
    return await db.$transaction(async (tx) => {
      const d = await tx.paymentDeclaration.findUnique({ where: { id: input.declarationId }, include: { contribution: { include: { cycle: true } } } });
      if (!d) throw new DomainError("NOT_FOUND", "Déclaration introuvable.");
      if (d.status !== "REJECTED") throw new DomainError("NOT_REJECTED", "Seule une déclaration rejetée peut être corrigée.");
      const actor = await requireMember(tx, d.contribution.cycle.tontineId, input.actorUserId);
      if (d.declaredById !== input.actorUserId && !isManager(actor.role)) throw new DomainError("FORBIDDEN", "Vous ne pouvez corriger que vos propres déclarations.");
      const u = await tx.paymentDeclaration.update({
        where: { id: d.id },
        data: { amount: input.amount, method: input.method, operatorReference: ref, paidAt: input.paidAt, note: input.note?.trim() || null,
          status: "DECLARED", reviewedById: null, reviewedAt: null, rejectionReason: null, declaredAt: new Date() },
      });
      await tx.auditLog.create({ data: { tontineId: d.contribution.cycle.tontineId, action: "declaration.resubmitted", entityType: "PaymentDeclaration", entityId: d.id, performedById: input.actorUserId, details: { amount: u.amount, reference: ref } } });
      return u;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw REF_USED();
    throw e;
  }
}

import type { PaymentMethod } from "../../generated/prisma/client";
import type { Db } from "../db-types";
import { DomainError, isUniqueViolation } from "../errors";
import { requireMember } from "./access";
import { normalizeReference } from "./payments";

// Le trésorier déclare avoir remis la cagnotte. Autorisé même si la collecte est incomplète
// (il avance souvent la différence) : `shortfall` permet à l'interface d'avertir.
export async function declarePayout(
  db: Db,
  input: { cycleId: string; actorUserId: string; amount: number; method: PaymentMethod; operatorReference?: string | null; now?: Date },
) {
  const now = input.now ?? new Date();
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new DomainError("INVALID_AMOUNT", "Le montant remis doit être un entier positif, en FCFA.");
  const ref = normalizeReference(input.operatorReference);
  if ((input.method === "AIRTEL_MONEY" || input.method === "MOOV_MONEY") && !ref) {
    throw new DomainError("REFERENCE_REQUIRED", "Indiquez l'identifiant de transaction du transfert au bénéficiaire.");
  }
  try {
    return await db.$transaction(async (tx) => {
      const c = await tx.cycle.findUnique({ where: { id: input.cycleId }, include: { tontine: true } });
      if (!c) throw new DomainError("NOT_FOUND", "Tour introuvable.");
      if (c.tontine.status !== "ACTIVE") throw new DomainError("TONTINE_NOT_ACTIVE", "La tontine n'est pas active.");
      if (c.status !== "COLLECTING") throw new DomainError("CYCLE_NOT_CURRENT", "La remise ne peut être déclarée que pour le tour en cours.");
      await requireMember(tx, c.tontineId, input.actorUserId, ["TREASURER"]);
      const u = await tx.cycle.update({
        where: { id: c.id },
        data: { status: "PAYOUT_DECLARED", payoutAmount: input.amount, payoutMethod: input.method, payoutReference: ref, payoutDeclaredAt: now, payoutDeclaredById: input.actorUserId },
      });
      const shortfall = Math.max(0, c.totalExpected - c.totalCollected);
      await tx.auditLog.create({
        data: { tontineId: c.tontineId, action: "payout.declared", entityType: "Cycle", entityId: c.id, performedById: input.actorUserId,
          details: { amount: input.amount, method: input.method, reference: ref, collected: c.totalCollected, expected: c.totalExpected, shortfall } },
      });
      return { cycle: u, shortfall };
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new DomainError("REFERENCE_ALREADY_USED", "Cette référence de transaction a déjà servi.");
    throw e;
  }
}

// Seul le bénéficiaire confirme la réception. Le tour suivant s'ouvre alors automatiquement ;
// après le dernier tour, la tontine est terminée.
export async function confirmPayout(db: Db, input: { cycleId: string; actorUserId: string; now?: Date }) {
  const now = input.now ?? new Date();
  return db.$transaction(async (tx) => {
    const c = await tx.cycle.findUnique({ where: { id: input.cycleId }, include: { beneficiary: true } });
    if (!c) throw new DomainError("NOT_FOUND", "Tour introuvable.");
    if (c.status !== "PAYOUT_DECLARED") throw new DomainError("NO_PAYOUT_DECLARED", "Aucune remise n'a été déclarée pour ce tour.");
    if (c.beneficiary.userId !== input.actorUserId) throw new DomainError("ONLY_BENEFICIARY", "Seul le bénéficiaire du tour peut confirmer la réception.");

    await tx.cycle.update({ where: { id: c.id }, data: { status: "PAID_OUT", payoutConfirmedAt: now } });
    await tx.reminder.updateMany({ where: { cycleId: c.id, kind: "PAYOUT_CONFIRMATION", status: "QUEUED" }, data: { status: "CANCELLED" } });
    const next = await tx.cycle.findUnique({ where: { tontineId_cycleNumber: { tontineId: c.tontineId, cycleNumber: c.cycleNumber + 1 } } });
    if (next) await tx.cycle.update({ where: { id: next.id }, data: { status: "COLLECTING" } });
    else await tx.tontine.update({ where: { id: c.tontineId }, data: { status: "COMPLETED", completedAt: now } });
    await tx.auditLog.create({
      data: { tontineId: c.tontineId, action: "payout.confirmed", entityType: "Cycle", entityId: c.id, performedById: input.actorUserId,
        details: { amount: c.payoutAmount, nextCycle: next?.cycleNumber ?? null, tontineCompleted: !next } },
    });
    return { nextCycleId: next?.id ?? null, completed: !next };
  });
}

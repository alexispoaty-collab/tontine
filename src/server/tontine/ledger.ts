import type { Tx } from "../db-types";

// Toute écriture comptable s'exécute en READ COMMITTED avec verrous de ligne :
// - READ COMMITTED : après le verrou, chaque lecture voit les validations déjà validées par
//   d'autres transactions (en REPEATABLE READ, l'instantané serait figé et les totaux faux) ;
// - verrous dans un ordre fixe (tour, puis cotisation) : pas d'interblocage, pas de mise à jour perdue.
export const LEDGER_TX = { isolationLevel: "ReadCommitted" as const, timeout: 15_000 };

export async function lockLedger(tx: Tx, cycleId: string, contributionId: string) {
  await tx.$queryRaw`SELECT id FROM cycle WHERE id = ${cycleId} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM contribution WHERE id = ${contributionId} FOR UPDATE`;
}

export async function lockContribution(tx: Tx, contributionId: string) {
  await tx.$queryRaw`SELECT id FROM contribution WHERE id = ${contributionId} FOR UPDATE`;
}

// Les totaux sont toujours recalculés depuis les déclarations validées, jamais incrémentés :
// une erreur passée ne peut pas se propager.
export async function recomputeContribution(tx: Tx, contributionId: string, now: Date) {
  const agg = await tx.paymentDeclaration.aggregate({ where: { contributionId, status: "VALIDATED" }, _sum: { amount: true } });
  const paid = agg._sum.amount ?? 0;
  const c = await tx.contribution.findUniqueOrThrow({ where: { id: contributionId } });
  const due = c.amountDue + c.penaltyAmount;
  const status = paid >= due ? "PAID" : paid > 0 ? "PARTIAL" : "PENDING";
  return tx.contribution.update({
    where: { id: contributionId },
    data: { amountPaid: paid, status, paidAt: status === "PAID" ? (c.paidAt ?? now) : null },
  });
}

export async function recomputeCycle(tx: Tx, cycleId: string) {
  const agg = await tx.paymentDeclaration.aggregate({
    where: { status: "VALIDATED", contribution: { cycleId } },
    _sum: { amount: true },
  });
  return tx.cycle.update({ where: { id: cycleId }, data: { totalCollected: agg._sum.amount ?? 0 } });
}

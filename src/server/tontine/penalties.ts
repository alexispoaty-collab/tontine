import type { Db } from "../db-types";
import { DomainError } from "../errors";
import { requireMember } from "./access";
import { addDays } from "./dates";
import { LEDGER_TX, lockContribution, recomputeContribution } from "./ledger";

// Pas de pénalité par défaut (penaltyAmount = 0). Si la tontine en définit une, elle est appliquée
// une seule fois par cotisation, après l'échéance + le délai de grâce. Appelé par le cron.
export async function applyDuePenalties(db: Db, now = new Date()) {
  const tontines = await db.tontine.findMany({ where: { status: "ACTIVE", penaltyAmount: { gt: 0 } } });
  let applied = 0;
  for (const t of tontines) {
    const cutoff = addDays(now, -t.penaltyGraceDays);
    const late = await db.contribution.findMany({
      where: { penaltyAppliedAt: null, status: { not: "PAID" }, cycle: { tontineId: t.id, dueDate: { lt: cutoff } } },
      select: { id: true },
    });
    for (const { id } of late) {
      await db.$transaction(async (tx) => {
        await lockContribution(tx, id);
        const c = await tx.contribution.findUniqueOrThrow({ where: { id } });
        if (c.penaltyAppliedAt || c.status === "PAID") return; // traité entre-temps
        await tx.contribution.update({ where: { id }, data: { penaltyAmount: t.penaltyAmount, penaltyAppliedAt: now } });
        await recomputeContribution(tx, id, now);
        await tx.auditLog.create({ data: { tontineId: t.id, action: "penalty.applied", entityType: "Contribution", entityId: id, performedById: null, details: { amount: t.penaltyAmount } } });
        applied++;
      }, LEDGER_TX);
    }
  }
  return { applied };
}

// Annulation par le trésorier, motif obligatoire. penaltyAppliedAt est conservé : la pénalité
// ne sera pas réappliquée au passage suivant du cron.
export async function waivePenalty(db: Db, input: { contributionId: string; actorUserId: string; reason: string; now?: Date }) {
  const now = input.now ?? new Date();
  const reason = input.reason?.trim();
  if (!reason) throw new DomainError("REASON_REQUIRED", "Indiquez le motif de l'annulation de la pénalité.");
  return db.$transaction(async (tx) => {
    await lockContribution(tx, input.contributionId);
    const c = await tx.contribution.findUnique({ where: { id: input.contributionId }, include: { cycle: true } });
    if (!c) throw new DomainError("NOT_FOUND", "Cotisation introuvable.");
    await requireMember(tx, c.cycle.tontineId, input.actorUserId, ["TREASURER"]);
    if (!c.penaltyAppliedAt || c.penaltyAmount === 0) throw new DomainError("NO_PENALTY", "Aucune pénalité à annuler sur cette cotisation.");
    await tx.contribution.update({ where: { id: c.id }, data: { penaltyAmount: 0 } });
    const updated = await recomputeContribution(tx, c.id, now);
    await tx.auditLog.create({ data: { tontineId: c.cycle.tontineId, action: "penalty.waived", entityType: "Contribution", entityId: c.id, performedById: input.actorUserId, details: { amount: c.penaltyAmount, reason } } });
    return updated;
  }, LEDGER_TX);
}

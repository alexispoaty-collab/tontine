import type { Db } from "../db-types";
import { DomainError } from "../errors";
import { requireMember } from "./access";
import { computeDueDates } from "./dates";
import { DRAW_ALGORITHM, drawOrder, newDrawSeed } from "./draw";

// Activation : fixe l'ordre (tirage ou ordre manuel), génère tous les tours et toutes les
// cotisations dues, en une seule transaction. Réservée au président.
export async function activateTontine(db: Db, input: { tontineId: string; actorUserId: string; now?: Date }) {
  const { tontineId, actorUserId, now = new Date() } = input;
  return db.$transaction(
    async (tx) => {
      const t = await tx.tontine.findUnique({ where: { id: tontineId }, include: { members: true } });
      if (!t) throw new DomainError("NOT_FOUND", "Tontine introuvable.");
      if (t.status !== "DRAFT") throw new DomainError("NOT_DRAFT", "Seule une tontine en brouillon peut être activée.");
      await requireMember(tx, tontineId, actorUserId, ["PRESIDENT"]);

      const members = t.members;
      if (members.length < 2) throw new DomainError("TOO_FEW_MEMBERS", "Il faut au moins deux membres pour activer la tontine.");
      if (!members.some((m) => m.role === "TREASURER")) throw new DomainError("NO_TREASURER", "Désignez un trésorier avant d'activer la tontine.");
      if (!Number.isInteger(t.contributionAmount) || t.contributionAmount <= 0) {
        throw new DomainError("INVALID_AMOUNT", "Le montant de la cotisation doit être un entier positif.");
      }

      let ordered: typeof members;
      let drawSeed: string | null = null;
      if (t.payoutMode === "DRAW") {
        drawSeed = newDrawSeed();
        const order = drawOrder(members.map((m) => m.id), drawSeed);
        ordered = order.map((id) => members.find((m) => m.id === id)!);
        await tx.tontineMember.updateMany({ where: { tontineId }, data: { payoutPosition: null } });
        for (const [i, m] of ordered.entries()) {
          await tx.tontineMember.update({ where: { id: m.id }, data: { payoutPosition: i + 1 } });
        }
      } else {
        const positions = members.map((m) => m.payoutPosition);
        const complete =
          positions.every((p) => p !== null) &&
          [...(positions as number[])].sort((a, b) => a - b).every((p, i) => p === i + 1);
        if (!complete) throw new DomainError("ORDER_INCOMPLETE", "Le trésorier doit fixer l'ordre de passage de tous les membres avant l'activation.");
        ordered = [...members].sort((a, b) => a.payoutPosition! - b.payoutPosition!);
      }

      const dueDates = computeDueDates(t.startDate, t.frequency, ordered.length, t.timezone);
      if (dueDates[0] <= now) throw new DomainError("START_IN_PAST", "La première échéance est déjà passée : choisissez une date de départ future.");

      for (const [k, beneficiary] of ordered.entries()) {
        const payers = t.beneficiaryContributes ? ordered : ordered.filter((m) => m.id !== beneficiary.id);
        await tx.cycle.create({
          data: {
            tontineId, cycleNumber: k + 1, dueDate: dueDates[k], beneficiaryMemberId: beneficiary.id,
            totalExpected: payers.length * t.contributionAmount,
            status: k === 0 ? "COLLECTING" : "PENDING",
            contributions: { create: payers.map((p) => ({ memberId: p.id, amountDue: t.contributionAmount })) },
          },
        });
      }

      await tx.tontine.update({
        where: { id: tontineId },
        data: { status: "ACTIVE", activatedAt: now, ...(drawSeed ? { drawSeed, drawAlgorithm: DRAW_ALGORITHM, drawnAt: now } : {}) },
      });
      await tx.auditLog.create({
        data: {
          tontineId, action: "tontine.activated", performedById: actorUserId,
          details: { payoutMode: t.payoutMode, order: ordered.map((m) => m.id), drawSeed, drawAlgorithm: drawSeed ? DRAW_ALGORITHM : null },
        },
      });
      return { cycles: ordered.length, order: ordered.map((m) => m.id) };
    },
    { timeout: 20_000 },
  );
}

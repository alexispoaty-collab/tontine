import type { Db } from "../db-types";
import { DomainError } from "../errors";
import { requireMember } from "./access";

// Mode MANUAL : le trésorier fixe l'ordre de passage tant que la tontine est en brouillon.
export async function setManualOrder(db: Db, input: { tontineId: string; actorUserId: string; orderedMemberIds: string[] }) {
  const { tontineId, actorUserId, orderedMemberIds } = input;
  return db.$transaction(async (tx) => {
    const t = await tx.tontine.findUnique({ where: { id: tontineId } });
    if (!t) throw new DomainError("NOT_FOUND", "Tontine introuvable.");
    if (t.status !== "DRAFT") throw new DomainError("ORDER_FROZEN", "L'ordre de passage est gelé depuis l'activation de la tontine.");
    if (t.payoutMode !== "MANUAL") throw new DomainError("NOT_MANUAL", "Cette tontine utilise le tirage au sort : l'ordre ne se fixe pas à la main.");
    await requireMember(tx, tontineId, actorUserId, ["TREASURER"]);

    const members = await tx.tontineMember.findMany({ where: { tontineId }, select: { id: true, payoutPosition: true } });
    const known = new Set(members.map((m) => m.id));
    const isPermutation =
      orderedMemberIds.length === members.length &&
      new Set(orderedMemberIds).size === members.length &&
      orderedMemberIds.every((id) => known.has(id));
    if (!isPermutation) throw new DomainError("INVALID_ORDER", "L'ordre doit contenir chaque membre exactement une fois.");

    // Remise à zéro puis réattribution : un échange direct violerait l'unicité (tontine, position).
    await tx.tontineMember.updateMany({ where: { tontineId }, data: { payoutPosition: null } });
    for (const [i, id] of orderedMemberIds.entries()) {
      await tx.tontineMember.update({ where: { id }, data: { payoutPosition: i + 1 } });
    }
    await tx.auditLog.create({
      data: {
        tontineId, action: "order.updated", performedById: actorUserId,
        details: { before: members.map((m) => ({ memberId: m.id, position: m.payoutPosition })), after: orderedMemberIds },
      },
    });
  });
}

import type { Db } from "../db-types";
import { DomainError } from "../errors";
import { requireMember } from "./access";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
export const OVERDUE_MILESTONES_DAYS = [1, 3, 7]; // J+1, J+3, J+7 puis arrêt

type Row = { cycleId: string; recipientMemberId: string; kind: "DUE_SOON" | "OVERDUE" | "PAYOUT_CONFIRMATION"; sequence: number; channel: "WHATSAPP_LINK"; scheduledFor: Date };

// Appelé par le cron. Idempotent : l'unicité (tour, destinataire, type, palier) garantit
// qu'un passage répété du cron ne crée aucun doublon. Si le cron a manqué un palier, seul
// le dernier palier atteint est créé (pas de rafale de messages).
export async function planReminders(db: Db, now = new Date()) {
  const t = now.getTime();
  const unpaid = await db.contribution.findMany({
    where: { status: { not: "PAID" }, cycle: { tontine: { status: "ACTIVE" } } },
    select: { memberId: true, cycleId: true, cycle: { select: { dueDate: true } } },
  });
  const rows: Row[] = [];
  for (const c of unpaid) {
    const due = c.cycle.dueDate.getTime();
    if (t >= due - DAY && t < due) {
      rows.push({ cycleId: c.cycleId, recipientMemberId: c.memberId, kind: "DUE_SOON", sequence: 0, channel: "WHATSAPP_LINK", scheduledFor: now });
    }
    const reached = OVERDUE_MILESTONES_DAYS.filter((d) => t >= due + d * DAY).length;
    if (reached > 0) {
      rows.push({ cycleId: c.cycleId, recipientMemberId: c.memberId, kind: "OVERDUE", sequence: reached, channel: "WHATSAPP_LINK", scheduledFor: now });
    }
  }
  const awaiting = await db.cycle.findMany({
    where: { status: "PAYOUT_DECLARED", payoutDeclaredAt: { lt: new Date(t - DAY) }, tontine: { status: "ACTIVE" } },
    select: { id: true, beneficiaryMemberId: true },
  });
  for (const c of awaiting) {
    rows.push({ cycleId: c.id, recipientMemberId: c.beneficiaryMemberId, kind: "PAYOUT_CONFIRMATION", sequence: 0, channel: "WHATSAPP_LINK", scheduledFor: now });
  }

  const created = rows.length ? (await db.reminder.createMany({ data: rows, skipDuplicates: true })).count : 0;

  // Une relance plus récente remplace les précédentes encore en attente.
  let superseded = 0;
  for (const r of rows.filter((x) => x.kind === "OVERDUE")) {
    superseded += (await db.reminder.updateMany({
      where: { cycleId: r.cycleId, recipientMemberId: r.recipientMemberId, status: "QUEUED", OR: [{ kind: "DUE_SOON" }, { kind: "OVERDUE", sequence: { lt: r.sequence } }] },
      data: { status: "CANCELLED" },
    })).count;
  }

  // Relances devenues sans objet : cotisation soldée entre-temps.
  const queued = await db.reminder.findMany({ where: { status: "QUEUED", kind: { in: ["DUE_SOON", "OVERDUE"] } }, select: { id: true, cycleId: true, recipientMemberId: true } });
  let cancelled = 0;
  for (const r of queued) {
    const c = await db.contribution.findUnique({ where: { cycleId_memberId: { cycleId: r.cycleId, memberId: r.recipientMemberId } }, select: { status: true } });
    if (!c || c.status === "PAID") {
      await db.reminder.update({ where: { id: r.id }, data: { status: "CANCELLED" } });
      cancelled++;
    }
  }
  return { created, superseded, cancelled };
}

// Le trésorier a envoyé la relance via le lien WhatsApp.
export async function markReminderSent(db: Db, input: { reminderId: string; actorUserId: string; now?: Date }) {
  return db.$transaction(async (tx) => {
    const r = await tx.reminder.findUnique({ where: { id: input.reminderId }, include: { cycle: true } });
    if (!r) throw new DomainError("NOT_FOUND", "Relance introuvable.");
    await requireMember(tx, r.cycle.tontineId, input.actorUserId, ["TREASURER", "PRESIDENT"]);
    if (r.status !== "QUEUED") throw new DomainError("NOT_QUEUED", "Cette relance n'est plus à envoyer.");
    return tx.reminder.update({ where: { id: r.id }, data: { status: "SENT", sentAt: input.now ?? new Date(), attempts: { increment: 1 } } });
  });
}

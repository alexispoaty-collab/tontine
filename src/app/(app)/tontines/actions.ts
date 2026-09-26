"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/server/session";
import { DomainError } from "@/server/errors";
import type { ActionResult } from "@/components/action-form";
import type { Frequency, PaymentMethod, PayoutMode } from "@/generated/prisma/client";
import { createTontine, addMember, removeMember, setTreasurer, updateUserName } from "@/server/tontine/setup";
import { setManualOrder } from "@/server/tontine/ordering";
import { activateTontine } from "@/server/tontine/activation";
import { declarePayment, reviewDeclaration, resubmitDeclaration } from "@/server/tontine/payments";
import { declarePayout, confirmPayout } from "@/server/tontine/payout";
import { waivePenalty } from "@/server/tontine/penalties";
import { markReminderSent } from "@/server/tontine/reminders";
import { formatFcfa } from "@/lib/money";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const int = (f: FormData, k: string) => {
  const v = s(f, k).replace(/[\s\u202f.]/g, "");
  return v === "" ? 0 : Number(v);
};
const localDate = (iso: string) => new Date(`${iso}T12:00:00Z`);

// Exécute une action métier : erreur métier -> message affiché ; erreur inattendue -> message générique + journal.
async function run(tontineId: string | null, fn: (userId: string) => Promise<string>): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const message = await fn(user.id);
    revalidatePath(tontineId ? `/tontines/${tontineId}` : "/tontines");
    return { ok: true, message };
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, message: e.message };
    console.error("[action]", e);
    return { ok: false, message: "Erreur inattendue. Réessayez dans un instant." };
  }
}

export async function updateNameAction(_: ActionResult, f: FormData) {
  return run(null, async (uid) => { await updateUserName(prisma, { userId: uid, name: s(f, "name") }); return "Nom enregistré."; });
}

export async function createTontineAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const t = await createTontine(prisma, {
      actorUserId: user.id, name: s(f, "name"), contributionAmount: int(f, "amount"),
      frequency: s(f, "frequency") as Frequency, startDate: s(f, "startDate"),
      payoutMode: s(f, "payoutMode") as PayoutMode, beneficiaryContributes: f.get("beneficiaryContributes") === "on",
      penaltyAmount: int(f, "penaltyAmount"), penaltyGraceDays: int(f, "penaltyGraceDays"),
    });
    revalidatePath("/tontines");
    return { ok: true, message: "Tontine créée.", redirectTo: `/tontines/${t.id}` };
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, message: e.message };
    console.error("[action]", e);
    return { ok: false, message: "Erreur inattendue. Réessayez dans un instant." };
  }
}

export async function addMemberAction(_: ActionResult, f: FormData) {
  const tid = s(f, "tontineId");
  return run(tid, async (uid) => { await addMember(prisma, { tontineId: tid, actorUserId: uid, name: s(f, "name"), phone: s(f, "phone") }); return "Membre ajouté."; });
}
export async function removeMemberAction(_: ActionResult, f: FormData) {
  const tid = s(f, "tontineId");
  return run(tid, async (uid) => { await removeMember(prisma, { tontineId: tid, actorUserId: uid, memberId: s(f, "memberId") }); return "Membre retiré."; });
}
export async function setTreasurerAction(_: ActionResult, f: FormData) {
  const tid = s(f, "tontineId");
  return run(tid, async (uid) => { await setTreasurer(prisma, { tontineId: tid, actorUserId: uid, memberId: s(f, "memberId") }); return "Trésorier désigné."; });
}

// Ordre manuel : déplacement d'un cran vers le haut ou le bas (plus fiable au doigt qu'un glisser-déposer).
export async function moveMemberAction(_: ActionResult, f: FormData) {
  const tid = s(f, "tontineId");
  return run(tid, async (uid) => {
    const members = await prisma.tontineMember.findMany({ where: { tontineId: tid }, orderBy: [{ payoutPosition: "asc" }, { joinedAt: "asc" }] });
    const hasOrder = members.every((m) => m.payoutPosition !== null);
    const ids = (hasOrder ? members : [...members].sort((a, b) => +a.joinedAt - +b.joinedAt)).map((m) => m.id);
    const from = ids.indexOf(s(f, "memberId"));
    const to = s(f, "direction") === "up" ? from - 1 : from + 1;
    if (from >= 0 && to >= 0 && to < ids.length) [ids[from], ids[to]] = [ids[to], ids[from]];
    await setManualOrder(prisma, { tontineId: tid, actorUserId: uid, orderedMemberIds: ids });
    return "Ordre enregistré. Le président peut maintenant activer la tontine.";
  });
}
export async function initOrderAction(_: ActionResult, f: FormData) {
  const tid = s(f, "tontineId");
  return run(tid, async (uid) => {
    const members = await prisma.tontineMember.findMany({ where: { tontineId: tid }, orderBy: { joinedAt: "asc" } });
    await setManualOrder(prisma, { tontineId: tid, actorUserId: uid, orderedMemberIds: members.map((m) => m.id) });
    return "Ordre enregistré dans l'ordre d'arrivée. Ajustez-le avec les flèches : chaque changement est enregistré aussitôt.";
  });
}
export async function activateAction(_: ActionResult, f: FormData) {
  const tid = s(f, "tontineId");
  return run(tid, async (uid) => { const r = await activateTontine(prisma, { tontineId: tid, actorUserId: uid }); return `Tontine activée : ${r.cycles} tours générés.`; });
}

export async function declarePaymentAction(_: ActionResult, f: FormData) {
  const tid = s(f, "tontineId");
  return run(tid, async (uid) => {
    await declarePayment(prisma, { contributionId: s(f, "contributionId"), actorUserId: uid, amount: int(f, "amount"), method: s(f, "method") as PaymentMethod, operatorReference: s(f, "reference"), paidAt: localDate(s(f, "paidAt")), note: s(f, "note") });
    return "Paiement déclaré : le trésorier va le vérifier.";
  });
}
export async function resubmitAction(_: ActionResult, f: FormData) {
  const tid = s(f, "tontineId");
  return run(tid, async (uid) => {
    await resubmitDeclaration(prisma, { declarationId: s(f, "declarationId"), actorUserId: uid, amount: int(f, "amount"), method: s(f, "method") as PaymentMethod, operatorReference: s(f, "reference"), paidAt: localDate(s(f, "paidAt")), note: s(f, "note") });
    return "Déclaration corrigée et renvoyée.";
  });
}
export async function reviewAction(_: ActionResult, f: FormData) {
  const tid = s(f, "tontineId");
  const decision = s(f, "decision") === "REJECT" ? "REJECT" : "VALIDATE";
  return run(tid, async (uid) => {
    await reviewDeclaration(prisma, { declarationId: s(f, "declarationId"), actorUserId: uid, decision, reason: s(f, "reason") });
    return decision === "VALIDATE" ? "Paiement validé." : "Paiement rejeté.";
  });
}
export async function declarePayoutAction(_: ActionResult, f: FormData) {
  const tid = s(f, "tontineId");
  return run(tid, async (uid) => {
    const r = await declarePayout(prisma, { cycleId: s(f, "cycleId"), actorUserId: uid, amount: int(f, "amount"), method: s(f, "method") as PaymentMethod, operatorReference: s(f, "reference") });
    return r.shortfall > 0 ? `Remise déclarée. Collecte incomplète : il manque ${formatFcfa(r.shortfall)}.` : "Remise déclarée : le bénéficiaire doit confirmer la réception.";
  });
}
export async function confirmPayoutAction(_: ActionResult, f: FormData) {
  const tid = s(f, "tontineId");
  return run(tid, async (uid) => {
    const r = await confirmPayout(prisma, { cycleId: s(f, "cycleId"), actorUserId: uid });
    return r.completed ? "Réception confirmée. La tontine est terminée." : "Réception confirmée. Le tour suivant est ouvert.";
  });
}
export async function waivePenaltyAction(_: ActionResult, f: FormData) {
  const tid = s(f, "tontineId");
  return run(tid, async (uid) => { await waivePenalty(prisma, { contributionId: s(f, "contributionId"), actorUserId: uid, reason: s(f, "reason") }); return "Pénalité annulée."; });
}
export async function markSentAction(_: ActionResult, f: FormData) {
  const tid = s(f, "tontineId");
  return run(tid, async (uid) => { await markReminderSent(prisma, { reminderId: s(f, "reminderId"), actorUserId: uid }); return "Relance marquée comme envoyée."; });
}

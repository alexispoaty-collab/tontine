import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { db, resetDb, makeTontine, makeUser, expectDomainError } from "./helpers";
import { computeDueDates } from "../src/server/tontine/dates";
import { drawOrder } from "../src/server/tontine/draw";
import { setManualOrder } from "../src/server/tontine/ordering";
import { activateTontine } from "../src/server/tontine/activation";
import { declarePayment, reviewDeclaration, resubmitDeclaration } from "../src/server/tontine/payments";
import { declarePayout, confirmPayout } from "../src/server/tontine/payout";
import { applyDuePenalties, waivePenalty } from "../src/server/tontine/penalties";
import { planReminders, markReminderSent } from "../src/server/tontine/reminders";
import { whatsappLink, reminderText } from "../src/server/notifications/whatsapp-link";

const NOW = new Date("2029-12-01T10:00:00Z");
const iso = (d: Date) => d.toISOString();

before(resetDb);
after(() => db.$disconnect());

// ---------- Échéances ----------
test("mensuel depuis le 31 janvier : fin février (bissextile) puis retour au 31", () => {
  const d = computeDueDates(new Date("2028-01-31"), "MONTHLY", 4, "Africa/Libreville");
  assert.deepEqual(d.map(iso), ["2028-01-31T22:59:00.000Z", "2028-02-29T22:59:00.000Z", "2028-03-31T22:59:00.000Z", "2028-04-30T22:59:00.000Z"]);
});
test("mensuel année non bissextile : 28 février", () => {
  assert.equal(iso(computeDueDates(new Date("2027-01-30"), "MONTHLY", 2, "Africa/Libreville")[1]), "2027-02-28T22:59:00.000Z");
});
test("passage d'année et fréquences hebdo / deux semaines", () => {
  assert.equal(iso(computeDueDates(new Date("2029-11-15"), "MONTHLY", 3, "Africa/Libreville")[2]), "2030-01-15T22:59:00.000Z");
  assert.deepEqual(computeDueDates(new Date("2029-12-28"), "WEEKLY", 2, "Africa/Libreville").map(iso), ["2029-12-28T22:59:00.000Z", "2030-01-04T22:59:00.000Z"]);
  assert.equal(iso(computeDueDates(new Date("2029-12-28"), "BIWEEKLY", 2, "Africa/Libreville")[1]), "2030-01-11T22:59:00.000Z");
});

// ---------- Tirage ----------
test("tirage : rejouable, indépendant de l'ordre d'entrée, sensible à la graine", () => {
  const ids = ["m-a", "m-b", "m-c", "m-d", "m-e", "m-f"];
  const a = drawOrder(ids, "graine1");
  assert.deepEqual(drawOrder([...ids].reverse(), "graine1"), a);
  assert.deepEqual([...a].sort(), ids);
  assert.notDeepEqual(drawOrder(ids, "graine2"), a);
});
test("tirage : répartition sans biais visible (6 000 tirages)", () => {
  const counts: Record<string, number> = { a: 0, b: 0, c: 0 };
  for (let i = 0; i < 6000; i++) counts[drawOrder(["a", "b", "c"], `s${i}`)[0]]++;
  for (const v of Object.values(counts)) assert.ok(v > 1800 && v < 2200, JSON.stringify(counts));
});

// ---------- Ordre manuel + activation ----------
test("ordre manuel : réservé au trésorier, permutation exigée, échange de positions possible", async () => {
  const { t, president, treasurer, users, memberOf } = await makeTontine({ n: 3 });
  const [m1, m2, m3] = users.map((u) => memberOf(u.id).id);
  await expectDomainError(setManualOrder(db, { tontineId: t.id, actorUserId: president.id, orderedMemberIds: [m1, m2, m3] }), "FORBIDDEN");
  await expectDomainError(setManualOrder(db, { tontineId: t.id, actorUserId: treasurer.id, orderedMemberIds: [m1, m1, m3] }), "INVALID_ORDER");
  await setManualOrder(db, { tontineId: t.id, actorUserId: treasurer.id, orderedMemberIds: [m1, m2, m3] });
  await setManualOrder(db, { tontineId: t.id, actorUserId: treasurer.id, orderedMemberIds: [m3, m2, m1] }); // échange 1 <-> 3
  const pos = await db.tontineMember.findMany({ where: { tontineId: t.id }, orderBy: { payoutPosition: "asc" } });
  assert.deepEqual(pos.map((p) => p.id), [m3, m2, m1]);
  assert.equal(await db.auditLog.count({ where: { tontineId: t.id, action: "order.updated" } }), 2);
});

test("activation : refusée sans ordre complet, par un non-président, puis gel de l'ordre", async () => {
  const { t, president, treasurer, users, memberOf } = await makeTontine({ n: 3 });
  const ids = users.map((u) => memberOf(u.id).id);
  await expectDomainError(activateTontine(db, { tontineId: t.id, actorUserId: president.id, now: NOW }), "ORDER_INCOMPLETE");
  await setManualOrder(db, { tontineId: t.id, actorUserId: treasurer.id, orderedMemberIds: [ids[2], ids[0], ids[1]] });
  await expectDomainError(activateTontine(db, { tontineId: t.id, actorUserId: treasurer.id, now: NOW }), "FORBIDDEN");
  const r = await activateTontine(db, { tontineId: t.id, actorUserId: president.id, now: NOW });
  assert.equal(r.cycles, 3);
  const cycles = await db.cycle.findMany({ where: { tontineId: t.id }, orderBy: { cycleNumber: "asc" }, include: { contributions: true } });
  assert.deepEqual(cycles.map((c) => c.beneficiaryMemberId), [ids[2], ids[0], ids[1]]);
  assert.deepEqual(cycles.map((c) => c.status), ["COLLECTING", "PENDING", "PENDING"]);
  assert.ok(cycles.every((c) => c.contributions.length === 3 && c.totalExpected === 75000));
  await expectDomainError(setManualOrder(db, { tontineId: t.id, actorUserId: treasurer.id, orderedMemberIds: ids }), "ORDER_FROZEN");
  await expectDomainError(activateTontine(db, { tontineId: t.id, actorUserId: president.id, now: NOW }), "NOT_DRAFT");
});

test("activation par tirage : graine conservée et tirage rejouable depuis la base", async () => {
  const { t, president } = await makeTontine({ n: 5, payoutMode: "DRAW" });
  const r = await activateTontine(db, { tontineId: t.id, actorUserId: president.id, now: NOW });
  const saved = await db.tontine.findUniqueOrThrow({ where: { id: t.id }, include: { members: true } });
  assert.equal(saved.drawSeed?.length, 64);
  assert.deepEqual(drawOrder(saved.members.map((m) => m.id), saved.drawSeed!), r.order);
});

test("bénéficiaire non cotisant : n-1 cotisations par tour ; date passée refusée", async () => {
  const a = await makeTontine({ n: 4, payoutMode: "DRAW", beneficiaryContributes: false });
  await activateTontine(db, { tontineId: a.t.id, actorUserId: a.president.id, now: NOW });
  const c = await db.cycle.findFirstOrThrow({ where: { tontineId: a.t.id, cycleNumber: 1 }, include: { contributions: true } });
  assert.equal(c.contributions.length, 3);
  assert.equal(c.totalExpected, 75000);
  assert.ok(!c.contributions.some((x) => x.memberId === c.beneficiaryMemberId));
  const b = await makeTontine({ n: 2, payoutMode: "DRAW", startDate: "2020-01-01" });
  await expectDomainError(activateTontine(db, { tontineId: b.t.id, actorUserId: b.president.id, now: NOW }), "START_IN_PAST");
});

// ---------- Paiements ----------
async function activeTontine(o = {}) {
  const f = await makeTontine({ n: 3, payoutMode: "DRAW", ...o });
  await activateTontine(db, { tontineId: f.t.id, actorUserId: f.president.id, now: NOW });
  const cycle1 = await db.cycle.findFirstOrThrow({ where: { tontineId: f.t.id, cycleNumber: 1 }, include: { contributions: true, beneficiary: true } });
  const contribOf = (userId: string) => cycle1.contributions.find((c) => c.memberId === f.memberOf(userId).id)!;
  return { ...f, cycle1, contribOf };
}

test("déclaration : référence exigée pour Airtel/Moov, facultative en espèces, réutilisation bloquée", async () => {
  const { users, contribOf, treasurer } = await activeTontine();
  const m3 = users[2];
  await expectDomainError(declarePayment(db, { contributionId: contribOf(m3.id).id, actorUserId: m3.id, amount: 25000, method: "AIRTEL_MONEY", operatorReference: "  ", paidAt: NOW }), "REFERENCE_REQUIRED");
  const d = await declarePayment(db, { contributionId: contribOf(m3.id).id, actorUserId: m3.id, amount: 25000, method: "AIRTEL_MONEY", operatorReference: " pp2601 .a1 ", paidAt: NOW });
  assert.equal(d.operatorReference, "PP2601.A1");
  await expectDomainError(declarePayment(db, { contributionId: contribOf(treasurer.id).id, actorUserId: treasurer.id, amount: 25000, method: "AIRTEL_MONEY", operatorReference: "pp2601.a1", paidAt: NOW }), "REFERENCE_ALREADY_USED");
  await declarePayment(db, { contributionId: contribOf(treasurer.id).id, actorUserId: treasurer.id, amount: 25000, method: "CASH", paidAt: NOW });
  await expectDomainError(declarePayment(db, { contributionId: contribOf(m3.id).id, actorUserId: m3.id, amount: 0, method: "CASH", paidAt: NOW }), "INVALID_AMOUNT");
});

test("déclaration : un membre ne déclare pas pour un autre ; le trésorier peut le faire pour lui", async () => {
  const { users, contribOf, treasurer } = await activeTontine();
  const [p, , m3] = users;
  await expectDomainError(declarePayment(db, { contributionId: contribOf(p.id).id, actorUserId: m3.id, amount: 25000, method: "CASH", paidAt: NOW }), "FORBIDDEN");
  const d = await declarePayment(db, { contributionId: contribOf(m3.id).id, actorUserId: treasurer.id, amount: 25000, method: "CASH", paidAt: NOW });
  assert.equal(d.declaredById, treasurer.id);
  const outsider = await makeUser("Extérieur");
  await expectDomainError(declarePayment(db, { contributionId: contribOf(m3.id).id, actorUserId: outsider.id, amount: 1, method: "CASH", paidAt: NOW }), "NOT_MEMBER");
});

test("validation : paiements partiels, totaux du tour, auto-validation interdite, double traitement refusé", async () => {
  const { users, contribOf, treasurer, president, cycle1 } = await activeTontine();
  const m3 = users[2];
  const d1 = await declarePayment(db, { contributionId: contribOf(m3.id).id, actorUserId: m3.id, amount: 10000, method: "MOOV_MONEY", operatorReference: "MV-1", paidAt: NOW });
  const r1 = await reviewDeclaration(db, { declarationId: d1.id, actorUserId: treasurer.id, decision: "VALIDATE", now: NOW });
  assert.equal(r1.contribution!.status, "PARTIAL");
  await expectDomainError(reviewDeclaration(db, { declarationId: d1.id, actorUserId: treasurer.id, decision: "VALIDATE" }), "ALREADY_REVIEWED");
  const d2 = await declarePayment(db, { contributionId: contribOf(m3.id).id, actorUserId: m3.id, amount: 15000, method: "MOOV_MONEY", operatorReference: "MV-2", paidAt: NOW });
  const r2 = await reviewDeclaration(db, { declarationId: d2.id, actorUserId: president.id, decision: "VALIDATE", now: NOW });
  assert.equal(r2.contribution!.status, "PAID");
  assert.equal(r2.cycle!.totalCollected, 25000);
  // le trésorier ne valide pas sa propre cotisation ; le président le peut
  const d3 = await declarePayment(db, { contributionId: contribOf(treasurer.id).id, actorUserId: treasurer.id, amount: 25000, method: "CASH", paidAt: NOW });
  await expectDomainError(reviewDeclaration(db, { declarationId: d3.id, actorUserId: treasurer.id, decision: "VALIDATE" }), "SELF_REVIEW");
  await reviewDeclaration(db, { declarationId: d3.id, actorUserId: president.id, decision: "VALIDATE", now: NOW });
  const c = await db.cycle.findUniqueOrThrow({ where: { id: cycle1.id } });
  assert.equal(c.totalCollected, 50000);
  // un simple membre ne valide rien
  const d4 = await declarePayment(db, { contributionId: contribOf(president.id).id, actorUserId: president.id, amount: 25000, method: "CASH", paidAt: NOW });
  await expectDomainError(reviewDeclaration(db, { declarationId: d4.id, actorUserId: m3.id, decision: "VALIDATE" }), "FORBIDDEN");
});

test("rejet : motif obligatoire, puis correction et nouvelle validation avec la même référence", async () => {
  const { users, contribOf, treasurer } = await activeTontine();
  const m3 = users[2];
  const d = await declarePayment(db, { contributionId: contribOf(m3.id).id, actorUserId: m3.id, amount: 20000, method: "AIRTEL_MONEY", operatorReference: "REF-X", paidAt: NOW });
  await expectDomainError(reviewDeclaration(db, { declarationId: d.id, actorUserId: treasurer.id, decision: "REJECT", reason: " " }), "REASON_REQUIRED");
  await reviewDeclaration(db, { declarationId: d.id, actorUserId: treasurer.id, decision: "REJECT", reason: "Montant reçu : 25 000" });
  await resubmitDeclaration(db, { declarationId: d.id, actorUserId: m3.id, amount: 25000, method: "AIRTEL_MONEY", operatorReference: "REF-X", paidAt: NOW });
  const r = await reviewDeclaration(db, { declarationId: d.id, actorUserId: treasurer.id, decision: "VALIDATE", now: NOW });
  assert.equal(r.contribution!.status, "PAID");
});

test("validations simultanées : le verrou de ligne garde des totaux exacts", async () => {
  const { users, contribOf, treasurer } = await activeTontine();
  const m3 = users[2];
  const ds = [];
  for (let i = 0; i < 5; i++) ds.push(await declarePayment(db, { contributionId: contribOf(m3.id).id, actorUserId: m3.id, amount: 5000, method: "CASH", paidAt: NOW }));
  await Promise.all(ds.map((d) => reviewDeclaration(db, { declarationId: d.id, actorUserId: treasurer.id, decision: "VALIDATE", now: NOW })));
  const c = await db.contribution.findUniqueOrThrow({ where: { id: contribOf(m3.id).id } });
  assert.equal(c.amountPaid, 25000);
  assert.equal(c.status, "PAID");
});

test("validations simultanées sur des cotisations différentes du même tour : total du tour exact", async () => {
  const { users, contribOf, treasurer, president, cycle1 } = await activeTontine();
  const ds = [];
  for (const u of users) {
    ds.push({ d: await declarePayment(db, { contributionId: contribOf(u.id).id, actorUserId: u.id, amount: 25000, method: "CASH", paidAt: NOW }), u });
  }
  await Promise.all(ds.map(({ d, u }) => reviewDeclaration(db, { declarationId: d.id, actorUserId: u.id === treasurer.id ? president.id : treasurer.id, decision: "VALIDATE", now: NOW })));
  assert.equal((await db.cycle.findUniqueOrThrow({ where: { id: cycle1.id } })).totalCollected, 75000);
});

test("double validation simultanée de la même déclaration : une seule passe", async () => {
  const { users, contribOf, treasurer, president } = await activeTontine();
  const m3 = users[2];
  const d = await declarePayment(db, { contributionId: contribOf(m3.id).id, actorUserId: m3.id, amount: 25000, method: "CASH", paidAt: NOW });
  const res = await Promise.allSettled([
    reviewDeclaration(db, { declarationId: d.id, actorUserId: treasurer.id, decision: "VALIDATE", now: NOW }),
    reviewDeclaration(db, { declarationId: d.id, actorUserId: president.id, decision: "VALIDATE", now: NOW }),
  ]);
  assert.equal(res.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await db.contribution.findUniqueOrThrow({ where: { id: contribOf(m3.id).id } })).amountPaid, 25000);
});

// ---------- Remise ----------
test("remise : collecte incomplète signalée, seul le bénéficiaire confirme, tour suivant ouvert, fin de tontine", async () => {
  const f = await activeTontine({ n: 2 });
  const cycles = await db.cycle.findMany({ where: { tontineId: f.t.id }, orderBy: { cycleNumber: "asc" }, include: { beneficiary: true } });
  const [c1, c2] = cycles;
  const other = f.users.find((u) => u.id !== c1.beneficiary.userId)!;
  await expectDomainError(declarePayout(db, { cycleId: c2.id, actorUserId: f.treasurer.id, amount: 50000, method: "CASH" }), "CYCLE_NOT_CURRENT");
  await expectDomainError(declarePayout(db, { cycleId: c1.id, actorUserId: f.president.id, amount: 50000, method: "CASH" }), "FORBIDDEN");
  const p = await declarePayout(db, { cycleId: c1.id, actorUserId: f.treasurer.id, amount: 50000, method: "AIRTEL_MONEY", operatorReference: "PAY-1", now: NOW });
  assert.equal(p.shortfall, 50000);
  await expectDomainError(confirmPayout(db, { cycleId: c1.id, actorUserId: other.id }), "ONLY_BENEFICIARY");
  const r1 = await confirmPayout(db, { cycleId: c1.id, actorUserId: c1.beneficiary.userId, now: NOW });
  assert.equal(r1.nextCycleId, c2.id);
  assert.equal((await db.cycle.findUniqueOrThrow({ where: { id: c2.id } })).status, "COLLECTING");
  await declarePayout(db, { cycleId: c2.id, actorUserId: f.treasurer.id, amount: 50000, method: "CASH", now: NOW });
  const r2 = await confirmPayout(db, { cycleId: c2.id, actorUserId: c2.beneficiary.userId, now: NOW });
  assert.equal(r2.completed, true);
  assert.equal((await db.tontine.findUniqueOrThrow({ where: { id: f.t.id } })).status, "COMPLETED");
});

// ---------- Pénalités ----------
test("pénalités : aucune par défaut", async () => {
  const f = await activeTontine();
  const late = new Date(f.cycle1.dueDate.getTime() + 10 * 86_400_000);
  const before = await db.contribution.count({ where: { penaltyAppliedAt: { not: null }, cycle: { tontineId: f.t.id } } });
  await applyDuePenalties(db, late);
  const afterCount = await db.contribution.count({ where: { penaltyAppliedAt: { not: null }, cycle: { tontineId: f.t.id } } });
  assert.equal(afterCount - before, 0);
});

test("pénalités configurées : délai de grâce, application unique, annulation motivée non réappliquée", async () => {
  await resetDb();
  const f = await activeTontine({ penaltyAmount: 2000, penaltyGraceDays: 2 });
  const due = f.cycle1.dueDate.getTime();
  assert.equal((await applyDuePenalties(db, new Date(due + 1 * 86_400_000))).applied, 0); // dans le délai de grâce
  assert.equal((await applyDuePenalties(db, new Date(due + 3 * 86_400_000))).applied, 3);
  assert.equal((await applyDuePenalties(db, new Date(due + 4 * 86_400_000))).applied, 0); // idempotent
  const m3 = f.users[2];
  const c = f.contribOf(m3.id);
  assert.equal((await db.contribution.findUniqueOrThrow({ where: { id: c.id } })).penaltyAmount, 2000);
  // payer 25 000 ne solde pas : il reste la pénalité
  const d = await declarePayment(db, { contributionId: c.id, actorUserId: m3.id, amount: 25000, method: "CASH", paidAt: NOW });
  const r = await reviewDeclaration(db, { declarationId: d.id, actorUserId: f.treasurer.id, decision: "VALIDATE", now: NOW });
  assert.equal(r.contribution!.status, "PARTIAL");
  await expectDomainError(waivePenalty(db, { contributionId: c.id, actorUserId: f.president.id, reason: "x" }), "FORBIDDEN");
  await expectDomainError(waivePenalty(db, { contributionId: c.id, actorUserId: f.treasurer.id, reason: "" }), "REASON_REQUIRED");
  const w = await waivePenalty(db, { contributionId: c.id, actorUserId: f.treasurer.id, reason: "Hospitalisation" });
  assert.equal(w.status, "PAID");
  assert.equal((await applyDuePenalties(db, new Date(due + 9 * 86_400_000))).applied, 0);
});

// ---------- Relances ----------
test("relances : J-1, J+1, J+3, J+7 puis arrêt ; idempotentes ; annulées après paiement", async () => {
  await resetDb();
  const f = await activeTontine();
  const due = f.cycle1.dueDate.getTime();
  const H = 3_600_000, D = 24 * H;
  const at = (ms: number) => planReminders(db, new Date(ms));
  const q = () => db.reminder.findMany({ where: { cycleId: f.cycle1.id }, orderBy: [{ kind: "asc" }, { sequence: "asc" }] });

  assert.equal((await at(due - 2 * D)).created, 0);            // trop tôt
  assert.equal((await at(due - 10 * H)).created, 3);           // J-1 : 3 membres
  assert.equal((await at(due - 9 * H)).created, 0);            // cron rejoué : aucun doublon
  // m3 paie avant l'échéance
  const m3 = f.users[2];
  const d = await declarePayment(db, { contributionId: f.contribOf(m3.id).id, actorUserId: m3.id, amount: 25000, method: "CASH", paidAt: NOW });
  const reviewer = f.memberOf(m3.id).role === "TREASURER" ? f.president : f.treasurer;
  await reviewDeclaration(db, { declarationId: d.id, actorUserId: reviewer.id, decision: "VALIDATE", now: NOW });
  const r1 = await at(due + 1 * D + H);                        // J+1 : 2 retardataires
  assert.equal(r1.created, 2);
  assert.ok(r1.cancelled >= 1);                                 // la relance J-1 de m3 est annulée
  assert.equal((await at(due + 5 * D)).created, 2);            // J+3 (palier 2)
  assert.equal((await at(due + 7 * D + H)).created, 2);        // J+7 (palier 3)
  await at(due + 30 * D);                                        // puis arrêt (pour ce tour)
  assert.equal((await q()).filter((r) => r.kind === "OVERDUE" && r.sequence > 3).length, 0);
  const all = await q();
  const queued = all.filter((r) => r.status === "QUEUED");
  assert.equal(queued.length, 2);
  assert.ok(queued.every((r) => r.kind === "OVERDUE" && r.sequence === 3)); // seules les plus récentes restent à envoyer
  const sent = await markReminderSent(db, { reminderId: queued[0].id, actorUserId: f.treasurer.id });
  assert.equal(sent.status, "SENT");
});

test("relances : cron manqué plusieurs jours → un seul message (dernier palier)", async () => {
  const f = await activeTontine();
  const due = f.cycle1.dueDate.getTime();
  const r = await planReminders(db, new Date(due + 4 * 86_400_000));
  const rows = await db.reminder.findMany({ where: { cycleId: f.cycle1.id } });
  assert.equal(r.created, 3);
  assert.ok(rows.every((x) => x.kind === "OVERDUE" && x.sequence === 2));
});

test("lien WhatsApp : numéro nettoyé, message encodé, montant formaté", () => {
  const txt = reminderText({ kind: "OVERDUE", memberName: "Élodie Mbadinga", tontineName: "Les Sœurs", cycleNumber: 2, remaining: 25000, dueDate: new Date("2030-01-31T22:59:00Z"), appUrl: "https://exemple.test" });
  assert.match(txt, /^Bonjour Élodie, votre cotisation de 25\s000 FCFA pour le tour 2 de « Les Sœurs » était attendue le 31 janvier\./);
  const url = whatsappLink("+241 77 00 00 01", txt);
  assert.ok(url.startsWith("https://wa.me/24177000001?text=Bonjour%20%C3%89lodie"));
});

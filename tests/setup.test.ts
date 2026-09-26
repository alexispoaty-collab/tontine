import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { db, resetDb, makeUser, expectDomainError } from "./helpers";
import { createTontine, addMember, removeMember, setTreasurer, normalizePhone, updateUserName, needsName } from "../src/server/tontine/setup";
import { setManualOrder } from "../src/server/tontine/ordering";
import { activateTontine } from "../src/server/tontine/activation";

before(resetDb);
after(() => db.$disconnect());
const base = { contributionAmount: 25000, frequency: "MONTHLY" as const, startDate: "2031-03-31", payoutMode: "MANUAL" as const, beneficiaryContributes: true, penaltyAmount: 0, penaltyGraceDays: 0 };

test("numéros : format international exigé, espaces tolérés, 00 converti", () => {
  assert.equal(normalizePhone("+241 77 12 34 56"), "+24177123456");
  assert.equal(normalizePhone("0024177123456"), "+24177123456");
  assert.throws(() => normalizePhone("077123456"), /format international/);
});

test("parcours complet brouillon -> activation depuis l'interface", async () => {
  const p = await makeUser("Président Test");
  await expectDomainError(createTontine(db, { ...base, actorUserId: p.id, name: "x" }), "INVALID_NAME");
  const t = await createTontine(db, { ...base, actorUserId: p.id, name: "  Tontine   du quartier " });
  assert.equal(t.name, "Tontine du quartier");
  const a = await addMember(db, { tontineId: t.id, actorUserId: p.id, name: "Awa Test", phone: "+241 66 00 00 01" });
  const b = await addMember(db, { tontineId: t.id, actorUserId: p.id, name: "Brice Test", phone: "+24166000002" });
  await expectDomainError(addMember(db, { tontineId: t.id, actorUserId: p.id, name: "Doublon", phone: "+241 66000001" }), "ALREADY_MEMBER");
  // un simple membre n'ajoute personne
  await expectDomainError(addMember(db, { tontineId: t.id, actorUserId: a.userId, name: "Carl", phone: "+24166000003" }), "FORBIDDEN");
  await expectDomainError(activateTontine(db, { tontineId: t.id, actorUserId: p.id, now: new Date("2030-01-01") }), "NO_TREASURER");
  const pm = await db.tontineMember.findFirstOrThrow({ where: { tontineId: t.id, role: "PRESIDENT" } });
  await expectDomainError(setTreasurer(db, { tontineId: t.id, actorUserId: p.id, memberId: pm.id }), "PRESIDENT_CANNOT_BE_TREASURER");
  await setTreasurer(db, { tontineId: t.id, actorUserId: p.id, memberId: a.id });
  await setTreasurer(db, { tontineId: t.id, actorUserId: p.id, memberId: b.id }); // changement de trésorier
  const roles = await db.tontineMember.findMany({ where: { tontineId: t.id } });
  assert.equal(roles.filter((r) => r.role === "TREASURER").length, 1);
  await setManualOrder(db, { tontineId: t.id, actorUserId: b.userId, orderedMemberIds: [b.id, pm.id, a.id] });
  // ajouter puis retirer un membre remet l'ordre à zéro
  const c = await addMember(db, { tontineId: t.id, actorUserId: b.userId, name: "Carl Test", phone: "+24166000003" });
  await expectDomainError(activateTontine(db, { tontineId: t.id, actorUserId: p.id, now: new Date("2030-01-01") }), "ORDER_INCOMPLETE");
  await removeMember(db, { tontineId: t.id, actorUserId: p.id, memberId: c.id });
  await expectDomainError(removeMember(db, { tontineId: t.id, actorUserId: p.id, memberId: pm.id }), "CANNOT_REMOVE_PRESIDENT");
  await setManualOrder(db, { tontineId: t.id, actorUserId: b.userId, orderedMemberIds: [a.id, b.id, pm.id] });
  const r = await activateTontine(db, { tontineId: t.id, actorUserId: p.id, now: new Date("2030-01-01") });
  assert.equal(r.cycles, 3);
  await expectDomainError(addMember(db, { tontineId: t.id, actorUserId: p.id, name: "Tardif", phone: "+24166000009" }), "NOT_DRAFT");
});

test("compte pré-créé par un autre groupe : le nom saisi remplace le numéro affiché", async () => {
  const p = await makeUser("Présidente Test");
  const t = await createTontine(db, { ...base, actorUserId: p.id, name: "Groupe B" });
  const u = await db.user.create({ data: { name: "+24166000077", phoneNumber: "+24166000077", email: "24166000077@phone.invalid" } });
  assert.equal(needsName(u.name), true);
  await addMember(db, { tontineId: t.id, actorUserId: p.id, name: "Joëlle Test", phone: "+24166000077" });
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: u.id } })).name, "Joëlle Test");
  await expectDomainError(updateUserName(db, { userId: u.id, name: "+241 66" }), "INVALID_NAME");
});

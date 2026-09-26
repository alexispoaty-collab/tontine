import { test, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "./helpers";
import { isCronAuthorized } from "../src/server/cron-auth";
import { GET } from "../src/app/api/cron/reminders/route";

after(() => db.$disconnect());
const KEY = "k".repeat(64);
const req = (h?: string) => new Request("http://x/api/cron/reminders", { headers: h ? { authorization: h } : {} });

test("clé du cron : absente, fausse, trop courte -> refus ; bonne -> accepté", () => {
  assert.equal(isCronAuthorized(req(), KEY), false);
  assert.equal(isCronAuthorized(req(`Bearer ${"x".repeat(64)}`), KEY), false);
  assert.equal(isCronAuthorized(req(`Bearer ${KEY}`), undefined), false);
  assert.equal(isCronAuthorized(req("Bearer court"), "court"), false);
  assert.equal(isCronAuthorized(req(`Bearer ${KEY}`), KEY), true);
});

test("route du cron : 401 sans clé, 200 et compte rendu avec la clé, idempotente", async () => {
  process.env.CRON_SECRET_KEY = KEY;
  assert.equal((await GET(req())).status, 401);
  const r1 = await GET(req(`Bearer ${KEY}`));
  assert.equal(r1.status, 200);
  const b1 = await r1.json();
  assert.ok("penalties" in b1 && "reminders" in b1);
  const b2 = await (await GET(req(`Bearer ${KEY}`))).json();
  assert.equal(b2.reminders.created, 0);
  assert.equal(b2.penalties.applied, 0);
});

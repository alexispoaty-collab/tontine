import { prisma } from "../src/lib/db";
import { tempEmailFor } from "../src/lib/phone";
import type { Frequency, PayoutMode } from "../src/generated/prisma/client";

if (!/test/i.test(process.env.DB_NAME ?? "")) {
  throw new Error("Sécurité : les tests vident la base. DB_NAME doit contenir « test ».");
}
export const db = prisma;

const TABLES = ["reminder", "payment_declaration", "contribution", "cycle", "audit_log", "subscription_invoice", "tontine_member", "tontine", "session", "account", "verification", "user"];
export async function resetDb() {
  for (const t of TABLES) await db.$executeRawUnsafe(`DELETE FROM \`${t}\``);
}

let phoneSeq = 0;
export async function makeUser(name: string) {
  const phone = `+2417700${String(++phoneSeq).padStart(4, "0")}`;
  return db.user.create({ data: { name, phoneNumber: phone, email: tempEmailFor(phone) } });
}

// n membres : [0] président, [1] trésorier, les autres simples membres.
export async function makeTontine(o: { n?: number; payoutMode?: PayoutMode; frequency?: Frequency; startDate?: string; amount?: number; beneficiaryContributes?: boolean; penaltyAmount?: number; penaltyGraceDays?: number } = {}) {
  const n = o.n ?? 3;
  const users = [];
  for (let i = 0; i < n; i++) users.push(await makeUser(`Membre ${i + 1} Test`));
  const t = await db.tontine.create({
    data: {
      name: "Tontine test", contributionAmount: o.amount ?? 25000, frequency: o.frequency ?? "MONTHLY",
      startDate: new Date(o.startDate ?? "2030-01-31"), payoutMode: o.payoutMode ?? "MANUAL",
      beneficiaryContributes: o.beneficiaryContributes ?? true, penaltyAmount: o.penaltyAmount ?? 0, penaltyGraceDays: o.penaltyGraceDays ?? 0,
      createdById: users[0].id,
      members: { create: users.map((u, i) => ({ userId: u.id, role: i === 0 ? "PRESIDENT" : i === 1 ? "TREASURER" : "MEMBER" })) },
    },
    include: { members: true },
  });
  const memberOf = (userId: string) => t.members.find((m) => m.userId === userId)!;
  return { t, users, president: users[0], treasurer: users[1], memberOf };
}

export async function expectDomainError(p: Promise<unknown>, code: string) {
  try { await p; } catch (e: any) {
    if (e?.name === "DomainError" && e.code === code) return e;
    throw new Error(`Attendu DomainError ${code}, reçu : ${e?.code ?? ""} ${e?.message}`);
  }
  throw new Error(`Attendu DomainError ${code}, aucune erreur levée`);
}

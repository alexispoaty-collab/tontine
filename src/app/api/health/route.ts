import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const EXPECTED = [
  "account", "audit_log", "contribution", "cycle", "payment_declaration", "reminder",
  "session", "subscription_invoice", "tontine", "tontine_member", "user", "verification",
];

// Diagnostic de déploiement : variables présentes, base joignable, schéma importé.
// Ne renvoie aucune valeur secrète.
export async function GET() {
  const env = Object.fromEntries(
    ["DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "CRON_SECRET_KEY"]
      .map((k) => [k, Boolean(process.env[k])]),
  );
  try {
    const rows = await prisma.$queryRaw<{ t: string }[]>`
      SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()`;
    const present = rows.map((r) => r.t);
    const missing = EXPECTED.filter((t) => !present.includes(t));
    const ok = missing.length === 0;
    return Response.json({ db: "ok", tables: `${EXPECTED.length - missing.length}/${EXPECTED.length}`, missing, env, ok }, { status: ok ? 200 : 503 });
  } catch (e) {
    return Response.json({ db: "erreur", detail: (e as Error).message.slice(0, 200), env, ok: false }, { status: 503 });
  }
}

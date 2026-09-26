import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

const EXPECTED = [
  "account", "audit_log", "contribution", "cycle", "payment_declaration", "reminder",
  "session", "subscription_invoice", "tontine", "tontine_member", "user", "verification",
];
// Adresse de documentation (RFC 5737) : n'appartient à personne, sert au test d'usurpation.
const PROBE_IP = "203.0.113.7";

const isPrivate = (ip: string) =>
  /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|::1$|f[cd][0-9a-f]{2}:|fe80:)/i.test(ip);

// Public : uniquement {"ok": true|false}, plus le résultat du test d'usurpation si la requête
// porte l'en-tête X-Real-IP: 203.0.113.7. Détail complet : administrateur de la plateforme connecté.
export async function GET(req: Request) {
  let ok = false;
  let detail: Record<string, unknown> = {};
  try {
    const rows = await prisma.$queryRaw<{ t: string }[]>`
      SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()`;
    const present = rows.map((r) => r.t);
    const missing = EXPECTED.filter((t) => !present.includes(t));
    ok = missing.length === 0;
    detail = { db: "ok", tables: `${EXPECTED.length - missing.length}/${EXPECTED.length}`, missing };
  } catch (e) {
    detail = { db: "erreur", detail: (e as Error).message.slice(0, 200) };
  }

  const realIp = req.headers.get("x-real-ip")?.trim() ?? "";
  const probe = realIp === PROBE_IP || req.headers.get("x-forwarded-for")?.includes(PROBE_IP)
    ? { probe: { xRealIpKeptFromClient: realIp === PROBE_IP } } // true = en-tête usurpable, ne pas l'utiliser
    : {};

  const session = await auth.api.getSession({ headers: await headers() }).catch(() => null);
  const admin = session ? await prisma.user.findUnique({ where: { id: session.user.id }, select: { platformRole: true } }) : null;
  if (admin?.platformRole !== "ADMIN") return Response.json({ ok, ...probe }, { status: ok ? 200 : 503 });

  const env = Object.fromEntries(
    ["DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "CRON_SECRET_KEY", "OTP_DEBUG"]
      .map((k) => [k, Boolean(process.env[k])]),
  );
  // Chaîne X-Forwarded-For décrite sans afficher aucune adresse.
  const chain = (req.headers.get("x-forwarded-for") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const ip = {
    xForwardedFor: chain.map((a) => (isPrivate(a) ? "privée" : "publique")),
    xRealIpPositionInChain: realIp ? chain.indexOf(realIp) : null, // 0 = première adresse (le visiteur)
    xRealIpIsPrivate: realIp ? isPrivate(realIp) : null,
  };
  return Response.json({ ok, ...detail, env, ip, ...probe }, { status: ok ? 200 : 503 });
}

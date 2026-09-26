import { createHash, timingSafeEqual } from "node:crypto";

// Vérifie l'en-tête « Authorization: Bearer <CRON_SECRET_KEY> ».
// Comparaison à temps constant (sur des empreintes de même longueur) : la durée de la
// vérification ne renseigne pas sur la clé.
export function isCronAuthorized(req: Request, secret = process.env.CRON_SECRET_KEY): boolean {
  if (!secret || secret.length < 32) return false; // clé absente ou trop faible : tout est refusé
  const header = req.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const h = (s: string) => createHash("sha256").update(s).digest();
  return given.length > 0 && timingSafeEqual(h(given), h(secret));
}

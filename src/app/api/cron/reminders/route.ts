import { prisma } from "@/lib/db";
import { isCronAuthorized } from "@/server/cron-auth";
import { applyDuePenalties } from "@/server/tontine/penalties";
import { planReminders } from "@/server/tontine/reminders";

export const dynamic = "force-dynamic";

// Appelée chaque heure par la tâche planifiée hPanel. Idempotente : l'appeler deux fois
// de suite ne crée ni pénalité ni relance en double.
// 1. applique les pénalités échues (tontines qui en ont défini une) ;
// 2. prépare les relances (J-1, J+1, J+3, J+7, confirmation de remise).
async function handle(req: Request) {
  if (!isCronAuthorized(req)) return Response.json({ error: "Non autorisé" }, { status: 401 });
  const now = new Date();
  try {
    const penalties = await applyDuePenalties(prisma, now);
    const reminders = await planReminders(prisma, now);
    const result = { at: now.toISOString(), penalties, reminders };
    console.log("[cron]", JSON.stringify(result));
    return Response.json(result);
  } catch (e) {
    console.error("[cron] échec", e);
    return Response.json({ error: "Échec du traitement" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;

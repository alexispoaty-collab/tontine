import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/server/session";
import { FREQUENCY_LABEL, ROLE_LABEL, formatDate, formatFcfa } from "@/lib/format";
import { DraftView } from "./draft-view";
import { ActiveView } from "./active-view";

export const dynamic = "force-dynamic";

export default async function TontinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const t = await prisma.tontine.findUnique({
    where: { id },
    include: { members: { include: { user: true }, orderBy: [{ payoutPosition: "asc" }, { joinedAt: "asc" }] } },
  });
  const me = t?.members.find((m) => m.userId === user.id);
  if (!t || !me) notFound(); // un non-membre ne voit même pas que la tontine existe

  return (
    <main className="page">
      <h1>{t.name}</h1>
      <p className="muted small" style={{ marginTop: "0.3rem" }}>
        {formatFcfa(t.contributionAmount)} par membre, {FREQUENCY_LABEL[t.frequency].toLowerCase()}. Première échéance le {formatDate(t.startDate)}.
        {t.penaltyAmount > 0 ? ` Pénalité de retard : ${formatFcfa(t.penaltyAmount)} après ${t.penaltyGraceDays} jour(s) de grâce.` : ""}
      </p>
      <p className="small" style={{ margin: "0.5rem 0 0.5rem" }}><span className="chip">Vous : {ROLE_LABEL[me.role].toLowerCase()}</span></p>
      {t.status === "DRAFT" ? <DraftView tontine={t} me={me} /> : <ActiveView tontineId={t.id} me={me} />}
    </main>
  );
}

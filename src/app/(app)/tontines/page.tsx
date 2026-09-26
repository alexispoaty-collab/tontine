import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/server/session";
import { needsName } from "@/server/tontine/setup";
import { ActionForm } from "@/components/action-form";
import { updateNameAction } from "./actions";
import { formatFcfa, FREQUENCY_LABEL, ROLE_LABEL } from "@/lib/format";

export const dynamic = "force-dynamic";
const STATUS = { DRAFT: "En préparation", ACTIVE: "En cours", COMPLETED: "Terminée", CANCELLED: "Annulée" } as const;

export default async function MesTontines() {
  const user = await requireUser();
  const memberships = await prisma.tontineMember.findMany({
    where: { userId: user.id }, include: { tontine: { include: { _count: { select: { members: true } } } } },
    orderBy: { joinedAt: "desc" },
  });
  return (
    <main className="page">
      {needsName(user.name) && (
        <div className="panel" style={{ marginBottom: "1.5rem" }}>
          <h2>Votre nom</h2>
          <p className="small muted" style={{ marginBottom: "0.75rem" }}>Il s'affiche pour les autres membres de vos tontines.</p>
          <ActionForm action={updateNameAction} submit="Enregistrer">
            <label className="field"><span>Nom complet</span><input name="name" required minLength={2} /></label>
          </ActionForm>
        </div>
      )}
      <h1>Mes tontines</h1>
      {memberships.length === 0 ? (
        <p className="muted" style={{ margin: "1rem 0 1.5rem" }}>Vous ne faites partie d'aucune tontine. Créez la vôtre ou demandez à un président de vous ajouter avec votre numéro.</p>
      ) : (
        <ul className="rows" style={{ margin: "1rem 0 1.5rem" }}>
          {memberships.map(({ tontine: t, role }) => (
            <li key={t.id}>
              <Link href={`/tontines/${t.id}`} style={{ textDecoration: "none", flex: 1 }}>
                <strong>{t.name}</strong>
                <span className="small muted" style={{ display: "block" }}>{formatFcfa(t.contributionAmount)}, {FREQUENCY_LABEL[t.frequency].toLowerCase()}, {t._count.members} membres</span>
              </Link>
              <span className="chip">{STATUS[t.status]}{role !== "MEMBER" ? `, ${ROLE_LABEL[role].toLowerCase()}` : ""}</span>
            </li>
          ))}
        </ul>
      )}
      <Link href="/tontines/nouvelle" className="btn btn-primary" style={{ display: "block", textDecoration: "none" }}>Créer une tontine</Link>
    </main>
  );
}

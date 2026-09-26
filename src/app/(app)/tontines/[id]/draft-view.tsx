import { ActionForm } from "@/components/action-form";
import { ROLE_LABEL } from "@/lib/format";
import type { Tontine, TontineMember, User } from "@/generated/prisma/client";
import { addMemberAction, removeMemberAction, setTreasurerAction, moveMemberAction, initOrderAction, activateAction } from "../actions";

type M = TontineMember & { user: User };

export function DraftView({ tontine: t, me }: { tontine: Tontine & { members: M[] }; me: TontineMember }) {
  const isPresident = me.role === "PRESIDENT";
  const isTreasurer = me.role === "TREASURER";
  const canAdd = isPresident || isTreasurer;
  const manual = t.payoutMode === "MANUAL";
  const ordered = t.members.every((m) => m.payoutPosition !== null);
  const hasTreasurer = t.members.some((m) => m.role === "TREASURER");
  const missing = [
    t.members.length < 2 && "au moins deux membres",
    !hasTreasurer && "un trésorier",
    manual && !ordered && "l'ordre de passage",
  ].filter(Boolean) as string[];
  const hid = <input type="hidden" name="tontineId" value={t.id} />;

  return (
    <>
      <p className="warn" style={{ margin: "0.75rem 0 0.5rem" }}>
        Tontine en préparation. Les membres, les rôles et l'ordre seront gelés à l'activation.
      </p>

      <section className="section">
        <h2>Membres et ordre de passage ({t.members.length})</h2>
        {manual && !ordered && t.members.length > 1 && (
          isTreasurer
            ? <ActionForm action={initOrderAction} submit="Fixer l'ordre de passage" tone="quiet" className="mb">{hid}</ActionForm>
            : <p className="small muted" style={{ marginBottom: "0.5rem" }}>L'ordre de passage sera fixé par le trésorier.</p>
        )}
        {manual && ordered && (
          <p className="small muted" style={{ marginBottom: "0.5rem" }}>
            {isTreasurer
              ? "Ordre enregistré. Chaque flèche l'enregistre aussitôt, aucune validation n'est nécessaire."
              : "Ordre fixé par le trésorier."}
            {isPresident && hasTreasurer ? " Vous pouvez activer la tontine en bas de page." : ""}
          </p>
        )}
        {!manual && <p className="small muted" style={{ marginBottom: "0.5rem" }}>L'ordre sera tiré au sort à l'activation. Le tirage pourra être rejoué pour vérification.</p>}
        <ol className="rows">
          {t.members.map((m, i) => (
            <li key={m.id}>
              <div style={{ flex: 1 }}>
                <strong>{manual && ordered ? `${m.payoutPosition}. ` : ""}{m.user.name}</strong>
                <span className="small muted" style={{ display: "block" }}>{m.user.phoneNumber}{m.role !== "MEMBER" ? `, ${ROLE_LABEL[m.role].toLowerCase()}` : ""}</span>
              </div>
              <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
                {manual && ordered && isTreasurer && (
                  <>
                    {i > 0 && <ActionForm action={moveMemberAction} submit="↑" tone="quiet" className="inline">{hid}<input type="hidden" name="memberId" value={m.id} /><input type="hidden" name="direction" value="up" /></ActionForm>}
                    {i < t.members.length - 1 && <ActionForm action={moveMemberAction} submit="↓" tone="quiet" className="inline">{hid}<input type="hidden" name="memberId" value={m.id} /><input type="hidden" name="direction" value="down" /></ActionForm>}
                  </>
                )}
                {isPresident && m.role === "MEMBER" && (
                  <ActionForm action={setTreasurerAction} submit="Trésorier" tone="quiet" className="inline">{hid}<input type="hidden" name="memberId" value={m.id} /></ActionForm>
                )}
                {isPresident && m.role !== "PRESIDENT" && (
                  <ActionForm action={removeMemberAction} submit="Retirer" tone="danger" className="inline">{hid}<input type="hidden" name="memberId" value={m.id} /></ActionForm>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>

      {canAdd && (
        <section className="section">
          <h2>Ajouter un membre</h2>
          <ActionForm action={addMemberAction} submit="Ajouter">
            {hid}
            <label className="field"><span>Nom complet</span><input name="name" required minLength={2} /></label>
            <label className="field"><span>Téléphone, au format international</span><input name="phone" type="tel" defaultValue="+241 " required /></label>
            <p className="small muted">La personne se connectera avec ce numéro. Ajouter ou retirer un membre remet l'ordre de passage à zéro.</p>
          </ActionForm>
        </section>
      )}

      {isPresident && (
        <section className="section">
          <h2>Activer la tontine</h2>
          {missing.length > 0
            ? <p className="small muted">Il manque : {missing.join(", ")}.</p>
            : <ActionForm action={activateAction} submit={manual ? "Activer la tontine" : "Tirer au sort et activer"}>{hid}
                <p className="small muted">Tous les tours et toutes les cotisations seront générés. Cette action est définitive.</p>
              </ActionForm>}
        </section>
      )}
    </>
  );
}

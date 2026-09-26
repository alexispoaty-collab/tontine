import { ActionForm } from "@/components/action-form";
import { createTontineAction } from "../actions";

export default function NouvelleTontine() {
  return (
    <main className="page">
      <h1>Nouvelle tontine</h1>
      <p className="muted small" style={{ margin: "0.4rem 0 1.25rem" }}>Vous en serez le président. Vous ajouterez ensuite les membres et désignerez le trésorier.</p>
      <ActionForm action={createTontineAction} submit="Créer la tontine">
        <label className="field"><span>Nom</span><input name="name" required minLength={2} maxLength={150} placeholder="Tontine des collègues" /></label>
        <label className="field"><span>Cotisation par membre et par tour (FCFA)</span><input name="amount" inputMode="numeric" required pattern="[0-9 ]+" placeholder="25000" /></label>
        <label className="field"><span>Rythme</span>
          <select name="frequency" defaultValue="MONTHLY"><option value="MONTHLY">Chaque mois</option><option value="BIWEEKLY">Toutes les deux semaines</option><option value="WEEKLY">Chaque semaine</option></select>
        </label>
        <label className="field"><span>Date de la première échéance</span><input type="date" name="startDate" required /></label>
        <label className="field"><span>Ordre de passage</span>
          <select name="payoutMode" defaultValue="MANUAL"><option value="MANUAL">Fixé par le trésorier</option><option value="DRAW">Tiré au sort à l'activation</option></select>
        </label>
        <label className="check"><input type="checkbox" name="beneficiaryContributes" defaultChecked /> Le bénéficiaire cotise aussi à son propre tour</label>
        <details>
          <summary>Pénalité de retard (facultative)</summary>
          <div className="form" style={{ marginTop: "0.75rem" }}>
            <label className="field"><span>Montant de la pénalité (FCFA, 0 = aucune)</span><input name="penaltyAmount" inputMode="numeric" defaultValue="0" /></label>
            <label className="field"><span>Délai de grâce après l'échéance (jours)</span><input name="penaltyGraceDays" inputMode="numeric" defaultValue="0" /></label>
          </div>
        </details>
      </ActionForm>
    </main>
  );
}

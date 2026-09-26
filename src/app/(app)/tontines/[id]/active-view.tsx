import { prisma } from "@/lib/db";
import { ActionForm } from "@/components/action-form";
import { MemberStrip } from "@/components/member-strip";
import { formatDate, formatFcfa, formatShortDate, todayIso, METHOD_LABEL } from "@/lib/format";
import { planReminders } from "@/server/tontine/reminders";
import { reminderText, whatsappLink } from "@/server/notifications/whatsapp-link";
import type { TontineMember } from "@/generated/prisma/client";
import { declarePaymentAction, resubmitAction, reviewAction, declarePayoutAction, confirmPayoutAction, waivePenaltyAction, markSentAction } from "../actions";

const CYCLE_STATUS = { PENDING: "À venir", COLLECTING: "En cours", PAYOUT_DECLARED: "Remise à confirmer", PAID_OUT: "Remis" } as const;

function MethodFields({ amount, method = "AIRTEL_MONEY", reference = "", paidAt }: { amount: number; method?: string; reference?: string; paidAt?: boolean }) {
  return (
    <>
      <label className="field"><span>Montant (FCFA)</span><input name="amount" inputMode="numeric" defaultValue={amount} required /></label>
      <label className="field"><span>Moyen de paiement</span>
        <select name="method" defaultValue={method}>{Object.entries(METHOD_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      </label>
      <label className="field"><span>Identifiant de transaction (dans le SMS de confirmation)</span><input name="reference" defaultValue={reference} autoCapitalize="characters" placeholder="Obligatoire pour Airtel et Moov" /></label>
      {paidAt && <label className="field"><span>Date du paiement</span><input type="date" name="paidAt" defaultValue={todayIso()} required /></label>}
    </>
  );
}

export async function ActiveView({ tontineId, me }: { tontineId: string; me: TontineMember }) {
  const manager = me.role === "TREASURER" || me.role === "PRESIDENT";
  if (manager) await planReminders(prisma); // idempotent : tient lieu de cron tant que l'étape 4 n'est pas livrée
  const t = await prisma.tontine.findUniqueOrThrow({
    where: { id: tontineId },
    include: {
      cycles: {
        orderBy: { cycleNumber: "asc" },
        include: {
          beneficiary: { include: { user: true } },
          contributions: { include: { member: { include: { user: true } }, declarations: { orderBy: { declaredAt: "desc" } } } },
        },
      },
    },
  });
  const now = new Date();
  const hid = <input type="hidden" name="tontineId" value={t.id} />;
  const current = t.cycles.find((c) => c.status === "COLLECTING" || c.status === "PAYOUT_DECLARED");
  const allContribs = t.cycles.flatMap((c) => c.contributions.map((x) => ({ ...x, cycle: c })));
  const mine = allContribs.filter((x) => x.memberId === me.id && x.status !== "PAID");
  const myDeclarations = allContribs.filter((x) => x.memberId === me.id).flatMap((x) => x.declarations.map((d) => ({ ...d, cycleNumber: x.cycle.cycleNumber })));
  const pendingReviews = manager ? allContribs.flatMap((x) => x.declarations.filter((d) => d.status === "DECLARED").map((d) => ({ d, x }))) : [];
  const reminders = manager ? await prisma.reminder.findMany({
    where: { status: "QUEUED", cycle: { tontineId: t.id } },
    include: { recipient: { include: { user: true } }, cycle: { include: { contributions: true } } },
    orderBy: { scheduledFor: "asc" },
  }) : [];
  const appUrl = process.env.BETTER_AUTH_URL ?? "";

  return (
    <>
      {t.status === "COMPLETED" && <p className="warn" style={{ marginTop: "0.75rem" }}>Tontine terminée : tous les tours ont été remis.</p>}

      {current && (
        <section className="section">
          <h2>Tour {current.cycleNumber} sur {t.cycles.length}</h2>
          <p className="small muted" style={{ marginBottom: "0.6rem" }}>
            Bénéficiaire : <strong style={{ color: "var(--ink)" }}>{current.beneficiary.user.name}</strong>. Échéance le {formatDate(current.dueDate)}.
          </p>
          <p><span className="amount">{formatFcfa(current.totalCollected)}</span> <span className="muted">sur {formatFcfa(current.totalExpected)}</span></p>
          <div style={{ margin: "0.75rem 0" }}>
            <MemberStrip items={current.contributions.map((c) => ({ name: c.member.user.name, status: c.status, late: current.dueDate < now }))} />
          </div>
          <details>
            <summary>Liste d'émargement</summary>
            <ul className="rows" style={{ marginTop: "0.5rem" }}>
              {current.contributions.map((c) => {
                const late = c.status !== "PAID" && current.dueDate < now;
                return (
                  <li key={c.id}>
                    <span>{c.member.user.name}<span className="small muted" style={{ display: "block" }}>{formatFcfa(c.amountPaid)} / {formatFcfa(c.amountDue + c.penaltyAmount)}{c.penaltyAmount > 0 ? `, dont pénalité ${formatFcfa(c.penaltyAmount)}` : ""}</span></span>
                    <span style={{ display: "grid", gap: "0.3rem", justifyItems: "end" }}>
                      <span className={`chip ${c.status === "PAID" ? "chip-paid" : late ? "chip-late" : ""}`}>{c.status === "PAID" ? "Payé" : late ? "En retard" : c.status === "PARTIAL" ? "Partiel" : "Attendu"}</span>
                      {me.role === "TREASURER" && c.penaltyAmount > 0 && (
                        <details><summary className="small">Annuler la pénalité</summary>
                          <ActionForm action={waivePenaltyAction} submit="Annuler la pénalité" tone="quiet">{hid}<input type="hidden" name="contributionId" value={c.id} />
                            <label className="field"><span>Motif</span><input name="reason" required /></label>
                          </ActionForm>
                        </details>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </details>

          {current.status === "COLLECTING" && me.role === "TREASURER" && (
            <details style={{ marginTop: "1rem" }}>
              <summary>Déclarer la remise de la cagnotte</summary>
              <div style={{ marginTop: "0.75rem" }}>
                {current.totalCollected < current.totalExpected && (
                  <p className="warn" style={{ marginBottom: "0.75rem" }}>Collecte incomplète : il manque {formatFcfa(current.totalExpected - current.totalCollected)}. Vous pouvez remettre la cagnotte quand même, la différence sera tracée.</p>
                )}
                <ActionForm action={declarePayoutAction} submit="Déclarer la remise">{hid}<input type="hidden" name="cycleId" value={current.id} />
                  <MethodFields amount={current.totalCollected} />
                </ActionForm>
              </div>
            </details>
          )}
          {current.status === "PAYOUT_DECLARED" && (
            current.beneficiary.userId === me.userId ? (
              <div className="panel" style={{ marginTop: "1rem" }}>
                <p style={{ marginBottom: "0.75rem" }}>Le trésorier déclare vous avoir remis <strong>{formatFcfa(current.payoutAmount ?? 0)}</strong>{current.payoutMethod ? ` (${METHOD_LABEL[current.payoutMethod]}${current.payoutReference ? `, réf. ${current.payoutReference}` : ""})` : ""}. Confirmez uniquement si vous avez bien reçu cette somme.</p>
                <ActionForm action={confirmPayoutAction} submit="Je confirme avoir reçu la cagnotte">{hid}<input type="hidden" name="cycleId" value={current.id} /></ActionForm>
              </div>
            ) : <p className="warn" style={{ marginTop: "1rem" }}>Remise de {formatFcfa(current.payoutAmount ?? 0)} déclarée par le trésorier, en attente de confirmation par {current.beneficiary.user.name}.</p>
          )}
        </section>
      )}

      {mine.length > 0 && t.status === "ACTIVE" && (
        <section className="section">
          <h2>Déclarer un paiement</h2>
          <p className="small muted" style={{ marginBottom: "0.75rem" }}>Payez le trésorier par Mobile Money ou en espèces, puis déclarez le paiement ici avec l'identifiant de transaction reçu par SMS.</p>
          <ActionForm action={declarePaymentAction} submit="Déclarer mon paiement">{hid}
            <label className="field"><span>Pour le tour</span>
              <select name="contributionId">{mine.map((x) => <option key={x.id} value={x.id}>Tour {x.cycle.cycleNumber}, échéance {formatShortDate(x.cycle.dueDate)}, reste {formatFcfa(x.amountDue + x.penaltyAmount - x.amountPaid)}</option>)}</select>
            </label>
            <MethodFields amount={mine[0].amountDue + mine[0].penaltyAmount - mine[0].amountPaid} paidAt />
            <label className="field"><span>Note (facultative)</span><input name="note" maxLength={500} /></label>
          </ActionForm>
        </section>
      )}

      {myDeclarations.length > 0 && (
        <section className="section">
          <h2>Mes déclarations</h2>
          <ul className="rows">
            {myDeclarations.map((d) => (
              <li key={d.id} style={{ display: "block" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                  <span>Tour {d.cycleNumber} : {formatFcfa(d.amount)}<span className="small muted" style={{ display: "block" }}>{METHOD_LABEL[d.method]}{d.operatorReference ? `, réf. ${d.operatorReference}` : ""}</span></span>
                  <span className={`chip ${d.status === "VALIDATED" ? "chip-paid" : d.status === "REJECTED" ? "chip-rejected" : ""}`}>{d.status === "VALIDATED" ? "Validé" : d.status === "REJECTED" ? "Rejeté" : "À vérifier"}</span>
                </div>
                {d.status === "REJECTED" && (
                  <details style={{ marginTop: "0.5rem" }}><summary className="small">Motif : {d.rejectionReason}. Corriger</summary>
                    <ActionForm action={resubmitAction} submit="Renvoyer la déclaration" className="mt">{hid}<input type="hidden" name="declarationId" value={d.id} />
                      <MethodFields amount={d.amount} method={d.method} reference={d.operatorReference ?? ""} paidAt />
                    </ActionForm>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {manager && (
        <section className="section">
          <h2>Paiements à vérifier ({pendingReviews.length})</h2>
          {pendingReviews.length === 0 ? <p className="small muted">Aucun paiement en attente de vérification.</p> : (
            <ul className="rows">
              {pendingReviews.map(({ d, x }) => (
                <li key={d.id} style={{ display: "block" }}>
                  <p><strong>{x.member.user.name}</strong>, tour {x.cycle.cycleNumber} : {formatFcfa(d.amount)}</p>
                  <p className="small muted">{METHOD_LABEL[d.method]}{d.operatorReference ? `, réf. ${d.operatorReference}` : ""}, payé le {formatShortDate(d.paidAt)}{d.note ? `. « ${d.note} »` : ""}</p>
                  {x.memberId === me.id ? <p className="small muted" style={{ marginTop: "0.4rem" }}>Votre propre paiement : un autre responsable doit le vérifier.</p> : (
                    <div style={{ display: "grid", gap: "0.5rem", marginTop: "0.6rem" }}>
                      <p className="small">Vérifiez que cette référence figure bien dans les SMS reçus sur votre téléphone.</p>
                      <ActionForm action={reviewAction} submit="Valider le paiement">{hid}<input type="hidden" name="declarationId" value={d.id} /><input type="hidden" name="decision" value="VALIDATE" /></ActionForm>
                      <details><summary className="small">Rejeter</summary>
                        <ActionForm action={reviewAction} submit="Rejeter le paiement" tone="danger" className="mt">{hid}<input type="hidden" name="declarationId" value={d.id} /><input type="hidden" name="decision" value="REJECT" />
                          <label className="field"><span>Motif, visible par le membre</span><input name="reason" required /></label>
                        </ActionForm>
                      </details>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {manager && reminders.length > 0 && (
        <section className="section">
          <h2>À relancer ({reminders.length})</h2>
          <ul className="rows">
            {reminders.map((r) => {
              const c = r.cycle.contributions.find((x) => x.memberId === r.recipientMemberId);
              const remaining = c ? c.amountDue + c.penaltyAmount - c.amountPaid : 0;
              const text = reminderText({ kind: r.kind, memberName: r.recipient.user.name, tontineName: t.name, cycleNumber: r.cycle.cycleNumber, remaining, dueDate: r.cycle.dueDate, appUrl });
              return (
                <li key={r.id}>
                  <span>{r.recipient.user.name}<span className="small muted" style={{ display: "block" }}>Tour {r.cycle.cycleNumber}, {r.kind === "DUE_SOON" ? "échéance demain" : r.kind === "OVERDUE" ? "en retard" : "confirmation de réception"}</span></span>
                  <span style={{ display: "grid", gap: "0.3rem", justifyItems: "end" }}>
                    <a className="btn btn-primary btn-inline" href={whatsappLink(r.recipient.user.phoneNumber, text)} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>Ouvrir WhatsApp</a>
                    <ActionForm action={markSentAction} submit="Marquer envoyée" tone="quiet" className="inline">{hid}<input type="hidden" name="reminderId" value={r.id} /></ActionForm>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="section">
        <h2>Calendrier des tours</h2>
        <ol className="rows">
          {t.cycles.map((c) => (
            <li key={c.id}>
              <span>{c.cycleNumber}. {c.beneficiary.user.name}<span className="small muted" style={{ display: "block" }}>{formatDate(c.dueDate)}, {formatFcfa(c.totalCollected)} / {formatFcfa(c.totalExpected)}</span></span>
              <span className={`chip ${c.status === "PAID_OUT" ? "chip-paid" : ""}`}>{CYCLE_STATUS[c.status]}</span>
            </li>
          ))}
        </ol>
        {t.drawSeed && <p className="small muted" style={{ marginTop: "0.75rem", wordBreak: "break-all" }}>Ordre tiré au sort le {formatDate(t.drawnAt!)}. Graine : {t.drawSeed} ({t.drawAlgorithm}).</p>}
      </section>
    </>
  );
}

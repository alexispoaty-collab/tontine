import { formatFcfa } from "../../lib/money";

// Lien « relance en un clic » : ouvre WhatsApp sur le téléphone du trésorier, message pré-rempli.
export const whatsappLink = (phoneE164: string, text: string) =>
  `https://wa.me/${phoneE164.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;

const fmtDate = (d: Date, tz = "Africa/Libreville") =>
  new Intl.DateTimeFormat("fr-FR", { timeZone: tz, day: "numeric", month: "long" }).format(d);

export function reminderText(p: { kind: "DUE_SOON" | "OVERDUE" | "PAYOUT_CONFIRMATION"; memberName: string; tontineName: string; cycleNumber: number; remaining: number; dueDate: Date; appUrl: string }) {
  const first = p.memberName.split(" ")[0];
  if (p.kind === "PAYOUT_CONFIRMATION") {
    return `Bonjour ${first}, la cagnotte du tour ${p.cycleNumber} de « ${p.tontineName} » vous a été remise. Merci de confirmer la réception dans l'application : ${p.appUrl}`;
  }
  const when = p.kind === "DUE_SOON" ? `est attendue le ${fmtDate(p.dueDate)}` : `était attendue le ${fmtDate(p.dueDate)}`;
  return `Bonjour ${first}, votre cotisation de ${formatFcfa(p.remaining)} pour le tour ${p.cycleNumber} de « ${p.tontineName} » ${when}. Après paiement, déclarez l'identifiant de transaction ici : ${p.appUrl}`;
}

export { formatFcfa } from "./money";
const TZ = "Africa/Libreville";
export const formatDate = (d: Date) => new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, day: "numeric", month: "long", year: "numeric" }).format(d);
export const formatShortDate = (d: Date) => new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, day: "numeric", month: "short" }).format(d);
export const todayIso = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
export const FREQUENCY_LABEL = { WEEKLY: "Chaque semaine", BIWEEKLY: "Toutes les deux semaines", MONTHLY: "Chaque mois" } as const;
export const ROLE_LABEL = { PRESIDENT: "Président", TREASURER: "Trésorier", MEMBER: "Membre" } as const;
export const METHOD_LABEL = { AIRTEL_MONEY: "Airtel Money", MOOV_MONEY: "Moov Money", CASH: "Espèces", BANK_TRANSFER: "Virement" } as const;

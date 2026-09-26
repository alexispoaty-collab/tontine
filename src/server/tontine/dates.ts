import type { Frequency } from "../../generated/prisma/client";

type Ymd = { y: number; m: number; d: number };
const DAY_MS = 86_400_000;

// Date calendaire de l'échéance n°k (k = 0 pour le premier tour).
// MONTHLY : même quantième que la date de départ, ramené au dernier jour du mois si besoin
// (départ le 31 → 28/29 février → 31 mars : on repart toujours du quantième d'origine).
// BIWEEKLY : toutes les deux semaines (et non deux fois par mois).
export function dueCalendarDate(start: Ymd, frequency: Frequency, k: number): Ymd {
  if (frequency === "MONTHLY") {
    const total = start.m - 1 + k;
    const y = start.y + Math.floor(total / 12);
    const m = (total % 12) + 1;
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { y, m, d: Math.min(start.d, lastDay) };
  }
  const days = (frequency === "WEEKLY" ? 7 : 14) * k;
  const dt = new Date(Date.UTC(start.y, start.m - 1, start.d + days));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

// Décalage (heure locale − UTC) en ms pour un instant donné.
function tzOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - utcMs;
}

// 23:59 heure locale du jour donné, exprimé en instant UTC.
export function endOfLocalDayUtc({ y, m, d }: Ymd, timeZone: string): Date {
  const naive = Date.UTC(y, m - 1, d, 23, 59, 0);
  return new Date(naive - tzOffsetMs(naive, timeZone));
}

// startDate vient d'une colonne DATE : minuit UTC du jour choisi.
export function computeDueDates(startDate: Date, frequency: Frequency, count: number, timeZone: string): Date[] {
  const start = { y: startDate.getUTCFullYear(), m: startDate.getUTCMonth() + 1, d: startDate.getUTCDate() };
  return Array.from({ length: count }, (_, k) => endOfLocalDayUtc(dueCalendarDate(start, frequency, k), timeZone));
}

export const addDays = (d: Date, days: number) => new Date(d.getTime() + days * DAY_MS);

// Numéros de téléphone : un seul format stocké, E.164 (+ indicatif + numéro, sans espace).
// Gabon (+241) : 8 chiffres après l'indicatif, ex. +241 77 12 34 56 -> +24177123456.
// Formes acceptées et ramenées à ce format : "+241 077 12 34 56" (0 en trop retiré),
// "077 12 34 56" et "77 12 34 56" (saisie locale, +241 ajouté), "00241…".
// Module sans dépendance serveur : utilisé à la fois par la page de connexion et par le serveur.
export function normalizePhone(raw: string): string | null {
  let p = raw.replace(/[\s.\-()\u00a0\u202f]/g, "");
  if (p.startsWith("00")) p = "+" + p.slice(2);
  if (!p.startsWith("+")) {
    if (/^0\d{8}$/.test(p)) p = "+241" + p.slice(1); // 077123456
    else if (/^\d{8}$/.test(p)) p = "+241" + p;      // 77123456
    else return null;
  }
  if (p.startsWith("+241")) {
    let local = p.slice(4);
    if (/^0\d{8}$/.test(local)) local = local.slice(1);
    return /^\d{8}$/.test(local) ? "+241" + local : null;
  }
  return /^\+[1-9]\d{7,14}$/.test(p) ? p : null;
}

// Un numéro est valide s'il est déjà sous sa forme normalisée : empêche la création
// d'un second compte avec une autre écriture du même numéro.
export const isNormalizedPhone = (p: string) => normalizePhone(p) === p;

// Better Auth exige un email : adresse technique sous le TLD réservé .invalid (jamais délivrable).
export const tempEmailFor = (e164: string) => `${e164.replace(/\D/g, "")}@phone.invalid`;

// Better Auth exige un email : adresse technique sous le TLD réservé .invalid (jamais délivrable).
export const tempEmailFor = (e164: string) => `${e164.replace(/\D/g, "")}@phone.invalid`;

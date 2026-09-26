import { createHash, randomBytes } from "node:crypto";

export const DRAW_ALGORITHM = "fisher-yates-sha256-v1";

export const newDrawSeed = () => randomBytes(32).toString("hex");

// Tirage déterministe et rejouable : mêmes identifiants + même graine => même ordre.
// Les identifiants sont d'abord triés, pour que l'ordre d'entrée n'influence rien.
export function drawOrder(memberIds: string[], seed: string): string[] {
  const ids = [...memberIds].sort();
  let counter = 0;
  const randomBelow = (n: number) => {
    const limit = Math.floor(2 ** 32 / n) * n; // rejet des valeurs hautes : aucun biais modulo
    for (;;) {
      const x = createHash("sha256").update(`${seed}:${counter++}`).digest().readUInt32BE(0);
      if (x < limit) return x % n;
    }
  };
  for (let i = ids.length - 1; i > 0; i--) {
    const j = randomBelow(i + 1);
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids;
}

// Montants en FCFA, toujours des entiers.
export const formatFcfa = (n: number) => `${new Intl.NumberFormat("fr-FR").format(n)} FCFA`;

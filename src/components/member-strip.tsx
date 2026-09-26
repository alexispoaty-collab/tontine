// L'élément signature : une case par membre. Pleine = payé, à moitié = partiel, contour = en attente,
// contour ocre = en retard. On voit d'un coup d'œil qui a cotisé, sans lire un seul chiffre.
export type StripItem = { name: string; status: "PAID" | "PARTIAL" | "PENDING"; late: boolean };

export function MemberStrip({ items }: { items: StripItem[] }) {
  const paid = items.filter((i) => i.status === "PAID").length;
  return (
    <div>
      <div className="strip" role="img" aria-label={`${paid} membres sur ${items.length} ont cotisé`}>
        {items.map((i, k) => (
          <span key={k} title={i.name} className={`cell cell-${i.status.toLowerCase()}${i.late && i.status !== "PAID" ? " cell-late" : ""}`} />
        ))}
      </div>
      <p className="strip-caption">{paid} sur {items.length} ont cotisé</p>
    </div>
  );
}

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-16">
      <h1 className="text-4xl font-semibold tracking-tight" style={{ color: "var(--forest)" }}>
        Tontine
      </h1>
      <p className="mt-3 text-lg leading-relaxed" style={{ color: "var(--muted)" }}>
        Cotisations, tours et remises de votre groupe, visibles par tous les membres.
      </p>
      <p className="mt-10 text-sm" style={{ color: "var(--muted)" }}>
        Application en cours de mise en service.{" "}
        <a href="/api/health" className="underline underline-offset-4" style={{ color: "var(--leaf)" }}>
          Vérifier l&apos;état du service
        </a>
      </p>
    </main>
  );
}

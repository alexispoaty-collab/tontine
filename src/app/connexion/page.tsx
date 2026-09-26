"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { normalizePhone } from "@/lib/phone";


export default function Connexion() {
  const router = useRouter();
  const [phone, setPhone] = useState("+241 ");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault(); setError(null);
    const n = normalizePhone(phone);
    if (!n) return setError("Numéro invalide. Exemple attendu : +241 77 12 34 56.");
    setPhone(n); setBusy(true);
    const { error } = await authClient.phoneNumber.sendOtp({ phoneNumber: n });
    setBusy(false);
    if (error) return setError("Envoi du code impossible. Réessayez dans un instant.");
    setStep("code");
  }
  async function verify(e: React.FormEvent) {
    e.preventDefault(); setError(null); setBusy(true);
    const { error } = await authClient.phoneNumber.verify({ phoneNumber: phone, code: code.trim() });
    setBusy(false);
    if (error) return setError("Code incorrect ou expiré. Demandez un nouveau code.");
    router.replace("/tontines"); router.refresh();
  }

  return (
    <main className="page" style={{ paddingTop: "18vh" }}>
      <h1>Tontine</h1>
      <p className="muted" style={{ marginTop: "0.4rem", marginBottom: "2rem" }}>Connectez-vous avec votre numéro de téléphone.</p>
      {step === "phone" ? (
        <form onSubmit={sendCode} className="form">
          <label className="field"><span>Numéro de téléphone</span>
            <input type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
          </label>
          <button className="btn btn-primary" disabled={busy}>{busy ? "Envoi…" : "Recevoir un code"}</button>
        </form>
      ) : (
        <form onSubmit={verify} className="form">
          <label className="field"><span>Code reçu au {phone.trim()}</span>
            <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} required autoFocus />
          </label>
          <button className="btn btn-primary" disabled={busy}>{busy ? "Vérification…" : "Se connecter"}</button>
          <button type="button" className="btn btn-quiet" onClick={() => { setStep("phone"); setCode(""); setError(null); }}>Changer de numéro</button>
        </form>
      )}
      {error && <p role="alert" className="note-err" style={{ marginTop: "1rem" }}>{error}</p>}
    </main>
  );
}

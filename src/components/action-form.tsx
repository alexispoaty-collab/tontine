"use client";
import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

export type ActionResult = { ok: boolean; message?: string } | null;
type Action = (prev: ActionResult, formData: FormData) => Promise<ActionResult>;

function Submit({ children, tone }: { children: ReactNode; tone: "primary" | "quiet" | "danger" }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`btn btn-${tone}`}>
      {pending ? "Un instant…" : children}
    </button>
  );
}

// Formulaire relié à une server action : affiche l'erreur métier ou la confirmation sous le bouton.
export function ActionForm({ action, submit, tone = "primary", children, className = "" }: {
  action: Action; submit: ReactNode; tone?: "primary" | "quiet" | "danger"; children?: ReactNode; className?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className={`form ${className}`}>
      {children}
      <Submit tone={tone}>{submit}</Submit>
      {state && <p role="status" className={state.ok ? "note-ok" : "note-err"}>{state.message}</p>}
    </form>
  );
}

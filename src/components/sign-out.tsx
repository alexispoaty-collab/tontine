"use client";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function SignOut() {
  const router = useRouter();
  return (
    <button className="btn btn-quiet btn-inline" onClick={async () => { await authClient.signOut(); router.replace("/connexion"); router.refresh(); }}>
      Se déconnecter
    </button>
  );
}

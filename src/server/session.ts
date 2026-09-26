import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export async function getUser() {
  const s = await auth.api.getSession({ headers: await headers() });
  return s?.user ?? null;
}

export async function requireUser() {
  const u = await getUser();
  if (!u) redirect("/connexion");
  return u;
}

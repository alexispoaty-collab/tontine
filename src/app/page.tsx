import { redirect } from "next/navigation";
import { getUser } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function Home() {
  redirect((await getUser()) ? "/tontines" : "/connexion");
}

import Link from "next/link";
import { requireUser } from "@/server/session";
import { SignOut } from "@/components/sign-out";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <>
      <header className="page" style={{ paddingBottom: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Link href="/tontines" style={{ fontWeight: 700, textDecoration: "none" }}>Tontine</Link>
        <span className="small muted" style={{ display: "flex", gap: "0.6rem", alignItems: "center" }}>{user.name}<SignOut /></span>
      </header>
      {children}
    </>
  );
}

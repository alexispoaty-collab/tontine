import type { MemberRole } from "../../generated/prisma/client";
import type { Tx } from "../db-types";
import { DomainError } from "../errors";

const LABEL: Record<MemberRole, string> = { PRESIDENT: "président", TREASURER: "trésorier", MEMBER: "membre" };

export async function requireMember(tx: Tx, tontineId: string, userId: string, roles?: MemberRole[]) {
  const m = await tx.tontineMember.findUnique({ where: { tontineId_userId: { tontineId, userId } } });
  if (!m) throw new DomainError("NOT_MEMBER", "Vous n'êtes pas membre de cette tontine.");
  if (roles && !roles.includes(m.role)) {
    throw new DomainError("FORBIDDEN", `Action réservée au ${roles.map((r) => LABEL[r]).join(" ou au ")}.`);
  }
  return m;
}

export const isManager = (role: MemberRole) => role === "TREASURER" || role === "PRESIDENT";

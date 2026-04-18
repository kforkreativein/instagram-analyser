import type { Session } from "next-auth";
import prisma from "@/lib/prisma";

/** Resolve DB user from session — prefer `user.id` (JWT sub), fall back to email. */
export async function getDbUserForSession(session: Session | null) {
  if (!session?.user) return null;
  if (session.user.id) {
    const byId = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (byId) return byId;
  }
  if (session.user.email) {
    return prisma.user.findUnique({ where: { email: session.user.email } });
  }
  return null;
}

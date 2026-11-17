import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, type Role } from "./auth";

/** Server-side gate: every page/route that touches papers must call this. */
export async function requireUser(role?: Role) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  const userRole = (session.user as { role?: Role }).role ?? "teacher";
  if (role === "admin" && userRole !== "admin") redirect("/");
  return { ...session, role: userRole };
}

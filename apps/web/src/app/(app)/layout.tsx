import { requireUser } from "@/lib/session";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, role } = await requireUser();
  const pendingAccounts =
    role === "admin"
      ? (await db.select({ n: sql<number>`count(*)::int` }).from(schema.user).where(eq(schema.user.status, "pending")))[0].n
      : 0;
  return (
    <AppShell user={user} role={role} pendingAccounts={pendingAccounts}>
      {children}
    </AppShell>
  );
}

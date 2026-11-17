import { requireUser } from "@/lib/session";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, role } = await requireUser();
  return (
    <AppShell user={user} role={role}>
      {children}
    </AppShell>
  );
}

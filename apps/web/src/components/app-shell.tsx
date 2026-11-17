import Link from "next/link";
import { Logo } from "./logo";
import { SignOutButton } from "./sign-out-button";
import { Badge } from "./ui/badge";

export function AppShell({
  user,
  role,
  pendingAccounts = 0,
  children,
}: {
  user: { name: string; email: string };
  role: "admin" | "teacher";
  pendingAccounts?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <Link href="/"><Logo /></Link>
          <nav className="flex items-center gap-4 text-sm text-muted-foreground">
            <Link href="/builder" className="hover:text-foreground">My papers</Link>
            {role === "admin" && <Link href="/admin" className="hover:text-foreground">Past papers</Link>}
            {role === "admin" && <Link href="/admin/usage" className="hover:text-foreground">Usage</Link>}
            {role === "admin" && (
              <Link href="/admin/teachers" className="inline-flex items-center gap-1 hover:text-foreground">
                Teachers
                {pendingAccounts > 0 && (
                  <span className="rounded-full bg-amber-500 px-1.5 text-[11px] font-semibold leading-4 text-white" title={`${pendingAccounts} waiting for approval`}>
                    {pendingAccounts}
                  </span>
                )}
              </Link>
            )}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden text-muted-foreground sm:inline">{user.name}</span>
            <Badge variant="secondary">{role}</Badge>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}

import Link from "next/link";
import { Logo } from "./logo";
import { SignOutButton } from "./sign-out-button";
import { Badge } from "./ui/badge";

export function AppShell({
  user,
  role,
  children,
}: {
  user: { name: string; email: string };
  role: "admin" | "teacher";
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <Link href="/"><Logo /></Link>
          <nav className="flex items-center gap-4 text-sm text-muted-foreground">
            <Link href="/builder" className="hover:text-foreground">Builder</Link>
            {role === "admin" && <Link href="/admin" className="hover:text-foreground">Past papers</Link>}
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

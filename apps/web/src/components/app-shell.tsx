import Link from "next/link";
import { Logo } from "./logo";
import { NavLinks, MobileMenu, type NavItem } from "./nav";
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
  const items: NavItem[] = [
    { href: "/builder", label: "My papers" },
    ...(role === "admin"
      ? [
          { href: "/admin", label: "Past papers" },
          { href: "/admin/teachers", label: "Teachers", badge: pendingAccounts },
          { href: "/admin/usage", label: "Usage" },
        ]
      : []),
  ];
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <Link href="/" className="shrink-0"><Logo /></Link>
          <NavLinks items={items} className="hidden lg:flex" />
          <div className="ml-auto hidden items-center gap-3 text-sm lg:flex">
            <span className="max-w-40 truncate text-muted-foreground" title={user.email}>{user.name}</span>
            <Badge variant="secondary">{role}</Badge>
            <SignOutButton />
          </div>
          <MobileMenu items={items} user={user} role={role} />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">{children}</main>
    </div>
  );
}

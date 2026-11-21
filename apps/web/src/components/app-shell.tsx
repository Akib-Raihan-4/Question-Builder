import Link from "next/link";
import { Logo } from "./logo";
import { NavLinks, MobileMenu, UserMenu, type NavItem } from "./nav";

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
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-background px-3 py-2 text-sm font-medium shadow focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <Link href="/" className="shrink-0 rounded-md" aria-label="Papersmith home"><Logo /></Link>
          <NavLinks items={items} className="hidden lg:flex" />
          <div className="ml-auto hidden items-center lg:flex">
            <UserMenu user={user} role={role} />
          </div>
          <MobileMenu items={items} user={user} role={role} />
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto outline-none max-w-6xl px-4 py-6 sm:py-8">{children}</main>
    </div>
  );
}

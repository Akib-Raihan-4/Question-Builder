"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { SignOutButton } from "./sign-out-button";

export type NavItem = { href: string; label: string; badge?: number };

/** "/admin" is active only on its own page, so "/admin/teachers" doesn't light up Past papers too. */
function isActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin" || pathname.startsWith("/admin/papers");
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Count({ n }: { n?: number }) {
  if (!n) return null;
  return (
    <span className="rounded-full bg-amber-500 px-1.5 text-xs font-semibold leading-5 text-white" title={`${n} waiting for approval`}>
      {n}
    </span>
  );
}

export function NavLinks({ items, className }: { items: NavItem[]; className?: string }) {
  const pathname = usePathname();
  return (
    <nav className={cn("items-center gap-1 text-sm", className)}>
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          aria-current={isActive(pathname, i.href) ? "page" : undefined}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 transition-colors",
            isActive(pathname, i.href) ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {i.label}
          <Count n={i.badge} />
        </Link>
      ))}
    </nav>
  );
}

/** Phones and small tablets: a ☰ button that opens the links, the signed-in user and Sign out. */
export function MobileMenu({ items, user, role }: { items: NavItem[]; user: { name: string; email: string }; role: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const waiting = items.reduce((n, i) => n + (i.badge ?? 0), 0);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="ml-auto lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        className="relative inline-flex size-10 items-center justify-center rounded-lg hover:bg-muted"
      >
        <svg viewBox="0 0 24 24" className="size-5" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
        {waiting > 0 && !open && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-amber-500" />}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 top-14 z-40 bg-black/20" onClick={() => setOpen(false)} />
          <div id="mobile-menu" className="fixed inset-x-0 top-14 z-50 border-b bg-background px-4 pb-4 pt-2 shadow-lg">
            <nav className="flex flex-col">
              {items.map((i) => (
                <Link
                  key={i.href}
                  href={i.href}
                  aria-current={isActive(pathname, i.href) ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-center justify-between rounded-lg px-3 text-base",
                    isActive(pathname, i.href) ? "bg-muted font-medium" : "hover:bg-muted",
                  )}
                >
                  {i.label}
                  <Count n={i.badge} />
                </Link>
              ))}
            </nav>
            <div className="mt-3 flex items-center justify-between border-t pt-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{user.name}</div>
                <div className="truncate text-xs text-muted-foreground">{user.email} · {role}</div>
              </div>
              <SignOutButton />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

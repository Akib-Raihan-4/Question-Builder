"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Popover } from "@base-ui/react/popover";
import { cn } from "@/lib/utils";
import { SignOutButton } from "./sign-out-button";
import { Spinner } from "./ui/spinner";

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

/** The link just clicked, until its page arrives — so a slow page never looks like a dead click. */
function usePendingHref() {
  const pathname = usePathname();
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => setPending(null), [pathname]);
  return [pending, setPending] as const;
}

export function NavLinks({ items, className }: { items: NavItem[]; className?: string }) {
  const pathname = usePathname();
  const [pending, setPending] = usePendingHref();
  return (
    <nav className={cn("items-center gap-1 text-sm", className)} aria-label="Main">
      {items.map((i) => {
        const active = isActive(pathname, i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            onClick={() => !active && setPending(i.href)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative inline-flex h-9 items-center gap-1.5 rounded-md px-3 transition-colors",
              active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            {i.label}
            <Count n={i.badge} />
            {pending === i.href && <Spinner className="text-muted-foreground" label={`Opening ${i.label}`} />}
          </Link>
        );
      })}
    </nav>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span aria-hidden className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground", className)}>
      {initials(name)}
    </span>
  );
}

/** Desktop: one account button (initials) that opens who you're signed in as, your account and Sign out. */
export function UserMenu({ user, role }: { user: { name: string; email: string }; role: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        className="inline-flex h-9 items-center gap-2 rounded-full py-0.5 pl-0.5 pr-2.5 text-sm hover:bg-muted aria-expanded:bg-muted"
        aria-label={`Account: ${user.name}`}
      >
        <Avatar name={user.name} />
        <span className="max-w-36 truncate">{user.name}</span>
        <svg viewBox="0 0 16 16" className="size-3.5 text-muted-foreground" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M4 6l4 4 4-4" />
        </svg>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} align="end" className="z-[80]">
          <Popover.Popup className="w-72 rounded-xl border bg-popover p-1.5 text-sm shadow-lg outline-none transition-[scale,opacity] duration-100 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
            <div className="flex items-center gap-3 px-2.5 py-2">
              <Avatar name={user.name} className="size-10 text-sm" />
              <div className="min-w-0">
                <div className="truncate font-medium">{user.name}</div>
                <div className="truncate text-xs text-muted-foreground">{user.email}</div>
                <span className="mt-1 inline-block rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium capitalize text-muted-foreground">{role}</span>
              </div>
            </div>
            <div className="my-1 border-t" />
            <Link href="/account" className="flex items-center rounded-lg px-2.5 py-2 hover:bg-muted">
              Your account
              <span className="ml-auto text-xs text-muted-foreground">Branding · password</span>
            </Link>
            <div className="my-1 border-t" />
            <SignOutButton className="h-9 w-full justify-start px-2.5 text-sm font-normal" />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** Phones and small tablets: a ☰ button that opens the links, the signed-in user and Sign out. */
export function MobileMenu({ items, user, role }: { items: NavItem[]; user: { name: string; email: string }; role: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [pending, setPending] = usePendingHref();
  const waiting = items.reduce((n, i) => n + (i.badge ?? 0), 0);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    // Don't scroll the page behind the open menu.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
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
          <div className="fixed inset-0 top-14 z-40 bg-black/20 animate-fade-in" onClick={() => setOpen(false)} />
          <div id="mobile-menu" className="fixed inset-x-0 top-14 z-50 border-b bg-background px-4 pb-4 pt-2 shadow-lg animate-fade-in">
            <nav className="flex flex-col" aria-label="Main">
              {items.map((i) => {
                const active = isActive(pathname, i.href);
                return (
                  <Link
                    key={i.href}
                    href={i.href}
                    onClick={() => (active ? setOpen(false) : setPending(i.href))}
                    aria-current={active ? "page" : undefined}
                    className={cn("flex min-h-11 items-center gap-2 rounded-lg px-3 text-base", active ? "bg-muted font-medium" : "hover:bg-muted")}
                  >
                    {i.label}
                    <span className="ml-auto flex items-center gap-2">
                      <Count n={i.badge} />
                      {pending === i.href && <Spinner className="text-muted-foreground" label={`Opening ${i.label}`} />}
                    </span>
                  </Link>
                );
              })}
            </nav>
            <div className="mt-3 border-t pt-3">
              <div className="flex items-center gap-3 px-1">
                <Avatar name={user.name} className="size-10 text-sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{user.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {user.email} · <span className="capitalize">{role}</span>
                  </div>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Link href="/account" onClick={() => setPending("/account")} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border text-sm hover:bg-muted">
                  Your account
                  {pending === "/account" && <Spinner className="text-muted-foreground" />}
                </Link>
                <SignOutButton className="h-10 border-border text-sm" />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

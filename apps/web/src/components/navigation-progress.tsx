"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { create } from "zustand";

/**
 * A thin bar at the very top of the window while the next page loads, so a click never feels
 * ignored on a slow connection. It starts by itself on clicks on links inside the app; code that
 * navigates (router.push / replace) calls startNavigation() first. It finishes when the address
 * changes, or after a while if nothing happens (a link to the page you're already on).
 */
const useProgress = create<{ active: number }>(() => ({ active: 0 }));

export function startNavigation() {
  useProgress.setState({ active: Date.now() });
}
export function doneNavigation() {
  useProgress.setState({ active: 0 });
}

function isInternalNavigation(e: MouseEvent) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
  const a = (e.target as Element | null)?.closest?.("a");
  if (!a || a.target === "_blank" || a.hasAttribute("download")) return false;
  const href = a.getAttribute("href");
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return false;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return false;
  // Only the hash changes: no page load.
  return url.pathname !== location.pathname || url.search !== location.search;
}

function Bar() {
  const active = useProgress((s) => s.active);
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);
  const first = useRef(true);

  // Links inside the app start the bar.
  useEffect(() => {
    // Capture phase: Next's <Link> cancels the browser's own navigation before a bubbling
    // listener would see the click.
    const onClick = (e: MouseEvent) => isInternalNavigation(e) && startNavigation();
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // A new address means the page has arrived.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    doneNavigation();
  }, [pathname, search]);

  useEffect(() => {
    if (active) {
      setVisible(true);
      setWidth(8);
      // Creep towards 90% — it never claims to be finished before it is.
      const t = setInterval(() => setWidth((w) => (w < 90 ? w + (90 - w) * 0.08 : w)), 200);
      // Give up quietly if nothing happened (e.g. a link to this same page).
      const stop = setTimeout(doneNavigation, 15000);
      return () => {
        clearInterval(t);
        clearTimeout(stop);
      };
    }
    setWidth(100);
    const hide = setTimeout(() => {
      setVisible(false);
      setWidth(0);
    }, 250);
    return () => clearTimeout(hide);
  }, [active]);

  if (!visible) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5" role="progressbar" aria-label="Loading the page" aria-busy={Boolean(active)}>
      <div
        className="h-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.7)] transition-[width,opacity] duration-200 ease-out"
        style={{ width: `${width}%`, opacity: active ? 1 : 0 }}
      />
    </div>
  );
}

export function NavigationProgress() {
  // useSearchParams needs a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <Bar />
    </Suspense>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * The browser's Back / Forward buttons show the copy of the page from the last visit (Next.js
 * keeps it, and so does the browser's own page cache), so a paper published or renamed meanwhile
 * still showed its old status. Arriving by Back / Forward now asks the server for fresh data
 * (router.refresh keeps scroll and what's typed in place) — as following a link already does.
 *
 * Not on the builder's editing screen: there the paper on screen is the newest copy (changes
 * save a moment later), and reloading it would replace what isn't saved yet.
 */
const EDITORS = [/^\/builder\/[^/]+$/];
const isEditor = () => EDITORS.some((r) => r.test(location.pathname));

export function RefreshOnHistory() {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Next.js handles the same event first and switches the page; refresh just after that.
    const onPop = () => {
      clearTimeout(timer);
      timer = setTimeout(() => !isEditor() && router.refresh(), 50);
    };
    // A page restored whole from the browser's back/forward cache.
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted && !isEditor()) router.refresh();
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("pageshow", onShow);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("pageshow", onShow);
    };
  }, [router]);

  return null;
}

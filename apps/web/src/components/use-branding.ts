"use client";

import { useEffect } from "react";
import { create } from "zustand";
import type { Watermark } from "@/db/schema";

export type ClientBranding = {
  school: string;
  hasLogo: boolean;
  watermark: Watermark;
  updatedAt: string | null;
};

const useStore = create<{ branding: ClientBranding | null; loading: boolean }>(() => ({ branding: null, loading: false }));

export function setBranding(b: ClientBranding) {
  useStore.setState({ branding: b });
}

/** The signed-in teacher's school branding, fetched once and shared. */
export function useBranding() {
  const branding = useStore((s) => s.branding);
  useEffect(() => {
    if (useStore.getState().branding || useStore.getState().loading) return;
    useStore.setState({ loading: true });
    fetch("/api/account/branding")
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => b && setBranding(b))
      .finally(() => useStore.setState({ loading: false }));
  }, []);
  return branding;
}

/** Logo URL that changes when the logo does (so browsers don't show an old one). */
export const logoUrl = (b: ClientBranding) => `/api/account/logo?v=${encodeURIComponent(b.updatedAt ?? "")}`;

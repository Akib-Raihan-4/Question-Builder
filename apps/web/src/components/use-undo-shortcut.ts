"use client";

import { useEffect, useRef } from "react";

/**
 * Ctrl+Z (⌘Z on a Mac) calls `undo` — except while typing in a field, where the browser's own
 * text undo should run.
 */
export function useUndoShortcut(undo: () => void, enabled = true) {
  const ref = useRef(undo);
  ref.current = undo;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== "z") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      e.preventDefault();
      ref.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}

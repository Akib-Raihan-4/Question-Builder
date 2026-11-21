"use client";

import { useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { cn } from "@/lib/utils";

/**
 * In-app replacements for the browser's confirm() and alert(): a confirmation dialog and small
 * notices ("toasts") that fade away. Mounted once in the root layout (<FeedbackHost />).
 */

type Tone = "ok" | "error" | "info";
type Toast = { id: number; text: string; tone: Tone };
type ConfirmOptions = {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button, for deleting things. */
  danger?: boolean;
  /** Extra content under the text (e.g. a value to copy). */
  content?: React.ReactNode;
  /** Only an OK button: a message, not a question. */
  hideCancel?: boolean;
  /** What will be lost, listed under the text ("12 questions and their boxes"). */
  details?: string[];
  /** The exact text to type before the confirm button works (for deletes that can't be undone). */
  typeToConfirm?: string;
};
type ConfirmState = ConfirmOptions & { resolve: (ok: boolean) => void };

const useFeedback = create<{
  toasts: Toast[];
  confirm: ConfirmState | null;
}>(() => ({ toasts: [], confirm: null }));

let nextId = 1;

/** Show a short notice at the bottom of the screen. */
export function toast(text: string, tone: Tone = "ok", ms = tone === "error" ? 6000 : 3500) {
  const id = nextId++;
  useFeedback.setState((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, tone }] }));
  setTimeout(() => useFeedback.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ms);
}

/** Ask the user to confirm. Resolves true (confirmed) or false (cancelled). */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    useFeedback.getState().confirm?.resolve(false);
    useFeedback.setState({ confirm: { ...options, resolve } });
  });
}

function close(ok: boolean) {
  const c = useFeedback.getState().confirm;
  useFeedback.setState({ confirm: null });
  c?.resolve(ok);
}

export function FeedbackHost() {
  const toasts = useFeedback((s) => s.toasts);
  const dialog = useFeedback((s) => s.confirm);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const typedRef = useRef<HTMLInputElement>(null);
  const [typed, setTyped] = useState("");
  const needsTyping = Boolean(dialog?.typeToConfirm);
  const typedOk = !needsTyping || typed.trim().toLowerCase() === dialog!.typeToConfirm!.trim().toLowerCase();

  useEffect(() => {
    if (!dialog) return;
    setTyped("");
    const previous = document.activeElement as HTMLElement | null;
    // Deleting: start on the box to type in, or on Cancel — Enter must never delete by accident.
    if (dialog.typeToConfirm) typedRef.current?.focus();
    else if (dialog.danger && !dialog.hideCancel) cancelRef.current?.focus();
    else confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [dialog]);

  return (
    <>
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className={cn(
              "pointer-events-auto max-w-md rounded-lg px-4 py-2.5 text-sm text-white shadow-lg",
              t.tone === "error" ? "bg-red-600" : t.tone === "info" ? "bg-sky-700" : "bg-zinc-900",
            )}
          >
            {t.text}
          </div>
        ))}
      </div>

      {dialog && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => close(false)}>
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby={dialog.body ? "confirm-body" : undefined}
            className="w-full max-w-sm rounded-xl bg-background p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="confirm-title" className="text-base font-semibold">{dialog.title}</h2>
            {dialog.body && <p id="confirm-body" className="mt-1.5 text-sm text-muted-foreground">{dialog.body}</p>}
            {dialog.details && dialog.details.length > 0 && (
              <ul className={cn("mt-3 space-y-1 rounded-lg px-3 py-2 text-sm", dialog.danger ? "bg-red-50 text-red-900" : "bg-muted text-foreground")}>
                {dialog.details.map((d) => (
                  <li key={d} className="flex gap-2">
                    <span aria-hidden>•</span>
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            )}
            {dialog.content && <div className="mt-3">{dialog.content}</div>}
            {dialog.typeToConfirm && (
              <label className="mt-3 block text-sm">
                <span className="text-muted-foreground">
                  Type <span className="select-all font-mono font-semibold text-foreground">{dialog.typeToConfirm}</span> to confirm
                </span>
                <input
                  ref={typedRef}
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && typedOk && close(true)}
                  autoComplete="off"
                  spellCheck={false}
                  className="mt-1 h-10 w-full rounded-lg border px-3 font-mono text-sm outline-none focus:ring-2 focus:ring-red-300 sm:h-9"
                  aria-label={`Type ${dialog.typeToConfirm} to confirm`}
                />
              </label>
            )}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              {!dialog.hideCancel && (
                <button
                  ref={cancelRef}
                  type="button"
                  onClick={() => close(false)}
                  className="h-10 rounded-lg border px-4 text-sm hover:bg-muted sm:h-9"
                >
                  {dialog.cancelLabel ?? "Cancel"}
                </button>
              )}
              <button
                ref={confirmRef}
                type="button"
                disabled={!typedOk}
                onClick={() => close(true)}
                className={cn(
                  "h-10 rounded-lg px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40 sm:h-9",
                  dialog.danger ? "bg-red-600 hover:bg-red-700" : "bg-primary hover:bg-primary/85",
                )}
              >
                {dialog.confirmLabel ?? "OK"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

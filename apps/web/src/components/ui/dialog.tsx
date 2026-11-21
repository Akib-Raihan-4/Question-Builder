"use client";

import { Dialog as D } from "@base-ui/react/dialog";
import { cn } from "@/lib/utils";

/**
 * A centred dialog (a sheet from the bottom on phones) for short forms like "Rename subject".
 * Escape, the ✕ and a click outside close it; focus stays inside while it's open.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Backdrop className="fixed inset-0 z-[70] bg-black/40 transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <D.Popup
          className={cn(
            "fixed inset-x-0 bottom-0 z-[71] max-h-[90dvh] overflow-y-auto rounded-t-2xl bg-background p-5 shadow-xl outline-none transition-[transform,opacity] duration-150",
            "data-[ending-style]:translate-y-4 data-[ending-style]:opacity-0 data-[starting-style]:translate-y-4 data-[starting-style]:opacity-0",
            "sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[min(32rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl",
            "sm:data-[ending-style]:-translate-y-[48%] sm:data-[starting-style]:-translate-y-[48%]",
            className,
          )}
        >
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <D.Title className="text-base font-semibold">{title}</D.Title>
              {description && <D.Description className="mt-1 text-sm text-muted-foreground">{description}</D.Description>}
            </div>
            <D.Close aria-label="Close" className="-mr-1 -mt-1 inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
              <svg viewBox="0 0 24 24" className="size-4" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </D.Close>
          </div>
          <div className="mt-4">{children}</div>
        </D.Popup>
      </D.Portal>
    </D.Root>
  );
}

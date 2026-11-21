import { cn } from "@/lib/utils";
import { Spinner } from "./ui/spinner";

/**
 * The one "loading" look for documents and screens: a label, a spinner and a bar — the bar shows
 * real progress when it's known (0–1), otherwise a gentle sweep. Used by page skeletons and the
 * screens that then take over, so a page doesn't seem to load twice.
 */
export function LoadingCard({ label, fraction, detail, className }: { label: string; fraction?: number | null; detail?: string; className?: string }) {
  const known = fraction != null;
  return (
    <div className={cn("rounded-lg bg-background/90 px-3 py-2.5 text-sm shadow-sm ring-1 ring-black/5", className)} role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Spinner className="text-primary" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {known && <span className="tabular-nums">{Math.round(fraction * 100)}%</span>}
      </div>
      {detail && <p className="mt-0.5 pl-6 text-xs text-muted-foreground/80">{detail}</p>}
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-200">
        {known ? (
          <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${Math.max(4, fraction * 100)}%` }} />
        ) : (
          <div className="h-full w-1/3 animate-[loading-sweep_1.2s_ease-in-out_infinite] rounded-full bg-primary/70" />
        )}
      </div>
    </div>
  );
}

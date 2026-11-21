import { cn } from "@/lib/utils";
import { LoadingCard } from "./loading-card";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}

/** Placeholder for a normal page while its data loads. */
export function PageSkeleton({ rows = 5, label = "Loading…" }: { rows?: number; label?: string }) {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <div className="divide-y rounded-lg border bg-background">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3">
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Placeholder for the full-height editing screens (review). */
export function ScreenSkeleton({ label }: { label: string }) {
  return (
    <div className="-my-6 ml-[calc(50%-50vw)] flex h-[calc(100dvh-3.5rem-1px)] w-screen flex-col sm:-my-8" aria-busy="true">
      <div className="flex items-center gap-3 border-b bg-background px-4 py-3">
        <Skeleton className="h-5 w-56" />
        <Skeleton className="ml-auto h-7 w-24" />
      </div>
      <div className="flex min-h-0 flex-1 items-start justify-center bg-zinc-200/70 p-6">
        <div className="w-full max-w-2xl space-y-3">
          <LoadingCard label={label} />
          <div className="aspect-[210/297] w-full animate-pulse rounded bg-white/70 shadow-sm ring-1 ring-black/5" />
        </div>
      </div>
    </div>
  );
}

/**
 * The builder while it opens: the same two panes and the same loading card the past-paper pane
 * then shows, so it reads as one load rather than two.
 */
export function BuilderSkeleton() {
  return (
    <div className="-my-6 ml-[calc(50%-50vw)] flex h-[calc(100dvh-3.5rem-1px)] w-screen flex-col sm:-my-8" aria-busy="true">
      <div className="flex items-center gap-3 border-b bg-background px-4 py-2">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="ml-auto h-8 w-20" />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b bg-background px-4 py-2">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-8 w-40" />
          </div>
          <div className="min-h-0 flex-1 bg-zinc-200/70 px-5 py-4">
            <div className="mx-auto max-w-2xl space-y-4">
              <LoadingCard label="Opening your paper…" />
              <div className="aspect-[210/297] w-full animate-pulse rounded bg-white/70 shadow-sm ring-1 ring-black/5" />
            </div>
          </div>
        </div>
        <div className="hidden w-[47%] shrink-0 flex-col border-l bg-background md:flex">
          <div className="space-y-2 border-b px-4 py-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-64" />
          </div>
          <div className="min-h-0 flex-1 bg-zinc-100 p-4">
            <div className="mx-auto h-full max-w-[620px] animate-pulse rounded bg-white shadow-sm ring-1 ring-black/5" />
          </div>
        </div>
      </div>
    </div>
  );
}

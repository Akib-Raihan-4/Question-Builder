import { cn } from "@/lib/utils";

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

/** Placeholder for the full-height editing screens (builder, review). */
export function ScreenSkeleton({ label }: { label: string }) {
  return (
    <div className="-my-6 ml-[calc(50%-50vw)] flex h-[calc(100dvh-3.5rem-1px)] w-screen flex-col sm:-my-8" aria-busy="true" aria-live="polite">
      <div className="flex items-center gap-3 border-b bg-background px-4 py-3">
        <Skeleton className="h-5 w-56" />
        <Skeleton className="ml-auto h-7 w-24" />
      </div>
      <div className="flex min-h-0 flex-1 items-start justify-center bg-zinc-200/70 p-6">
        <div className="w-full max-w-2xl space-y-3">
          <p className="text-sm text-muted-foreground">{label}</p>
          <div className="aspect-[210/297] w-full animate-pulse rounded bg-white/70 shadow-sm ring-1 ring-black/5" />
        </div>
      </div>
    </div>
  );
}

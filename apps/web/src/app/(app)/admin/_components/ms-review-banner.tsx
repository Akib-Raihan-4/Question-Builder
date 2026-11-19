"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { confirmDialog, toast } from "@/components/feedback";
import { Button } from "@/components/ui/button";

type QueueItem = { id: string; paperId: string; label: string; ready: boolean; reason: string | null };

/**
 * Mark schemes waiting for review in this subject. The ones that pass the automatic check
 * (every part linked, the mark scheme's marks equal the paper's) can be published in one go;
 * the rest are listed with what to look at.
 */
export function MsReviewBanner({ subjectId, waiting }: { subjectId: string; waiting: number }) {
  const router = useRouter();
  const [queue, setQueue] = useState<QueueItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!waiting) return setQueue([]);
    let stop = false;
    setQueue(null);
    fetch(`/api/admin/mark-schemes/publish-ready?subjectId=${subjectId}`)
      .then((r) => (r.ok ? r.json() : { queue: [] }))
      .then((b) => !stop && setQueue(b.queue))
      .catch(() => !stop && setQueue([]));
    return () => {
      stop = true;
    };
  }, [subjectId, waiting]);

  if (!waiting) return null;
  const ready = queue?.filter((q) => q.ready) ?? [];
  const notReady = queue?.filter((q) => !q.ready) ?? [];

  async function publishReady() {
    const ok = await confirmDialog({
      title: `Publish ${ready.length} mark scheme${ready.length === 1 ? "" : "s"}?`,
      body: "Each has a row for every part, and its marks match the paper for every part. Teachers can export them straight away. You can still open any of them and unpublish.",
      confirmLabel: "Publish",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/mark-schemes/publish-ready?subjectId=${subjectId}`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't publish");
      toast(`Published ${body.published} mark scheme${body.published === 1 ? "" : "s"}`);
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-amber-950">
            {waiting} mark scheme{waiting === 1 ? "" : "s"} to review
          </p>
          <p className="text-amber-900/80">
            {queue === null
              ? "Checking them…"
              : ready.length
                ? `${ready.length} pass the automatic check: every part has its row and the marks match the paper.`
                : "None pass the automatic check yet — open them below."}
          </p>
        </div>
        {ready.length > 0 && (
          <Button size="sm" disabled={busy} onClick={publishReady}>
            {busy ? "Publishing…" : `Publish ${ready.length} ready`}
          </Button>
        )}
      </div>
      {queue && queue.length > 0 && (
        <ul className="mt-3 space-y-1">
          {[...notReady, ...(showAll ? ready : [])].map((q) => (
            <li key={q.id} className="flex flex-wrap items-baseline gap-x-2">
              <Link href={`/admin/papers/${q.paperId}/mark-scheme`} className="font-medium underline-offset-2 hover:underline">
                {q.label}
              </Link>
              <span className={q.ready ? "text-emerald-700" : "text-amber-900/80"}>{q.ready ? "✓ ready" : q.reason}</span>
            </li>
          ))}
          {ready.length > 0 && (
            <li>
              <button type="button" className="text-xs text-amber-900/70 underline underline-offset-2" onClick={() => setShowAll((s) => !s)}>
                {showAll ? "Hide the ready ones" : `Show the ${ready.length} ready one${ready.length === 1 ? "" : "s"} to spot-check`}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

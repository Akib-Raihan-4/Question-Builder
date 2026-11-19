"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { paperNo } from "@/lib/paper-filename";
import { confirmDialog, toast } from "@/components/feedback";
import { EmptyState } from "@/components/empty-state";

export type PaperRow = {
  id: string;
  subject: string;
  specCode: string;
  paperCode: string;
  series: string;
  year: number;
  tier: string | null;
  status: "uploaded" | "processing" | "needs_review" | "published" | "failed";
  statusReason: string | null;
  pageCount: number | null;
  originalFilename: string | null;
  createdAt: Date;
  questionCount: number;
  /** The paper's mark scheme status, or null when none is uploaded. */
  msStatus: PaperRow["status"] | null;
};

const MS: Record<PaperRow["status"], { label: string; cls: string }> = {
  uploaded: { label: "Uploaded", cls: "text-zinc-600" },
  processing: { label: "Reading…", cls: "text-sky-700" },
  needs_review: { label: "To review", cls: "text-amber-700" },
  published: { label: "✓ Published", cls: "text-emerald-700" },
  failed: { label: "Failed", cls: "text-red-700" },
};

function MsLink({ r }: { r: PaperRow }) {
  return (
    <Link href={`/admin/papers/${r.id}/mark-scheme`} className={cn("text-xs hover:underline", r.msStatus ? MS[r.msStatus].cls : "text-muted-foreground")}>
      {r.msStatus ? MS[r.msStatus].label : "+ Add"}
    </Link>
  );
}

const STATUS: Record<PaperRow["status"], { label: string; cls: string }> = {
  uploaded: { label: "Uploaded", cls: "bg-zinc-100 text-zinc-700" },
  processing: { label: "Processing", cls: "bg-sky-100 text-sky-800" },
  needs_review: { label: "Needs review", cls: "bg-amber-100 text-amber-800" },
  published: { label: "Published", cls: "bg-emerald-100 text-emerald-800" },
  failed: { label: "Failed", cls: "bg-red-100 text-red-800" },
};

export function PapersTable({ rows, subjectName }: { rows: PaperRow[]; subjectName?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | PaperRow["status"]>("all");
  // Subjects with several papers (Maths B Paper 1, Paper 2): show one at a time if wanted.
  const paperNos = [...new Set(rows.map((r) => paperNo(r.paperCode)).filter(Boolean))].sort((a, b) => a - b);
  const [paperFilter, setPaperFilter] = useState(0);
  const active = rows.some((r) => r.status === "processing" || r.status === "uploaded");

  // Poll while anything is processing so statuses update without a manual refresh.
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [active, router]);

  async function act(id: string, kind: "reprocess" | "delete", label: string) {
    if (kind === "delete" && !(await confirmDialog({ title: `Delete ${label}?`, body: "This removes the PDF and all its questions and boxes.", confirmLabel: "Delete", danger: true }))) return;
    setBusy(id);
    const res = await fetch(kind === "delete" ? `/api/admin/papers/${id}` : `/api/admin/papers/${id}/reprocess`, {
      method: kind === "delete" ? "DELETE" : "POST",
    });
    setBusy(null);
    if (!res.ok) toast((await res.json().catch(() => ({}))).error ?? "Something went wrong", "error");
    else toast(kind === "delete" ? `${label} deleted` : `Finding questions in ${label} again…`, kind === "delete" ? "ok" : "info");
    router.refresh();
  }

  const counts = { all: rows.length, needs_review: 0, published: 0, failed: 0, processing: 0 } as Record<string, number>;
  for (const r of rows) counts[r.status === "uploaded" ? "processing" : r.status] = (counts[r.status === "uploaded" ? "processing" : r.status] ?? 0) + 1;
  const shown = rows
    .filter((r) => !paperFilter || paperNo(r.paperCode) === paperFilter)
    .filter((r) => filter === "all" || r.status === filter || (filter === "processing" && r.status === "uploaded"));

  if (rows.length === 0) {
    return (
      <EmptyState title={`No ${subjectName ? `${subjectName} ` : ""}papers yet`}>
        Use <span className="font-medium text-foreground">Upload papers</span> to add one.
      </EmptyState>
    );
  }

  const actions = (r: PaperRow) => {
    const label = `${r.paperCode} ${r.series} ${r.year}`;
    return (
      <>
        {(r.status === "needs_review" || r.status === "published" || r.status === "failed") && (
          <Link
            href={`/admin/papers/${r.id}`}
            className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm text-primary-foreground hover:bg-primary/80 md:h-7 md:px-2 md:text-xs"
          >
            {r.status === "failed" ? "Mark by hand" : r.status === "published" ? "Edit" : "Review"}
          </Link>
        )}
        <a
          href={`/api/papers/${r.id}/file`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-9 items-center rounded-md px-3 text-sm hover:bg-muted md:h-7 md:px-2 md:text-xs"
        >
          PDF
        </a>
        <Button size="sm" variant="ghost" disabled={busy === r.id} onClick={() => act(r.id, "reprocess", label)}>
          Re-run
        </Button>
        <Button size="sm" variant="ghost" className="text-destructive" disabled={busy === r.id} onClick={() => act(r.id, "delete", label)}>
          Delete
        </Button>
      </>
    );
  };

  return (
    <div className="space-y-3">
      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 text-sm" role="tablist" aria-label="Filter by status">
        {(
          [
            ["all", "All"],
            ["needs_review", "Needs review"],
            ["published", "Published"],
            ["processing", "Processing"],
            ["failed", "Failed"],
          ] as const
        )
          .filter(([k]) => k === "all" || counts[k])
          .map(([k, label]) => (
            <button
              key={k}
              role="tab"
              aria-selected={filter === k}
              onClick={() => setFilter(k)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5",
                filter === k ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              {label} <span className="tabular-nums opacity-70">{counts[k]}</span>
            </button>
          ))}
        {paperNos.length > 1 && (
          <div className="ml-auto inline-flex shrink-0 rounded-lg bg-muted p-0.5 text-xs" role="radiogroup" aria-label="Paper">
            {[0, ...paperNos].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={paperFilter === n}
                onClick={() => setPaperFilter(n)}
                className={cn("rounded-md px-2.5 py-1", paperFilter === n ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}
              >
                {n ? `Paper ${n}` : "All papers"}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Phones: one card per paper */}
      <ul className="space-y-2 md:hidden">
        {shown.map((r) => (
          <li key={r.id} className="rounded-xl border bg-background p-3">
            <div className="flex items-start justify-between gap-2">
              <Link href={`/admin/papers/${r.id}`} className="min-w-0">
                <div className="font-medium">
                  {r.paperCode} · {r.series} {r.year}
                </div>
                <div className="text-xs text-muted-foreground">
                  {r.subject}
                  {r.tier ? ` · ${r.tier === "H" ? "Higher" : "Foundation"}` : ""} · {r.questionCount} questions · {r.pageCount ?? "–"} pages
                </div>
              </Link>
              <Badge className={cn("shrink-0", STATUS[r.status].cls)}>{STATUS[r.status].label}</Badge>
            </div>
            {r.statusReason && <p className="mt-1.5 text-xs text-muted-foreground">{r.statusReason}</p>}
            <div className="mt-1.5 text-xs text-muted-foreground">
              Mark scheme: <MsLink r={r} />
            </div>
            <div className="mt-2 flex flex-wrap gap-1">{actions(r)}</div>
          </li>
        ))}
      </ul>

      {/* Tablets and up: a table */}
      <div className="hidden overflow-x-auto rounded-xl border bg-background md:block">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Paper</th>
              <th className="px-4 py-2.5 font-medium">Series</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Mark scheme</th>
              <th className="px-4 py-2.5 text-right font-medium">Questions</th>
              <th className="px-4 py-2.5"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {shown.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="px-4 py-3">
                  <Link href={`/admin/papers/${r.id}`} className="font-medium hover:underline">
                    {r.paperCode}{r.tier ? ` · ${r.tier === "H" ? "Higher" : "Foundation"}` : ""}
                  </Link>
                  <div className="text-xs text-muted-foreground">{r.subject}</div>
                </td>
                <td className="whitespace-nowrap px-4 py-3">{r.series} {r.year}</td>
                <td className="px-4 py-3">
                  <Badge className={STATUS[r.status].cls}>{STATUS[r.status].label}</Badge>
                  {r.statusReason && <p className="mt-1 max-w-xs text-xs text-muted-foreground">{r.statusReason}</p>}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <MsLink r={r} />
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{r.questionCount}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">{actions(r)}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

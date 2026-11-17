"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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
};

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
  const active = rows.some((r) => r.status === "processing" || r.status === "uploaded");

  // Poll while anything is processing so statuses update without a manual refresh.
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [active, router]);

  async function act(id: string, kind: "reprocess" | "delete", label: string) {
    if (kind === "delete" && !confirm(`Delete ${label}? This removes the PDF and its questions.`)) return;
    setBusy(id);
    const res = await fetch(kind === "delete" ? `/api/admin/papers/${id}` : `/api/admin/papers/${id}/reprocess`, {
      method: kind === "delete" ? "DELETE" : "POST",
    });
    setBusy(null);
    if (!res.ok) alert((await res.json().catch(() => ({}))).error ?? "Something went wrong");
    router.refresh();
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
        No {subjectName ? `${subjectName} ` : ""}papers yet. Upload one above.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border bg-background">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-2.5 font-medium">Paper</th>
            <th className="px-4 py-2.5 font-medium">Series</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
            <th className="px-4 py-2.5 text-right font-medium">Pages</th>
            <th className="px-4 py-2.5 text-right font-medium">Questions</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => {
            const label = `${r.paperCode} ${r.series} ${r.year}`;
            return (
              <tr key={r.id} className="align-top">
                <td className="px-4 py-3">
                  <Link href={`/admin/papers/${r.id}`} className="font-medium hover:underline">
                    {r.paperCode}{r.tier ? ` · ${r.tier === "H" ? "Higher" : "Foundation"}` : ""}
                  </Link>
                  <div className="text-xs text-muted-foreground">{r.subject}</div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">{r.series} {r.year}</td>
                <td className="px-4 py-3">
                  <Badge className={STATUS[r.status].cls}>{STATUS[r.status].label}</Badge>
                  {r.statusReason && <p className="mt-1 max-w-xs text-xs text-muted-foreground">{r.statusReason}</p>}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{r.pageCount ?? "–"}</td>
                <td className="px-4 py-3 text-right tabular-nums">{r.questionCount}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    {(r.status === "needs_review" || r.status === "published" || r.status === "failed") && (
                      <Link href={`/admin/papers/${r.id}`} className="inline-flex h-7 items-center rounded-md bg-primary px-2 text-xs text-primary-foreground hover:bg-primary/80">
                        {r.status === "failed" ? "Mark by hand" : "Review"}
                      </Link>
                    )}
                    <a href={`/api/papers/${r.id}/file`} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center rounded-md px-2 text-xs hover:bg-muted">
                      PDF
                    </a>
                    <Button size="sm" variant="ghost" disabled={busy === r.id} onClick={() => act(r.id, "reprocess", label)}>
                      Re-run
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive" disabled={busy === r.id} onClick={() => act(r.id, "delete", label)}>
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

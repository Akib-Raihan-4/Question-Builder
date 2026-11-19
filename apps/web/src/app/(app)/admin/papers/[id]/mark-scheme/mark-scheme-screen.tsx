"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CropCanvas } from "@/components/pdf/crop-canvas";
import { msDocKey } from "@/components/pdf/pdf-cache";
import { confirmDialog, toast } from "@/components/feedback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/empty-state";
import { printedPart } from "@/lib/mark-schemes/link";
import type { MarkSchemeReview, MsRowView } from "@/lib/mark-schemes/server";
import { cn } from "@/lib/utils";

type Q = { id: string; number: number; totalMarks: number; parts: { id: string; label: string; marks: number }[] };

const STATUS: Record<string, [string, string]> = {
  processing: ["Reading…", "bg-sky-100 text-sky-800"],
  uploaded: ["Uploaded", "bg-zinc-100 text-zinc-700"],
  needs_review: ["To review", "bg-amber-100 text-amber-800"],
  published: ["Published", "bg-emerald-100 text-emerald-800"],
  failed: ["Failed", "bg-red-100 text-red-800"],
};

async function call(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Something went wrong");
  return body;
}

/** Admin: upload a paper's mark scheme, check every part has its row, fix links, publish. */
export function MarkSchemeScreen({ paper, questions, initial }: { paper: { id: string; label: string; subject: string; status: string }; questions: Q[]; initial: MarkSchemeReview | null }) {
  const [ms, setMs] = useState(initial);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [width, setWidth] = useState(560);
  const listRef = useRef<HTMLDivElement>(null);
  const base = `/api/admin/papers/${paper.id}/mark-scheme`;

  const reload = useCallback(async () => setMs(await call(base)), [base]);

  // While it's being read, check again every 2 s.
  useEffect(() => {
    if (ms?.status !== "processing") return;
    const t = setInterval(() => void reload().catch(() => {}), 2000);
    return () => clearInterval(t);
  }, [ms?.status, reload]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.min(620, el.clientWidth - 140)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  async function run(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true);
    try {
      await fn();
      await reload();
      if (ok) toast(ok);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File) {
    if (ms && !(await confirmDialog({ title: "Replace the mark scheme?", body: "Its rows are read again from the new file; links you fixed by hand are lost.", confirmLabel: "Replace" }))) return;
    const fd = new FormData();
    fd.append("file", file);
    await run(() => call(base, { method: "POST", body: fd }), "Uploaded — reading the mark scheme…");
  }

  const rowsFor = (qId: string, partId: string | null) => (ms?.rows ?? []).filter((r) => r.questionId === qId && r.partId === partId);
  const unlinked = (ms?.rows ?? []).filter((r) => !r.questionId);
  const missing = new Set(ms?.coverage.missing ?? []);
  const [label, cls] = STATUS[ms?.status ?? "uploaded"];
  const complete = ms && !ms.coverage.missing.length && !ms.coverage.unlinked.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-1">
          <Link href={`/admin/papers/${paper.id}`} className="text-sm text-muted-foreground hover:text-foreground">
            ← {paper.label} questions
          </Link>
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
            Mark scheme {ms && <Badge className={cls}>{label}</Badge>}
          </h1>
          <p className="text-sm text-muted-foreground">
            {paper.subject} · {paper.label}. Each part of each question needs its row from the mark scheme. Teachers can export it once it&apos;s published.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            aria-label="Choose the mark scheme PDF"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void upload(f);
            }}
          />
          <Button variant={ms ? "outline" : "default"} size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
            {ms ? "Replace PDF" : "Upload mark scheme"}
          </Button>
          {ms && (
            <>
              <Button variant="outline" size="sm" disabled={busy || ms.status === "processing"} onClick={() => run(() => call(`${base}/reprocess`, { method: "POST" }), "Reading again…")}>
                Re-read
              </Button>
              {ms.status === "published" ? (
                <Button variant="outline" size="sm" disabled={busy} onClick={() => run(() => call(`${base}/publish`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ publish: false }) }), "Unpublished")}>
                  Unpublish
                </Button>
              ) : (
                <Button
                  size="sm"
                  disabled={busy || !complete || ms.status === "processing"}
                  title={complete ? "Teachers can export this mark scheme" : "Every part needs a row first"}
                  onClick={() => run(() => call(`${base}/publish`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }), "Published — teachers can export it")}
                >
                  Publish
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                disabled={busy}
                onClick={async () =>
                  (await confirmDialog({ title: "Delete this mark scheme?", body: "Its file and rows are removed. The question paper stays.", confirmLabel: "Delete", danger: true })) &&
                  run(() => call(base, { method: "DELETE" }), "Mark scheme deleted")
                }
              >
                Delete
              </Button>
            </>
          )}
        </div>
      </div>

      {!ms ? (
        <EmptyState title="No mark scheme yet" action={<Button onClick={() => fileRef.current?.click()}>Upload mark scheme</Button>}>
          Upload the PDF of this paper&apos;s mark scheme. Its rows are found and matched to the questions automatically.
        </EmptyState>
      ) : (
        <>
          {ms.status === "processing" && <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">Reading the mark scheme… this takes a few seconds.</p>}
          {ms.statusReason && ms.status !== "processing" && (
            <p className={cn("rounded-lg px-3 py-2 text-sm", ms.status === "failed" ? "bg-red-50 text-red-900" : "bg-amber-50 text-amber-900")}>{ms.statusReason}</p>
          )}
          {complete && ms.status !== "published" && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">Every part has its mark scheme row. Check a few below, then Publish.</p>
          )}

          {unlinked.length > 0 && (
            <section className="space-y-2">
              <h2 className="font-medium">Rows not matched to a question ({unlinked.length})</h2>
              {unlinked.map((r) => (
                <RowCard key={r.label} row={r} paperId={paper.id} width={width} questions={questions} busy={busy} onChange={run} base={base} />
              ))}
            </section>
          )}

          <div ref={listRef} className="space-y-4">
            {questions.map((q) => {
              const slots: { partId: string | null; title: string; marks: number }[] = q.parts.length
                ? [...(rowsFor(q.id, null).length ? [{ partId: null, title: `Q${q.number} (whole question)`, marks: q.totalMarks }] : []), ...q.parts.map((p) => ({ partId: p.id, title: `Q${q.number}${printedPart(p.label)}`, marks: p.marks }))]
                : [{ partId: null, title: `Q${q.number}`, marks: q.totalMarks }];
              return (
                <section key={q.id} className="rounded-xl border bg-background">
                  <h2 className="border-b px-4 py-2 font-medium">
                    Question {q.number} <span className="text-sm font-normal text-muted-foreground">· {q.totalMarks} marks</span>
                  </h2>
                  <div className="divide-y">
                    {slots.map((slot) => {
                      const rows = rowsFor(q.id, slot.partId);
                      const isMissing = missing.has(slot.title);
                      return (
                        <div key={slot.partId ?? "whole"} className="flex flex-col gap-2 px-4 py-3 sm:flex-row">
                          <div className="w-32 shrink-0 text-sm">
                            <div className="font-medium">{slot.title}</div>
                            <div className="text-xs text-muted-foreground">{slot.marks} mark{slot.marks === 1 ? "" : "s"}</div>
                            {isMissing && <div className="mt-1 text-xs font-medium text-red-700">No row yet</div>}
                          </div>
                          <div className="min-w-0 flex-1 space-y-2">
                            {rows.map((r) => (
                              <RowCard key={r.label} row={r} paperId={paper.id} width={width} questions={questions} busy={busy} onChange={run} base={base} compact />
                            ))}
                            {!rows.length && !isMissing && <p className="text-xs text-muted-foreground">Covered by the whole-question row.</p>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function RowCard({
  row,
  paperId,
  width,
  questions,
  busy,
  onChange,
  base,
  compact,
}: {
  row: MsRowView;
  paperId: string;
  width: number;
  questions: Q[];
  busy: boolean;
  onChange: (fn: () => Promise<unknown>, ok?: string) => Promise<void>;
  base: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(!compact);
  const widest = Math.max(...row.regions.map((g) => g.x1 - g.x0));
  const scale = Math.min(1, width / widest);
  const options = [
    { value: "none", label: "Not linked" },
    ...questions.flatMap((q) => [
      { value: `${q.id}|`, label: `Q${q.number} (whole question)`, group: `Question ${q.number}` },
      ...q.parts.map((p) => ({ value: `${q.id}|${p.id}`, label: `Q${q.number}${printedPart(p.label)}`, group: `Question ${q.number}` })),
    ]),
  ];
  const value = row.questionId ? `${row.questionId}|${row.partId ?? ""}` : "none";
  return (
    <div className={cn("rounded-lg border", !row.questionId && "border-red-300")}>
      <div className="flex flex-wrap items-center gap-2 px-2 py-1.5 text-xs">
        <span className="font-mono text-sm">{row.label}</span>
        {row.edited && <span className="text-muted-foreground" title="Linked by hand">✎</span>}
        <span className="text-muted-foreground">
          {row.regions.length > 1 ? `${row.regions.length} pieces` : `page ${row.regions[0].page + 1}`}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Select
            aria-label={`Link row ${row.label} to`}
            value={value}
            className="h-7 text-xs"
            onValueChange={(v) => {
              const [questionId, partId] = v === "none" ? [null, null] : v.split("|");
              void onChange(
                () => call(`${base}/rows`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: row.label, questionId: questionId || null, partId: partId || null }) }),
                "Link saved",
              );
            }}
            options={options}
          />
          <button type="button" className="rounded px-1.5 py-1 hover:bg-muted" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? "Hide" : "Show"}
          </button>
          <button
            type="button"
            disabled={busy}
            className="rounded px-1.5 py-1 text-destructive hover:bg-red-50"
            onClick={async () =>
              (await confirmDialog({ title: `Remove row ${row.label}?`, body: "Use this for things that aren't mark scheme rows. Re-read brings it back.", confirmLabel: "Remove", danger: true })) &&
              onChange(() => call(`${base}/rows?label=${encodeURIComponent(row.label)}`, { method: "DELETE" }), "Row removed")
            }
          >
            Remove
          </button>
        </div>
      </div>
      {open && (
        <div className="space-y-1 overflow-x-auto border-t bg-white p-2">
          {row.regions.map((g) => (
            <CropCanvas key={g.id} paperId={msDocKey(paperId)} page={g.page} rect={g} scale={scale} />
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CropCanvas } from "@/components/pdf/crop-canvas";
import { msDocKey } from "@/components/pdf/pdf-cache";
import { confirmDialog, toast } from "@/components/feedback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/empty-state";
import { HScroll } from "@/components/h-scroll";
import { parseRowLabel, printedPart } from "@/lib/mark-schemes/link";
import type { MarkSchemeReview, MsRowView } from "@/lib/mark-schemes/server";
import { cn } from "@/lib/utils";
import { postWithProgress } from "@/lib/upload";
import { DrawBoxDialog } from "./draw-box-dialog";
import { DrawBoxesDialog, compareLabels, type DrawnBox } from "@/components/pdf/draw-boxes-dialog";

type Box = { page: number; x0: number; y0: number; x1: number; y1: number };
type Q = { id: string; number: number; totalMarks: number; parts: { id: string; label: string; marks: number }[] };
type Slot = { key: string; questionId: string; partId: string | null; title: string; marks: number };
type SlotState = "ok" | "differ" | "unknown" | "missing";

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

/** The parts to check for a question: each part, or the whole question when it has none (or a whole-question row). */
function slotsFor(q: Q, rows: MsRowView[]): Slot[] {
  const whole = rows.some((r) => r.questionId === q.id && r.partId === null);
  if (!q.parts.length || whole) return [{ key: q.id, questionId: q.id, partId: null, title: `Q${q.number}`, marks: q.totalMarks }];
  return q.parts.map((p) => ({ key: p.id, questionId: q.id, partId: p.id, title: `Q${q.number}${printedPart(p.label)}`, marks: p.marks }));
}

/**
 * Admin: check a paper's mark scheme. Each part of the question paper is shown beside the mark
 * scheme row(s) linked to it, with an automatic marks check (the mark scheme's total for the
 * part = the paper's marks). Only parts that need a look are flagged.
 */
export function MarkSchemeScreen({
  paper,
  questions,
  paperRegions,
  initial,
}: {
  paper: { id: string; label: string; subject: string; status: string };
  questions: Q[];
  paperRegions: Record<string, Box[]>;
  initial: MarkSchemeReview | null;
}) {
  const [ms, setMs] = useState(initial);
  // Fresh data from the server (e.g. after coming back with the browser's Back button).
  useEffect(() => setMs(initial), [initial]);
  const [busy, setBusy] = useState(false);
  // Upload progress: 0–1 while the file is being sent, then "saving" until the server answers.
  const [sending, setSending] = useState<{ name: string; fraction: number } | null>(null);
  const [filter, setFilter] = useState<"all" | "look">("all");
  // The whole-mark-scheme editor: the label new boxes get, and where it opens.
  const [editor, setEditor] = useState<{ newLabel: string; startPage?: number } | null>(null);
  const [adjust, setAdjust] = useState<MsRowView | null>(null);
  const [checked, setChecked] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const base = `/api/admin/papers/${paper.id}/mark-scheme`;
  const storeKey = ms ? `ms-checked:${ms.id}:${ms.updatedAt}` : "";

  const reload = useCallback(async () => setMs(await call(base)), [base]);

  useEffect(() => {
    if (ms?.status !== "processing") return;
    const t = setInterval(() => void reload().catch(() => {}), 2000);
    return () => clearInterval(t);
  }, [ms?.status, reload]);

  // "Looks right" ticks are just for the admin's own progress, kept in this browser.
  useEffect(() => {
    try {
      setChecked(storeKey ? JSON.parse(localStorage.getItem(storeKey) ?? "[]") : []);
    } catch {
      setChecked([]);
    }
  }, [storeKey]);
  const toggleChecked = (qId: string) =>
    setChecked((c) => {
      const next = c.includes(qId) ? c.filter((x) => x !== qId) : [...c, qId];
      try {
        localStorage.setItem(storeKey, JSON.stringify(next));
      } catch {}
      return next;
    });

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
    setSending({ name: file.name, fraction: 0 });
    setBusy(true);
    try {
      const res = await postWithProgress(base, fd, (fraction) => setSending({ name: file.name, fraction }));
      if (!res.ok) throw new Error(String(res.body.error ?? "Upload failed"));
      await reload();
      toast("Uploaded — reading the mark scheme…");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSending(null);
      setBusy(false);
    }
  }

  const rows = useMemo(() => ms?.rows ?? [], [ms]);
  const rowsFor = (s: Slot) => rows.filter((r) => r.questionId === s.questionId && r.partId === s.partId);
  const stateOf = (s: Slot): SlotState => {
    if (!rowsFor(s).length) return "missing";
    const c = ms?.checks?.[s.key]?.check;
    return c === "match" ? "ok" : c === "differ" ? "differ" : "unknown";
  };
  const allSlots = questions.flatMap((q) => slotsFor(q, rows));
  const counts = { ok: 0, differ: 0, unknown: 0, missing: 0 } as Record<SlotState, number>;
  for (const s of allSlots) counts[stateOf(s)]++;
  const unlinked = rows.filter((r) => !r.questionId);
  const needsLook = counts.differ + counts.unknown + counts.missing + unlinked.length;
  const complete = ms && !ms.coverage.missing.length && !ms.coverage.unlinked.length;
  const questionState = (q: Q): SlotState => {
    const st = slotsFor(q, rows).map(stateOf);
    return st.includes("missing") ? "missing" : st.includes("differ") ? "differ" : st.includes("unknown") ? "unknown" : "ok";
  };
  const [statusLabel, statusCls] = STATUS[ms?.status ?? "uploaded"];
  // Where to open the drawing view: this question's rows, else the end of the question before it.
  const startPageFor = (slot: Slot) => {
    const own = rows.filter((r) => r.questionId === slot.questionId).flatMap((r) => r.regions.map((g) => g.page));
    if (own.length) return Math.min(...own);
    const qi = questions.findIndex((q) => q.id === slot.questionId);
    for (let k = qi - 1; k >= 0; k--) {
      const prev = rows.filter((r) => r.questionId === questions[k].id).flatMap((r) => r.regions.map((g) => g.page));
      if (prev.length) return Math.max(...prev);
    }
    return undefined;
  };

  return (
    <div className="space-y-5">
      {/* Title and actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-1">
          <Link href={`/admin/papers/${paper.id}`} className="text-sm text-muted-foreground hover:text-foreground">
            ← {paper.label} questions
          </Link>
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
            Mark scheme {ms && <Badge className={statusCls}>{statusLabel}</Badge>}
          </h1>
          <p className="text-sm text-muted-foreground">{paper.subject} · {paper.label}</p>
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
          {ms && (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={busy || ms.status === "processing"}
                onClick={() => setEditor({ newLabel: rows[0]?.label ?? "1", startPage: rows[0]?.regions[0]?.page })}
                title="Every row's boxes on the mark scheme: draw, move, resize, rename or remove them"
              >
                Edit mark scheme
              </Button>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>Replace PDF</Button>
              {/* Not blocked while "processing": a read cut off by the time limit stays that way. */}
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => run(() => call(`${base}/reprocess`, { method: "POST" }), "Reading again…")}>
                Re-read
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                disabled={busy}
                onClick={async () =>
                  (await confirmDialog({
                    title: "Delete this mark scheme?",
                    body: "This can't be undone. The question paper and its questions stay.",
                    details: ["The mark scheme PDF", `All ${ms.rows.length} rows and their boxes, including ones you linked or drew by hand`, "Teachers can no longer export it"],
                    confirmLabel: "Delete mark scheme",
                    danger: true,
                  })) &&
                  run(() => call(base, { method: "DELETE" }), "Mark scheme deleted")
                }
              >
                Delete
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
                  onClick={async () => {
                    if (counts.differ && !(await confirmDialog({ title: "Publish anyway?", body: `${counts.differ} part${counts.differ === 1 ? "'s" : "s'"} mark scheme marks don't match the paper.`, confirmLabel: "Publish" }))) return;
                    await run(() => call(`${base}/publish`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }), "Published — teachers can export it");
                  }}
                >
                  Publish
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {sending && <UploadProgress name={sending.name} fraction={sending.fraction} />}
      {editor && ms && (
        <DrawBoxesDialog
          docKey={msDocKey(paper.id, ms.fileVersion)}
          heading={`Edit the mark scheme · ${paper.label}`}
          help="Every row is a coloured box. Drag on a page to add a box to the row named on the left of the bar below (type “1(a)”, then “1(b)” for the next). Click a box to move, resize, rename or remove it. Ctrl+Z undoes."
          boxLabel=""
          rows={{
            newLabel: editor.newLabel,
            suggestions: [
              ...new Set([
                ...questions.flatMap((q) => [String(q.number), ...q.parts.map((p) => `${q.number}${printedPart(p.label)}`)]),
                ...rows.map((r) => r.label),
              ]),
            ].sort(compareLabels),
            marks: Object.fromEntries(rows.map((r) => [r.label, r.marks])),
            tidy: (t) => parseRowLabel(t)?.label ?? t.trim(),
          }}
          initialBoxes={rows.flatMap((r) => r.regions.map(({ page, x0, y0, x1, y1 }) => ({ page, x0, y0, x1, y1, label: r.label })))}
          startPage={editor.startPage}
          saveLabel="Save mark scheme"
          onClose={() => setEditor(null)}
          onSave={async (boxes, marks) => {
            setEditor(null);
            const byLabel = new Map<string, DrawnBox[]>();
            for (const b of boxes) byLabel.set(b.label ?? "?", [...(byLabel.get(b.label ?? "?") ?? []), b]);
            const body = {
              rows: [...byLabel.entries()].map(([label, bs]) => ({
                label,
                marks: marks[label] ?? null,
                boxes: bs.map(({ page, x0, y0, x1, y1 }) => ({ page, x0, y0, x1, y1 })),
              })),
            };
            await run(() => call(`${base}/rows/all`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), "Mark scheme saved");
          }}
        />
      )}
      {adjust && ms && (
        <DrawBoxDialog
          paperId={paper.id}
          version={ms.fileVersion}
          title={adjust.label}
          rows={rows.filter((r) => r.label !== adjust.label)}
          startPage={adjust.regions[0]?.page}
          initialBoxes={adjust.regions.map(({ page, x0, y0, x1, y1 }) => ({ page, x0, y0, x1, y1 }))}
          onClose={() => setAdjust(null)}
          onSave={async (boxes) => {
            const row = adjust;
            setAdjust(null);
            await run(
              () => call(`${base}/rows`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: row.label, boxes }) }),
              `Row ${row.label} adjusted`,
            );
          }}
        />
      )}
      {!ms ? (
        <EmptyState title="No mark scheme yet" action={<Button onClick={() => fileRef.current?.click()}>Upload mark scheme</Button>}>
          Upload this paper&apos;s mark scheme PDF. Its rows are found and matched to the questions automatically.
        </EmptyState>
      ) : ms.status === "processing" ? (
        <div className="rounded-lg bg-sky-50 px-3 py-3 text-sm text-sky-900" role="status">
          <div className="flex items-center gap-2">
            <span className="size-3 animate-spin rounded-full border-2 border-sky-700 border-t-transparent" aria-hidden />
            Reading the mark scheme and matching its rows to the questions…
          </div>
          <p className="mt-1 text-xs text-sky-800/80">Usually 5–20 seconds (up to a minute if the processor was asleep). This page updates by itself.</p>
        </div>
      ) : (
        <>
          {ms.status === "failed" && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900">{ms.statusReason}</p>}

          {/* The check at a glance */}
          <div className="sticky top-14 z-20 -mx-4 space-y-2 border-b bg-background/95 px-4 py-2 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className={cn("font-medium", needsLook ? "text-amber-800" : "text-emerald-700")}>
                {needsLook ? `${needsLook} to look at` : "✓ Everything matches"}
              </span>
              <span className="text-muted-foreground">
                {counts.ok} of {allSlots.length} parts: mark scheme marks = paper marks
                {counts.differ > 0 && ` · ${counts.differ} differ`}
                {counts.unknown > 0 && ` · ${counts.unknown} without marks`}
                {counts.missing > 0 && ` · ${counts.missing} without a row`}
                {unlinked.length > 0 && ` · ${unlinked.length} unmatched row${unlinked.length === 1 ? "" : "s"}`}
              </span>
              <span className="text-muted-foreground">· {checked.length} of {questions.length} questions ticked</span>
              <div className="ml-auto inline-flex rounded-lg bg-muted p-0.5 text-xs" role="radiogroup" aria-label="Show">
                {(
                  [
                    ["all", "All parts"],
                    ["look", `Needs a look (${needsLook})`],
                  ] as const
                ).map(([k, label]) => (
                  <button key={k} type="button" role="radio" aria-checked={filter === k} onClick={() => setFilter(k)} className={cn("rounded-md px-2.5 py-1", filter === k ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <HScroll label="questions">
              {questions.map((q) => {
                const st = questionState(q);
                return (
                  <a
                    key={q.id}
                    href={`#q-${q.id}`}
                    className={cn(
                      "shrink-0 rounded-md border px-2 py-0.5 text-xs tabular-nums",
                      st === "ok" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : st === "missing" ? "border-red-300 bg-red-50 text-red-800" : "border-amber-300 bg-amber-50 text-amber-900",
                      checked.includes(q.id) && "ring-2 ring-emerald-500",
                    )}
                    title={checked.includes(q.id) ? "Ticked as looking right" : undefined}
                  >
                    {checked.includes(q.id) ? "✓ " : ""}Q{q.number}
                  </a>
                );
              })}
            </HScroll>
          </div>

          {unlinked.length > 0 && (
            <section className="space-y-2 rounded-xl border border-red-200 bg-red-50/40 p-3">
              <h2 className="text-sm font-medium text-red-900">Rows not matched to a question — link or remove them</h2>
              {unlinked.map((r) => (
                <div key={r.label} className="rounded-lg border bg-background">
                  <RowTools row={r} questions={questions} busy={busy} onChange={run} base={base} onAdjust={() => setAdjust(r)} />
                  <MsCrops row={r} paperId={paper.id} version={ms.fileVersion} />
                </div>
              ))}
            </section>
          )}

          {questions.map((q) => {
            const slots = slotsFor(q, rows).filter((s) => filter === "all" || stateOf(s) !== "ok");
            if (!slots.length) return null;
            const isChecked = checked.includes(q.id);
            return (
              <section key={q.id} id={`q-${q.id}`} className="scroll-mt-40 overflow-hidden rounded-xl border bg-background">
                <div className="flex items-center gap-3 border-b bg-muted/30 px-4 py-2">
                  <h2 className="font-medium">
                    Question {q.number} <span className="text-sm font-normal text-muted-foreground">· {q.totalMarks} marks</span>
                  </h2>
                  <button
                    type="button"
                    onClick={() => toggleChecked(q.id)}
                    aria-pressed={isChecked}
                    className={cn("ml-auto rounded-md border px-2.5 py-1 text-xs pointer-coarse:py-2", isChecked ? "border-emerald-500 bg-emerald-600 text-white" : "hover:bg-muted")}
                  >
                    {isChecked ? "✓ Looks right" : "Looks right"}
                  </button>
                </div>
                <div className="divide-y">
                  {slots.map((s) => {
                    const st = stateOf(s);
                    const chk = ms.checks?.[s.key];
                    const linked = rowsFor(s);
                    return (
                      <div key={s.key} className="p-3 sm:p-4">
                        <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-semibold">{s.title}</span>
                          <span className="text-muted-foreground">{s.marks} mark{s.marks === 1 ? "" : "s"} on the paper</span>
                          <span
                            className={cn(
                              "rounded px-1.5 py-0.5 text-xs font-medium",
                              st === "ok" ? "bg-emerald-50 text-emerald-700" : st === "missing" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800",
                            )}
                          >
                            {st === "ok" ? "✓ Mark scheme gives the same marks" : st === "differ" ? `Mark scheme gives ${chk?.ms} — check it's the right row` : st === "unknown" ? "No marks printed — check by eye" : "No mark scheme row — link one below"}
                          </span>
                        </div>
                        <div className="grid gap-3 lg:grid-cols-2">
                          <figure className="min-w-0">
                            <figcaption className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Question paper</figcaption>
                            <Crops paperId={paper.id} boxes={paperRegions[s.partId ?? s.questionId] ?? []} maxH={360} />
                          </figure>
                          <figure className="min-w-0">
                            <figcaption className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Mark scheme</figcaption>
                            {linked.length ? (
                              linked.map((r) => (
                                <div key={r.label} className="mb-2 rounded-lg border">
                                  <MsCrops row={r} paperId={paper.id} version={ms.fileVersion} />
                                  <RowTools row={r} questions={questions} busy={busy} onChange={run} base={base} onAdjust={() => setAdjust(r)} subtle />
                                </div>
                              ))
                            ) : (
                              <p className="mb-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                                No mark scheme row for this part yet. Pick one of the mark scheme&apos;s rows below, or draw a box round it on the mark scheme.
                              </p>
                            )}
                            <SlotTools
                              slot={s}
                              collapsed={linked.length > 0}
                              rows={rows}
                              questions={questions}
                              busy={busy}
                              onLink={(label) =>
                                run(
                                  () => call(`${base}/rows`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label, questionId: s.questionId, partId: s.partId }) }),
                                  `Row ${label} linked to ${s.title}`,
                                )
                              }
                              onDraw={() => setEditor({ newLabel: s.title.replace(/^Q/, ""), startPage: startPageFor(s) })}
                            />
                          </figure>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
          {filter === "look" && needsLook === 0 && (
            <EmptyState title="Nothing needs a look">Every part has a mark scheme row and the marks match the paper. Publish when you&apos;re happy.</EmptyState>
          )}
        </>
      )}
    </div>
  );
}

/** Crops scaled to the column's width (measured), cut off at maxH with a "Show all" toggle. */
function Crops({ paperId, boxes, maxH }: { paperId: string; boxes: Box[]; maxH?: number }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(480);
  const [open, setOpen] = useState(false);
  const [tall, setTall] = useState(false);
  useEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const ro = new ResizeObserver(() => {
      setWidth(o.clientWidth - 16);
      setTall(maxH ? i.offsetHeight > maxH + 40 : false);
    });
    ro.observe(o);
    ro.observe(i); // pictures load later and grow the content
    return () => ro.disconnect();
  }, [maxH]);
  if (!boxes.length) return <p className="text-xs text-muted-foreground">No boxes.</p>;
  const widest = Math.max(...boxes.map((b) => b.x1 - b.x0));
  const scale = Math.min(1, width / widest);
  return (
    <div className="rounded-lg border bg-white">
      <div ref={outer} className="relative overflow-hidden" style={!open && maxH ? { maxHeight: maxH } : undefined}>
        <div ref={inner} className="space-y-1 p-2">
          {boxes.map((b, i) => (
            <CropCanvas key={i} paperId={paperId} page={b.page} rect={b} scale={scale} />
          ))}
        </div>
        {!open && tall && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-white" />}
      </div>
      {tall && (
        <button type="button" onClick={() => setOpen((o) => !o)} className="w-full border-t py-1 text-xs text-muted-foreground hover:bg-muted">
          {open ? "Show less" : "Show all"}
        </button>
      )}
    </div>
  );
}

function MsCrops({ row, paperId, version }: { row: MsRowView; paperId: string; version?: string }) {
  return <Crops paperId={msDocKey(paperId, version)} boxes={row.regions} />;
}

/** Row label, its marks, and the (rarely needed) fixes: link elsewhere or remove. */
function RowTools({
  row,
  questions,
  busy,
  onChange,
  base,
  subtle,
  onAdjust,
}: {
  row: MsRowView;
  /** Move or resize the row's boxes. */
  onAdjust?: () => void;
  questions: Q[];
  busy: boolean;
  onChange: (fn: () => Promise<unknown>, ok?: string) => Promise<void>;
  base: string;
  subtle?: boolean;
}) {
  const [fixing, setFixing] = useState(!subtle);
  const options = [
    { value: "none", label: "Not linked" },
    ...questions.flatMap((q) => [
      { value: `${q.id}|`, label: `Q${q.number} (whole question)`, group: `Question ${q.number}` },
      ...q.parts.map((p) => ({ value: `${q.id}|${p.id}`, label: `Q${q.number}${printedPart(p.label)}`, group: `Question ${q.number}` })),
    ]),
  ];
  const value = row.questionId ? `${row.questionId}|${row.partId ?? ""}` : "none";
  return (
    <div className="flex flex-wrap items-center gap-2 border-t px-2 py-1.5 text-xs text-muted-foreground">
      <span>
        Row <span className="font-mono text-foreground">{row.label}</span>
        {row.marks != null && ` · ${row.marks} mark${row.marks === 1 ? "" : "s"}`}
        {row.regions.length > 1 && ` · ${row.regions.length} pieces`}
        {row.edited && " · linked by hand"}
      </span>
      {onAdjust && (
        <button
          type="button"
          disabled={busy}
          className="ml-auto rounded px-1.5 py-1 hover:bg-muted hover:text-foreground"
          onClick={onAdjust}
          title="Move or resize this row's boxes on the mark scheme"
        >
          Adjust boxes
        </button>
      )}
      {fixing ? (
        <div className={cn("flex items-center gap-1", !onAdjust && "ml-auto")}>
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
      ) : (
        <button type="button" className={cn("rounded px-1.5 py-1 hover:bg-muted hover:text-foreground", !onAdjust && "ml-auto")} onClick={() => setFixing(true)}>
          Wrong row?
        </button>
      )}
    </div>
  );
}

function UploadProgress({ name, fraction }: { name: string; fraction: number }) {
  const sent = fraction >= 1;
  return (
    <div className="rounded-lg border bg-background px-3 py-3 text-sm" role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate">
          {sent ? "Saving" : "Uploading"} <span className="font-medium">{name}</span>…
        </span>
        <span className="shrink-0 tabular-nums text-muted-foreground">{sent ? "" : `${Math.round(fraction * 100)}%`}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full bg-primary transition-[width]", sent && "w-full animate-pulse")} style={sent ? undefined : { width: `${Math.max(4, fraction * 100)}%` }} />
      </div>
    </div>
  );
}

/** Under each part: give it a row from the mark scheme (any row, matched or not), or draw one. */
function SlotTools({
  slot,
  collapsed,
  rows,
  questions,
  busy,
  onLink,
  onDraw,
}: {
  slot: Slot;
  /** The part already has a row: keep the tools behind a small link. */
  collapsed?: boolean;
  rows: MsRowView[];
  questions: Q[];
  busy: boolean;
  onLink: (label: string) => void;
  onDraw: () => void;
}) {
  const where = (r: MsRowView) => {
    if (!r.questionId) return "not matched";
    const q = questions.find((x) => x.id === r.questionId);
    const p = q?.parts.find((x) => x.id === r.partId);
    return q ? `now on Q${q.number}${p ? printedPart(p.label) : ""}` : "";
  };
  const candidates = rows.filter((r) => !(r.questionId === slot.questionId && r.partId === slot.partId));
  const [open, setOpen] = useState(!collapsed);
  if (!open) {
    return (
      <button type="button" className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline" onClick={() => setOpen(true)}>
        + Add another row or draw a box
      </button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {candidates.length > 0 && (
        <Select
          aria-label={`Use a mark scheme row for ${slot.title}`}
          value=""
          placeholder="Use a row from the mark scheme…"
          className="h-8 min-w-[14rem] text-xs"
          disabled={busy}
          onValueChange={onLink}
          options={[...candidates]
            .sort((a, b) => Number(Boolean(a.questionId)) - Number(Boolean(b.questionId)))
            .map((r) => ({ value: r.label, label: r.label, hint: where(r), group: r.questionId ? "Other rows" : "Not matched yet" }))}
        />
      )}
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onDraw}>
        Draw a box
      </Button>
    </div>
  );
}

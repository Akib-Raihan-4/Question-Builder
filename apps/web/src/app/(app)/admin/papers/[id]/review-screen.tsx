"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePdf } from "@/components/pdf/use-pdf";
import { PdfPageCanvas } from "@/components/pdf/pdf-page-canvas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/select";
import { pdfToScreen, type PdfRect } from "@/lib/coords";
import { publishIssues } from "@/lib/review/checks";
import type { ReviewData, ReviewRegion } from "@/lib/review/types";
import { BoxOverlay, type Owner } from "./box-overlay";
import { QuestionPanel } from "./question-panel";
import { DetailsForm } from "./details-form";
import { confirmDialog, toast } from "@/components/feedback";

const STATUS_CLS: Record<string, string> = {
  needs_review: "bg-amber-100 text-amber-800",
  published: "bg-emerald-100 text-emerald-800",
  processing: "bg-sky-100 text-sky-800",
  failed: "bg-red-100 text-red-800",
  uploaded: "bg-zinc-100 text-zinc-700",
};

async function api(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json;
}

export function ReviewScreen({ initial }: { initial: ReviewData }) {
  const [data, setData] = useState(initial);
  const [owner, setOwner] = useState<Owner | null>(null);
  const [regionId, setRegionId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [drawMode, setDrawMode] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [tab, setTab] = useState<"pages" | "questions">("pages");
  const [isPhone, setIsPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsPhone(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  const { doc, error } = usePdf(`/api/papers/${initial.paper.id}/file`);
  const viewerRef = useRef<HTMLDivElement>(null);
  const [viewerWidth, setViewerWidth] = useState(760);
  const [pageSizes, setPageSizes] = useState<{ w: number; h: number }[]>([]);

  const paperId = data.paper.id;
  const flash = (ok: boolean, text: string) => toast(text, ok ? "ok" : "error");

  const refresh = useCallback(async () => {
    setData(await api(`/api/admin/papers/${paperId}/review`, "GET"));
  }, [paperId]);

  /** Run a server change, then reload the paper. */
  const run = useCallback(
    async (fn: () => Promise<unknown>, success?: string) => {
      setBusy(true);
      try {
        await fn();
        await refresh();
        if (success) flash(true, success);
      } catch (e) {
        flash(false, (e as Error).message);
        await refresh().catch(() => {});
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  // Page sizes (PDF points) from pdf.js; scale = fit the viewer width.
  useEffect(() => {
    if (!doc) return;
    (async () => {
      const sizes = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const v = (await doc.getPage(i)).getViewport({ scale: 1 });
        sizes.push({ w: v.width, h: v.height });
      }
      setPageSizes(sizes);
    })();
  }, [doc]);

  useEffect(() => {
    const el = viewerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewerWidth(el.clientWidth - 48));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Delete key removes the selected box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "Delete" || e.key === "Backspace") && regionId && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        const id = regionId;
        setRegionId(null);
        run(() => api(`/api/admin/regions/${id}`, "DELETE"), "Box deleted");
      }
      if (e.key === "Escape") {
        setRegionId(null);
        setOwner(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [regionId, run]);

  const labels = useMemo(() => {
    const m: Record<string, string> = {};
    for (const q of data.questions) m[q.id] = `Q${q.number}`;
    for (const p of data.parts) {
      const q = data.questions.find((x) => x.id === p.questionId);
      m[p.id] = `Q${q?.number ?? "?"}(${p.label})`;
    }
    return m;
  }, [data]);
  const lowConfidence = useMemo(
    () => new Set(data.questions.filter((q) => q.confidence < 0.9 || q.warnings.length).map((q) => q.id)),
    [data],
  );
  const issues = useMemo(() => publishIssues(data.questions, data.parts, data.regions), [data]);

  /** "Fit" scale (page fills the viewer width, at most 160%) times the zoom level. */
  function scaleFor(page: number) {
    const w = pageSizes[page]?.w ?? 595;
    return Math.min(1.6, viewerWidth / w) * zoom;
  }

  function deleteSelectedBox() {
    if (!regionId) return;
    const id = regionId;
    setRegionId(null);
    run(() => api(`/api/admin/regions/${id}`, "DELETE"), "Box deleted");
  }

  function goToPage(i: number) {
    const viewer = viewerRef.current;
    const pageEl = document.getElementById(`page-${i}`);
    if (viewer && pageEl) viewer.scrollTo({ top: pageEl.offsetTop - 8, behavior: "smooth" });
  }

  function updateRegionLocal(region: ReviewRegion) {
    setData((d) => ({ ...d, regions: d.regions.map((r) => (r.id === region.id ? { ...region, editedByAdmin: true } : r)) }));
  }

  async function commitRegion(region: ReviewRegion) {
    try {
      await api(`/api/admin/regions/${region.id}`, "PATCH", { x0: region.x0, y0: region.y0, x1: region.x1, y1: region.y1 });
    } catch (e) {
      flash(false, (e as Error).message);
      await refresh();
    }
  }

  function drawRegion(page: number, rect: PdfRect) {
    if (!owner) return;
    run(
      () => api(`/api/admin/regions`, "POST", { ownerType: owner.type, ownerId: owner.id, page, ...rect }),
      `Box added to ${labels[owner.id]}`,
    ).then(() => setDrawMode(false));
  }

  function scrollToOwner(ownerId: string) {
    const r = data.regions
      .filter((x) => x.ownerId === ownerId)
      .sort((a, b) => a.page - b.page || a.y0 - b.y0)[0];
    const viewer = viewerRef.current;
    const pageEl = r && document.getElementById(`page-${r.page}`);
    if (!r || !viewer || !pageEl) return;
    const top = pageEl.offsetTop + pdfToScreen(r, scaleFor(r.page)).top - 40;
    viewer.scrollTo({ top, behavior: "smooth" });
  }

  const published = data.paper.status === "published";
  const pagePicker =
    pageSizes.length > 0 ? (
      <Select
        aria-label="Go to page"
        value=""
        placeholder="Page…"
        onValueChange={(v) => goToPage(Number(v))}
        className="h-8 w-24 pointer-coarse:h-9"
        options={pageSizes.map((_, i) => ({
          value: String(i),
          label: `Page ${i + 1}`,
          hint: data.regions.some((r) => r.page === i) ? undefined : "no boxes",
        }))}
      />
    ) : null;

  return (
    <div className="-my-6 ml-[calc(50%-50vw)] flex h-[calc(100dvh-3.5rem-1px)] w-screen flex-col sm:-my-8">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-background px-3 py-2 sm:px-4 sm:py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-2 md:flex-none">
          <Link href="/admin" className="shrink-0 text-sm text-muted-foreground hover:text-foreground">
            ←<span className="sr-only sm:not-sr-only"> Past papers</span>
          </Link>
          <div className="min-w-0">
            <div className="truncate font-semibold">{data.paper.paperCode} · {data.paper.series} {data.paper.year}</div>
            <div className="truncate text-xs text-muted-foreground">
              {data.paper.subject} · {data.questions.length} questions · {data.questions.reduce((s, q) => s + q.totalMarks, 0)} marks
              <span className="hidden sm:inline"> · parser {data.paper.parserVersion ?? "–"}</span>
            </div>
          </div>
          <Badge className={cn("shrink-0", STATUS_CLS[data.paper.status])}>{data.paper.status.replace("_", " ")}</Badge>
        </div>
        <div className="flex w-full items-center gap-2 md:ml-auto md:w-auto">
          <Button size="sm" variant="ghost" aria-expanded={editing} onClick={() => setEditing((e) => !e)}>{editing ? "Close details" : "Edit details"}</Button>
          {issues.length > 0 && !published && (
            <span className="ml-auto text-xs text-amber-700 md:ml-0">{issues.length} thing{issues.length === 1 ? "" : "s"} to fix before publishing</span>
          )}
          <Button
            size="sm"
            variant="outline"
            className={cn(!(issues.length > 0 && !published) && "ml-auto md:ml-0")}
            disabled={busy || data.paper.structureEdited || data.paper.parserKey === "manual"}
            title={
              data.paper.parserKey === "manual"
                ? "This paper's questions are marked by hand (change it under Edit details)"
                : data.paper.structureEdited
                  ? "Questions were added, split or merged by hand, so this paper can't be re-run"
                  : "Run the parser again. Boxes and marks you edited are kept."
            }
            onClick={async () =>
              (await confirmDialog({ title: "Run the parser again?", body: "Boxes, marks and labels you edited by hand are kept.", confirmLabel: "Re-run" })) &&
              run(async () => {
                await api(`/api/admin/papers/${paperId}/reprocess`, "POST");
                for (let i = 0; i < 40; i++) {
                  await new Promise((r) => setTimeout(r, 2000));
                  const d: ReviewData = await api(`/api/admin/papers/${paperId}/review`, "GET");
                  if (d.paper.status !== "processing") return;
                }
              }, "Parser re-run finished")
            }
          >
            <span className="sm:hidden">Re-run</span>
            <span className="hidden sm:inline">Re-run parser</span>
          </Button>
          {published ? (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => api(`/api/admin/papers/${paperId}/publish`, "POST", { publish: false }), "Unpublished")}>
              Unpublish
            </Button>
          ) : (
            <Button
              size="sm"
              disabled={busy || issues.length > 0}
              title={issues.length ? "Fix the flagged questions first" : "Make this paper available to teachers"}
              onClick={() => run(() => api(`/api/admin/papers/${paperId}/publish`, "POST", { publish: true }), "Published — teachers can now use this paper")}
            >
              Publish
            </Button>
          )}
        </div>
      </div>

      {editing && (
        <DetailsForm
          data={data}
          onCancel={() => setEditing(false)}
          onSave={(body) =>
            run(async () => {
              await api(`/api/admin/papers/${paperId}`, "PATCH", body);
              setEditing(false);
            }, "Details saved")
          }
        />
      )}
      {(data.paper.statusReason || data.questions.length === 0) && (
        <div className="border-b bg-amber-50 px-4 py-2 text-sm text-amber-900">
          {data.questions.length === 0
            ? "No questions yet. Use “Add question”, select it, then press Draw box (or hold Shift) and drag on the page to draw its box."
            : data.paper.statusReason}
        </div>
      )}

      {/* Phones: one side at a time */}
      <div className="flex items-center gap-2 border-b bg-background px-3 py-2 md:hidden">
        <div className="inline-flex shrink-0 rounded-lg bg-muted p-0.5" role="tablist" aria-label="Review view">
          {(
            [
              ["pages", "Pages"],
              ["questions", `Questions (${data.questions.length})`],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={cn("whitespace-nowrap rounded-md px-3 py-1.5 text-sm", tab === k ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="ml-auto">{pagePicker}</div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Pages */}
        <div className={cn("min-h-0 min-w-0 flex-1 flex-col", tab === "pages" ? "flex" : "hidden", "md:flex")}>
          <div className="flex flex-wrap items-center gap-2 border-b bg-background px-3 py-2 text-sm">
            <span className="min-w-0 truncate text-xs text-muted-foreground">
              {owner ? (
                <>
                  <span className="hidden lg:inline">Selected: </span>
                  <span className="font-medium text-foreground">{labels[owner.id]}</span>
                </>
              ) : (
                <span className="hidden lg:inline">Select a question or part</span>
              )}
            </span>
            <Button
              size="sm"
              variant={drawMode ? "default" : "outline"}
              disabled={!owner}
              aria-pressed={drawMode}
              onClick={() => setDrawMode((d) => !d)}
              title={owner ? "Then drag on the page to draw a box (Shift + drag also works)" : "Select a question or part first"}
            >
              {drawMode ? (
                <>
                  Drawing…<span className="hidden sm:inline"> (tap to cancel)</span>
                </>
              ) : (
                "Draw box"
              )}
            </Button>
            <Button size="sm" variant="outline" disabled={!regionId || busy} onClick={deleteSelectedBox} className="text-destructive">
              Delete box
            </Button>
            <div className="ml-auto flex items-center gap-1">
              <Button size="sm" variant="ghost" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.25) * 100) / 100))}>
                −
              </Button>
              <button onClick={() => setZoom(1)} className="min-w-12 rounded px-1 text-xs tabular-nums hover:bg-muted" title="Fit to width">
                {zoom === 1 ? "Fit" : `${Math.round(zoom * 100)}%`}
              </button>
              <Button size="sm" variant="ghost" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(3, Math.round((z + 0.25) * 100) / 100))}>
                +
              </Button>
              <div className="hidden md:block">{pagePicker}</div>
            </div>
          </div>
        <div ref={viewerRef} className="relative min-h-0 flex-1 overflow-auto bg-zinc-200/70 px-3 py-4 sm:px-6 sm:py-6">
          <details key={String(isPhone)} open={!isPhone} className="mx-auto mb-4 max-w-3xl rounded-lg bg-background/80 px-3 py-2 text-xs text-muted-foreground">
            <summary className="cursor-pointer font-medium text-foreground">How to edit boxes</summary>
            <span className="mt-1 block md:hidden">Easiest on a tablet or computer.</span>
            Tap or click a box to select it, then drag to move it or drag its handles to resize. To add a box, select a question or part and press{" "}
            <span className="font-medium text-foreground">Draw box</span> (or hold <kbd className="rounded border px-1">Shift</kbd>) and drag on the page.
            Boxes marked ✎ were edited by hand and are kept when the parser re-runs.
          </details>
          {error && <p className="text-sm text-destructive">Could not load the PDF: {error}</p>}
          {!doc && !error && <p className="text-sm text-muted-foreground">Loading PDF…</p>}
          {doc &&
            pageSizes.map((size, i) => {
              const scale = scaleFor(i);
              const w = size.w * scale;
              const h = size.h * scale;
              const pageRegions = data.regions.filter((r) => r.page === i);
              return (
                <div key={i} id={`page-${i}`} className="mx-auto mb-6" style={{ width: w }}>
                  <div className="mb-1 text-xs text-muted-foreground">Page {i + 1}</div>
                  <div className="relative shadow-sm ring-1 ring-black/5" style={{ width: w, height: h }}>
                    <PdfPageCanvas doc={doc} pageIndex={i} scale={scale} width={w} height={h} />
                    <BoxOverlay
                      page={i}
                      scale={scale}
                      pageWidthPt={size.w}
                      pageHeightPt={size.h}
                      regions={pageRegions}
                      labels={labels}
                      lowConfidence={lowConfidence}
                      selectedOwner={owner}
                      selectedRegionId={regionId}
                      onSelect={(o, rid) => {
                        setOwner(o);
                        setRegionId(rid);
                        document.getElementById(`card-${o.type === "part" ? data.parts.find((p) => p.id === o.id)?.questionId : o.id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
                      }}
                      onChange={updateRegionLocal}
                      onCommit={commitRegion}
                      onDraw={drawRegion}
                      drawMode={drawMode}
                    />
                  </div>
                </div>
              );
            })}
        </div>
        </div>

        {/* Questions */}
        <div className={cn("min-h-0 w-full flex-col md:flex md:w-[320px] md:shrink-0 lg:w-[380px]", tab === "questions" ? "flex" : "hidden")}>
        <QuestionPanel
          data={data}
          issues={issues}
          owner={owner}
          busy={busy}
          onSelect={(o) => {
            setOwner(o);
            setRegionId(null);
            if (isPhone) setTab("pages");
            // Wait a frame so the pages tab is visible on phones before scrolling.
            requestAnimationFrame(() => scrollToOwner(o.id));
          }}
          run={run}
          api={api}
        />
        </div>
      </div>

    </div>
  );
}

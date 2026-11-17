"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePdf } from "@/components/pdf/use-pdf";
import { PdfPageCanvas } from "@/components/pdf/pdf-page-canvas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { pdfToScreen, type PdfRect } from "@/lib/coords";
import { publishIssues } from "@/lib/review/checks";
import type { ReviewData, ReviewRegion } from "@/lib/review/types";
import { BoxOverlay, type Owner } from "./box-overlay";
import { QuestionPanel } from "./question-panel";
import { DetailsForm } from "./details-form";

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
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const { doc, error } = usePdf(`/api/papers/${initial.paper.id}/file`);
  const viewerRef = useRef<HTMLDivElement>(null);
  const [viewerWidth, setViewerWidth] = useState(760);
  const [pageSizes, setPageSizes] = useState<{ w: number; h: number }[]>([]);

  const paperId = data.paper.id;
  const flash = (ok: boolean, text: string) => {
    setToast({ ok, text });
    setTimeout(() => setToast(null), 3500);
  };

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

  function scaleFor(page: number) {
    const w = pageSizes[page]?.w ?? 595;
    return Math.min(1.6, viewerWidth / w);
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
    );
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

  return (
    <div className="-my-8 ml-[calc(50%-50vw)] flex h-[calc(100vh-3.5rem)] w-screen flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 border-b bg-background px-4 py-2.5">
        <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground">← Past papers</Link>
        <div className="min-w-0">
          <div className="truncate font-semibold">{data.paper.paperCode} · {data.paper.series} {data.paper.year}</div>
          <div className="text-xs text-muted-foreground">
            {data.paper.subject} · {data.questions.length} questions ·{" "}
            {data.questions.reduce((s, q) => s + q.totalMarks, 0)} marks · parser {data.paper.parserVersion ?? "–"}
          </div>
        </div>
        <Badge className={STATUS_CLS[data.paper.status]}>{data.paper.status.replace("_", " ")}</Badge>
        <Button size="sm" variant="ghost" onClick={() => setEditing((e) => !e)}>{editing ? "Close details" : "Edit details"}</Button>
        <div className="ml-auto flex items-center gap-2">
          {issues.length > 0 && !published && (
            <span className="text-xs text-amber-700">{issues.length} thing{issues.length === 1 ? "" : "s"} to fix before publishing</span>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={busy || data.paper.structureEdited || data.paper.parserKey === "manual"}
            title={
              data.paper.parserKey === "manual"
                ? "This paper's questions are marked by hand (change it under Edit details)"
                : data.paper.structureEdited
                  ? "Questions were added, split or merged by hand, so this paper can't be re-run"
                  : "Run the parser again. Boxes and marks you edited are kept."
            }
            onClick={() =>
              confirm("Run the parser on this paper again? Boxes, marks and labels you edited are kept.") &&
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
            Re-run parser
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
            ? "No questions yet. Use “Add question” on the right, then hold Shift and drag on the page to draw its box."
            : data.paper.statusReason}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Pages */}
        <div ref={viewerRef} className="relative min-w-0 flex-1 overflow-y-auto bg-zinc-200/70 px-6 py-6">
          <p className="mx-auto mb-4 max-w-3xl rounded-lg bg-background/80 px-3 py-2 text-xs text-muted-foreground">
            Click a box to select it. Drag to move; drag its handles to resize. Hold <kbd className="rounded border px-1">Shift</kbd> and drag on
            the page to draw a new box for the selected question or part. <kbd className="rounded border px-1">Delete</kbd> removes the selected
            box. Boxes marked ✎ were edited by hand and are kept when the parser re-runs.
          </p>
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
                    />
                  </div>
                </div>
              );
            })}
        </div>

        {/* Questions */}
        <QuestionPanel
          data={data}
          issues={issues}
          owner={owner}
          busy={busy}
          onSelect={(o) => {
            setOwner(o);
            setRegionId(null);
            scrollToOwner(o.id);
          }}
          run={run}
          api={api}
        />
      </div>

      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg px-4 py-2 text-sm text-white shadow-lg ${toast.ok ? "bg-zinc-900" : "bg-red-600"}`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}

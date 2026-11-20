"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { PdfPageCanvas } from "@/components/pdf/pdf-page-canvas";
import { getPdfDoc } from "@/components/pdf/pdf-cache";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useUndoShortcut } from "@/components/use-undo-shortcut";

export type DrawnBox = { page: number; x0: number; y0: number; x1: number; y1: number };
/** Boxes already on the document, shown faintly for reference. */
export type Outline = DrawnBox & { label: string; dashed?: boolean };

/**
 * Full-screen: every page of a PDF (a past paper or its mark scheme). Drag on a page to draw a
 * box — more than one if the content runs over pages — remove one with its ×, and Undo
 * (button, or Ctrl+Z / ⌘Z) steps back through every change. Coordinates are PDF points from the
 * page's top-left as displayed (rotation applied), like every stored region.
 */
export function DrawBoxesDialog({
  docKey,
  heading,
  help,
  boxLabel,
  outlines = [],
  initialBoxes = [],
  startPage,
  saveLabel = "Save",
  extraActions,
  onClose,
  onSave,
}: {
  /** pdf-cache key: a paper id, or msDocKey(...) for a mark scheme. */
  docKey: string;
  heading: string;
  help: ReactNode;
  /** Shown on each box being drawn ("Q3(a)"). */
  boxLabel: string;
  outlines?: Outline[];
  initialBoxes?: DrawnBox[];
  startPage?: number;
  saveLabel?: string;
  /** More buttons in the toolbar (e.g. "Use the original boxes"). */
  extraActions?: ReactNode;
  onClose: () => void;
  onSave: (boxes: DrawnBox[]) => void;
}) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [sizes, setSizes] = useState<{ w: number; h: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Every state the boxes have been in: Undo goes back one.
  const [history, setHistory] = useState<DrawnBox[][]>([initialBoxes]);
  const boxes = history[history.length - 1];
  const change = (next: DrawnBox[]) => setHistory((h) => [...h, next]);
  const undo = () => setHistory((h) => (h.length > 1 ? h.slice(0, -1) : h));
  useUndoShortcut(undo);
  const [drag, setDrag] = useState<{ page: number; x: number; y: number; x2: number; y2: number } | null>(null);
  const [width, setWidth] = useState(800);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let stop = false;
    getPdfDoc(docKey)
      .then(async (d) => {
        const s = [];
        for (let i = 1; i <= d.numPages; i++) {
          const v = (await d.getPage(i)).getViewport({ scale: 1 }); // as displayed (rotation applied)
          s.push({ w: v.width, h: v.height });
        }
        if (!stop) {
          setDoc(d);
          setSizes(s);
        }
      })
      .catch((e) => !stop && setError(String(e?.message ?? e)));
    return () => {
      stop = true;
    };
  }, [docKey]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.min(1100, el.clientWidth - 32)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Open on the page where the content is.
  useEffect(() => {
    if (!sizes.length || startPage == null) return;
    requestAnimationFrame(() => document.getElementById(`draw-page-${startPage}`)?.scrollIntoView({ block: "start" }));
  }, [sizes.length, startPage]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const scaleFor = (i: number) => width / (sizes[i]?.w ?? 842);
  const pointer = (e: React.PointerEvent, page: number) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const s = scaleFor(page);
    return { x: (e.clientX - r.left) / s, y: (e.clientY - r.top) / s };
  };
  const changed = history.length > 1;

  return (
    <div className="fixed inset-0 z-[75] flex flex-col bg-background" role="dialog" aria-modal="true" aria-label={heading}>
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
        {/* Narrow screens: the heading on its own line, the buttons under it. */}
        <div className="w-full min-w-0 md:w-auto md:flex-1">
          <div className="font-medium">{heading}</div>
          <div className="text-xs text-muted-foreground">{help}</div>
        </div>
        {sizes.length > 0 && (
          <Select
            aria-label="Go to page"
            value=""
            placeholder="Page…"
            className="h-8 w-28"
            onValueChange={(v) => document.getElementById(`draw-page-${v}`)?.scrollIntoView({ block: "start", behavior: "smooth" })}
            options={sizes.map((_, i) => ({ value: String(i), label: `Page ${i + 1}` }))}
          />
        )}
        <span className="text-sm tabular-nums text-muted-foreground">{boxes.length ? `${boxes.length} box${boxes.length === 1 ? "" : "es"}` : "No box yet"}</span>
        <Button variant="ghost" size="sm" disabled={!changed} onClick={undo} title="Undo (Ctrl+Z, or ⌘Z on a Mac)">
          ↶ Undo
        </Button>
        {extraActions}
        <Button variant="outline" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" disabled={!boxes.length || !changed} onClick={() => onSave(boxes)}>
          {saveLabel}
        </Button>
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto bg-zinc-200/70 p-4">
        {error && <p className="text-sm text-destructive">Couldn&apos;t open the PDF: {error}</p>}
        {!doc && !error && <p className="text-sm text-muted-foreground">Opening the PDF…</p>}
        {doc &&
          sizes.map((size, i) => {
            const s = scaleFor(i);
            const w = size.w * s;
            const h = size.h * s;
            return (
              <div key={i} id={`draw-page-${i}`} className="mx-auto mb-4 scroll-mt-2" style={{ width: w }}>
                <div className="mb-1 text-xs text-muted-foreground">Page {i + 1}</div>
                <div
                  className="relative cursor-crosshair touch-none select-none shadow-sm ring-1 ring-black/5"
                  style={{ width: w, height: h }}
                  onPointerDown={(e) => {
                    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                    const p = pointer(e, i);
                    setDrag({ page: i, x: p.x, y: p.y, x2: p.x, y2: p.y });
                  }}
                  onPointerMove={(e) => {
                    if (!drag || drag.page !== i) return;
                    const p = pointer(e, i);
                    setDrag({ ...drag, x2: p.x, y2: p.y });
                  }}
                  onPointerUp={() => {
                    if (!drag) return;
                    const b = { page: i, x0: Math.min(drag.x, drag.x2), y0: Math.min(drag.y, drag.y2), x1: Math.max(drag.x, drag.x2), y1: Math.max(drag.y, drag.y2) };
                    setDrag(null);
                    if (b.x1 - b.x0 > 12 && b.y1 - b.y0 > 8) change([...boxes, b]);
                  }}
                >
                  <PdfPageCanvas doc={doc} pageIndex={i} scale={s} width={w} height={h} />
                  {outlines
                    .filter((g) => g.page === i)
                    .map((g, k) => (
                      <div
                        key={k}
                        className={g.dashed ? "pointer-events-none absolute border border-dashed border-red-400/70" : "pointer-events-none absolute border border-sky-400/60 bg-sky-400/5"}
                        style={{ left: g.x0 * s, top: g.y0 * s, width: (g.x1 - g.x0) * s, height: (g.y1 - g.y0) * s }}
                      >
                        <span className="absolute -top-4 left-0 rounded bg-white/90 px-1 text-[10px] text-sky-800">{g.label}</span>
                      </div>
                    ))}
                  {boxes.map((b, k) =>
                    b.page !== i ? null : (
                      <div key={`n${k}`} className="absolute border-2 border-amber-500 bg-amber-400/15" style={{ left: b.x0 * s, top: b.y0 * s, width: (b.x1 - b.x0) * s, height: (b.y1 - b.y0) * s }}>
                        <span className="pointer-events-none absolute -top-5 left-0 rounded bg-amber-500 px-1 text-[10px] font-medium text-white">{boxLabel}</span>
                        <button
                          type="button"
                          aria-label="Remove this box"
                          title="Remove this box"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={() => change(boxes.filter((_, j) => j !== k))}
                          className="absolute -right-2.5 -top-2.5 flex size-5 items-center justify-center rounded-full bg-amber-600 text-xs leading-none text-white shadow hover:bg-red-600 pointer-coarse:size-7"
                        >
                          ×
                        </button>
                      </div>
                    ),
                  )}
                  {drag && drag.page === i && (
                    <div
                      className="pointer-events-none absolute border-2 border-dashed border-amber-500 bg-amber-400/10"
                      style={{ left: Math.min(drag.x, drag.x2) * s, top: Math.min(drag.y, drag.y2) * s, width: Math.abs(drag.x2 - drag.x) * s, height: Math.abs(drag.y2 - drag.y) * s }}
                    />
                  )}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}

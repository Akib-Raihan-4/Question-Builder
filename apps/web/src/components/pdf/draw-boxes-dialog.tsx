"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { PdfPageCanvas } from "@/components/pdf/pdf-page-canvas";
import { getPdfDoc } from "@/components/pdf/pdf-cache";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useUndoShortcut } from "@/components/use-undo-shortcut";
import { cn } from "@/lib/utils";
import { LoadingCard } from "@/components/loading-card";

export type DrawnBox = { page: number; x0: number; y0: number; x1: number; y1: number };
/** Boxes already on the document, shown faintly for reference. */
export type Outline = DrawnBox & { label: string; dashed?: boolean };

type Edge = { l?: boolean; r?: boolean; t?: boolean; b?: boolean };
type Drag =
  | { kind: "draw"; page: number; x: number; y: number; x2: number; y2: number }
  | { kind: "edit"; page: number; index: number; edge: Edge | null; x: number; y: number; orig: DrawnBox; live: DrawnBox; moved: boolean };

/** Corner and side handles on the selected box (edge: which sides a drag moves). */
const HANDLES: { edge: Edge; cls: string; cursor: string }[] = [
  { edge: { t: true, l: true }, cls: "-left-1.5 -top-1.5", cursor: "nwse-resize" },
  { edge: { t: true, r: true }, cls: "-right-1.5 -top-1.5", cursor: "nesw-resize" },
  { edge: { b: true, l: true }, cls: "-left-1.5 -bottom-1.5", cursor: "nesw-resize" },
  { edge: { b: true, r: true }, cls: "-right-1.5 -bottom-1.5", cursor: "nwse-resize" },
  { edge: { t: true }, cls: "left-1/2 -top-1.5 -translate-x-1/2", cursor: "ns-resize" },
  { edge: { b: true }, cls: "left-1/2 -bottom-1.5 -translate-x-1/2", cursor: "ns-resize" },
  { edge: { l: true }, cls: "-left-1.5 top-1/2 -translate-y-1/2", cursor: "ew-resize" },
  { edge: { r: true }, cls: "-right-1.5 top-1/2 -translate-y-1/2", cursor: "ew-resize" },
];

/**
 * Full-screen: every page of a PDF (a past paper or its mark scheme). Drag on a page to draw a
 * box — more than one if the content runs over pages. Click a box to select it, then drag it to
 * move it or drag its handles to resize it; remove one with its × (or Delete), and Undo
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
  const undo = () => {
    setHistory((h) => (h.length > 1 ? h.slice(0, -1) : h));
    setSelected(null);
  };
  useUndoShortcut(undo);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [width, setWidth] = useState<number | null>(null); // null until measured
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

  // Open on the page where the content is — once the pages have their final size.
  const measured = width != null;
  useEffect(() => {
    if (!sizes.length || startPage == null || !measured) return;
    requestAnimationFrame(() => document.getElementById(`draw-page-${startPage}`)?.scrollIntoView({ block: "start" }));
  }, [sizes.length, startPage, measured]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selected != null) setSelected(null);
        else onClose();
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selected != null && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        setHistory((h) => [...h, h[h.length - 1].filter((_, j) => j !== selected)]);
        setSelected(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, selected]);

  const scaleFor = (i: number) => (width ?? 800) / (sizes[i]?.w ?? 842);
  /** Pointer position in PDF points on page i (measured against the page, wherever the event started). */
  const pointer = (e: React.PointerEvent, page: number) => {
    const surface = (e.currentTarget as HTMLElement).closest("[data-draw-page]") ?? (e.currentTarget as HTMLElement);
    const r = surface.getBoundingClientRect();
    const s = scaleFor(page);
    return { x: (e.clientX - r.left) / s, y: (e.clientY - r.top) / s };
  };
  const clamp = (b: DrawnBox): DrawnBox => {
    const w = sizes[b.page]?.w ?? 1e4;
    const h = sizes[b.page]?.h ?? 1e4;
    const c = (v: number, max: number) => Math.max(0, Math.min(v, max));
    return { page: b.page, x0: c(Math.min(b.x0, b.x1), w), x1: c(Math.max(b.x0, b.x1), w), y0: c(Math.min(b.y0, b.y1), h), y1: c(Math.max(b.y0, b.y1), h) };
  };
  /** Start moving (edge null) or resizing a box. */
  const startEdit = (e: React.PointerEvent, page: number, index: number, edge: Edge | null) => {
    e.stopPropagation();
    e.preventDefault();
    setSelected(index);
    const surface = (e.currentTarget as HTMLElement).closest("[data-draw-page]") as HTMLElement | null;
    surface?.setPointerCapture(e.pointerId);
    const p = pointer(e, page);
    const orig = boxes[index];
    setDrag({ kind: "edit", page, index, edge, x: p.x, y: p.y, orig, live: orig, moved: false });
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
        {!doc && !error && <LoadingCard label="Opening the PDF…" className="mx-auto max-w-xl" />}
        {doc &&
          measured &&
          sizes.map((size, i) => {
            const s = scaleFor(i);
            const w = size.w * s;
            const h = size.h * s;
            return (
              <div key={i} id={`draw-page-${i}`} className="mx-auto mb-4 scroll-mt-2" style={{ width: w }}>
                <div className="mb-1 text-xs text-muted-foreground">Page {i + 1}</div>
                <div
                  data-draw-page
                  className="relative cursor-crosshair touch-none select-none shadow-sm ring-1 ring-black/5"
                  style={{ width: w, height: h }}
                  onPointerDown={(e) => {
                    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                    const p = pointer(e, i);
                    setSelected(null);
                    setDrag({ kind: "draw", page: i, x: p.x, y: p.y, x2: p.x, y2: p.y });
                  }}
                  onPointerMove={(e) => {
                    if (!drag || drag.page !== i) return;
                    const p = pointer(e, i);
                    if (drag.kind === "draw") return setDrag({ ...drag, x2: p.x, y2: p.y });
                    const dx = p.x - drag.x;
                    const dy = p.y - drag.y;
                    if (!drag.moved && Math.hypot(dx, dy) * s < 3) return; // a click, not a drag
                    const o = drag.orig;
                    const g = drag.edge;
                    const live = g
                      ? { page: o.page, x0: g.l ? o.x0 + dx : o.x0, x1: g.r ? o.x1 + dx : o.x1, y0: g.t ? o.y0 + dy : o.y0, y1: g.b ? o.y1 + dy : o.y1 }
                      : { page: o.page, x0: o.x0 + dx, x1: o.x1 + dx, y0: o.y0 + dy, y1: o.y1 + dy };
                    setDrag({ ...drag, live: clamp(live), moved: true });
                  }}
                  onPointerUp={() => {
                    if (!drag) return;
                    setDrag(null);
                    if (drag.kind === "edit") {
                      const b = drag.live;
                      if (drag.moved && b.x1 - b.x0 > 8 && b.y1 - b.y0 > 6) change(boxes.map((x, j) => (j === drag.index ? b : x)));
                      return;
                    }
                    const b = { page: i, x0: Math.min(drag.x, drag.x2), y0: Math.min(drag.y, drag.y2), x1: Math.max(drag.x, drag.x2), y1: Math.max(drag.y, drag.y2) };
                    if (b.x1 - b.x0 > 12 && b.y1 - b.y0 > 8) {
                      change([...boxes, clamp(b)]);
                      setSelected(boxes.length);
                    }
                  }}
                  onPointerCancel={() => setDrag(null)}
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
                  {boxes.map((box, k) => {
                    const b = drag?.kind === "edit" && drag.index === k ? drag.live : box;
                    if (b.page !== i) return null;
                    const on = selected === k;
                    return (
                      <div
                        key={`n${k}`}
                        onPointerDown={(e) => startEdit(e, i, k, null)}
                        className={cn("absolute cursor-move border-2 border-amber-500 bg-amber-400/15", on && "z-10 bg-amber-400/25 outline outline-2 outline-offset-1 outline-amber-600")}
                        style={{ left: b.x0 * s, top: b.y0 * s, width: (b.x1 - b.x0) * s, height: (b.y1 - b.y0) * s }}
                      >
                        <span className="pointer-events-none absolute -top-5 left-0 rounded bg-amber-500 px-1 text-[10px] font-medium text-white">{boxLabel}</span>
                        {on &&
                          HANDLES.map((hd, j) => (
                            <span
                              key={j}
                              onPointerDown={(e) => startEdit(e, i, k, hd.edge)}
                              // Bigger on touch screens, with an invisible hit area around each handle.
                              className={cn("absolute size-3 rounded-sm border border-amber-700 bg-white pointer-coarse:size-4 before:absolute before:-inset-3 before:content-['']", hd.cls)}
                              style={{ cursor: hd.cursor }}
                            />
                          ))}
                        <button
                          type="button"
                          aria-label="Remove this box"
                          title="Remove this box"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={() => {
                            change(boxes.filter((_, j) => j !== k));
                            setSelected(null);
                          }}
                          className="absolute -right-2.5 -top-2.5 flex size-5 items-center justify-center rounded-full bg-amber-600 text-xs leading-none text-white shadow hover:bg-red-600 pointer-coarse:size-7"
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                  {drag?.kind === "draw" && drag.page === i && (
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

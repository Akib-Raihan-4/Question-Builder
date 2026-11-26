"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { PdfPageCanvas } from "@/components/pdf/pdf-page-canvas";
import { getPdfDoc } from "@/components/pdf/pdf-cache";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useUndoShortcut } from "@/components/use-undo-shortcut";
import { cn } from "@/lib/utils";
import { LoadingCard } from "@/components/loading-card";

/** A box in PDF points. `label`: the row it belongs to, in the labelled (whole mark scheme) mode. */
export type DrawnBox = { page: number; x0: number; y0: number; x1: number; y1: number; label?: string };
/** Boxes already on the document, shown faintly for reference. */
export type Outline = DrawnBox & { label: string; dashed?: boolean };

/**
 * Labelled mode: every box belongs to a row ("1(a)"), new boxes get the label typed in the
 * toolbar, a selected box can be given another label, and each row can carry its marks.
 */
export type RowLabels = {
  /** Label for new boxes when the editor opens ("1(a)"). */
  newLabel: string;
  /** Labels offered while typing (the paper's questions and parts). */
  suggestions: string[];
  /** Marks per row label, as saved. */
  marks?: Record<string, number | null>;
  /** How a typed label is tidied ("1a" → "1(a)"); unchanged when it can't be read. */
  tidy?: (label: string) => string;
};

type Snap = { boxes: DrawnBox[]; marks: Record<string, number | null> };
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

/** A steady colour per row label, so neighbouring rows are easy to tell apart. */
function hue(label: string) {
  let h = 0;
  for (const c of label) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

/** "1(a)" before "1(b)" before "2" before "10". */
export function compareLabels(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true });
}

/**
 * Full-screen: every page of a PDF (a past paper or its mark scheme). Drag on a page to draw a
 * box — more than one if the content runs over pages. Click a box to select it, then drag it to
 * move it or drag its handles to resize it; remove one with its × (or Delete), and Undo
 * (button, or Ctrl+Z / ⌘Z) steps back through every change. Coordinates are PDF points from the
 * page's top-left as displayed (rotation applied), like every stored region.
 *
 * With `rows` (labelled mode) it edits a whole mark scheme: every row's boxes at once.
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
  rows,
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
  rows?: RowLabels;
  onClose: () => void;
  onSave: (boxes: DrawnBox[], marks: Record<string, number | null>) => void;
}) {
  const labelled = Boolean(rows);
  const tidy = rows?.tidy ?? ((s: string) => s.trim());
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [sizes, setSizes] = useState<{ w: number; h: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Every state the boxes have been in: Undo goes back one.
  const [history, setHistory] = useState<Snap[]>([{ boxes: initialBoxes, marks: rows?.marks ?? {} }]);
  const { boxes, marks } = history[history.length - 1];
  const change = (next: DrawnBox[], nextMarks = marks) => setHistory((h) => [...h, { boxes: next, marks: nextMarks }]);
  const undo = () => {
    setHistory((h) => (h.length > 1 ? h.slice(0, -1) : h));
    setSelected(null);
  };
  useUndoShortcut(undo);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [width, setWidth] = useState<number | null>(null); // null until measured
  const [newLabel, setNewLabel] = useState(rows?.newLabel ?? "");
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

  // The page behind doesn't scroll (or show scrollbars) while this covers it.
  useEffect(() => {
    const html = document.documentElement;
    const before = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = before;
    };
  }, []);

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
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (e.key === "Escape") {
        if (typing) (e.target as HTMLElement).blur();
        else if (selected != null) setSelected(null);
        else onClose();
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selected != null && !typing) {
        e.preventDefault();
        setHistory((h) => {
          const last = h[h.length - 1];
          return [...h, { ...last, boxes: last.boxes.filter((_, j) => j !== selected) }];
        });
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
    return { ...b, x0: c(Math.min(b.x0, b.x1), w), x1: c(Math.max(b.x0, b.x1), w), y0: c(Math.min(b.y0, b.y1), h), y1: c(Math.max(b.y0, b.y1), h) };
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
  const labelOf = (b: DrawnBox) => (labelled ? (b.label ?? "") : boxLabel);
  const sel = selected != null ? boxes[selected] : null;
  const selLabel = sel ? labelOf(sel) : null;

  // The rows, for the list beside the pages.
  const rowList = useMemo(() => {
    if (!labelled) return [];
    const by = new Map<string, number[]>();
    boxes.forEach((b, i) => by.set(b.label ?? "", [...(by.get(b.label ?? "") ?? []), i]));
    return [...by.entries()].sort((a, b) => compareLabels(a[0], b[0]));
  }, [boxes, labelled]);

  const goTo = (index: number) => {
    setSelected(index);
    const b = boxes[index];
    const page = document.getElementById(`draw-page-${b.page}`);
    const scroller = scrollRef.current;
    if (page && scroller) {
      const top = page.offsetTop + 18 + b.y0 * scaleFor(b.page) - 80;
      scroller.scrollTo({ top, behavior: "smooth" });
    }
  };

  /** Give the selected box (or every box of its row) another label. */
  const relabel = (to: string, wholeRow: boolean) => {
    if (selected == null || !sel) return;
    const label = tidy(to);
    if (!label || label === sel.label) return;
    const from = sel.label;
    const next = boxes.map((b, j) => (j === selected || (wholeRow && b.label === from) ? { ...b, label } : b));
    const nextMarks = { ...marks };
    if (wholeRow && from != null && from in nextMarks && !(label in nextMarks)) {
      nextMarks[label] = nextMarks[from];
      delete nextMarks[from];
    }
    change(next, nextMarks);
  };

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
        {!labelled && (
          <span className="text-sm tabular-nums text-muted-foreground">{boxes.length ? `${boxes.length} box${boxes.length === 1 ? "" : "es"}` : "No box yet"}</span>
        )}
        <Button variant="ghost" size="sm" disabled={!changed} onClick={undo} title="Undo (Ctrl+Z, or ⌘Z on a Mac)">
          ↶ Undo
        </Button>
        {extraActions}
        <Button variant="outline" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" disabled={(!labelled && !boxes.length) || !changed} onClick={() => onSave(boxes, marks)}>
          {saveLabel}
        </Button>
      </div>

      {labelled && (
        <LabelBar
          newLabel={newLabel}
          onNewLabel={(v) => setNewLabel(tidy(v))}
          suggestions={rows!.suggestions}
          selLabel={selLabel}
          selMarks={selLabel != null ? (marks[selLabel] ?? null) : null}
          rowBoxes={selLabel != null ? boxes.filter((b) => b.label === selLabel).length : 0}
          onRelabel={relabel}
          onMarks={(v) => selLabel != null && change(boxes, { ...marks, [selLabel]: v })}
          onDelete={() => {
            if (selected == null) return;
            change(boxes.filter((_, j) => j !== selected));
            setSelected(null);
          }}
          onDeleteRow={() => {
            if (selLabel == null) return;
            change(boxes.filter((b) => b.label !== selLabel));
            setSelected(null);
          }}
        />
      )}

      <div className="flex min-h-0 flex-1">
        {labelled && (
          <nav aria-label="Rows" className="hidden w-44 shrink-0 overflow-y-auto border-r bg-muted/30 p-2 text-sm md:block">
            <div className="mb-1 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Rows ({rowList.length})</div>
            {rowList.length === 0 && <p className="px-1 text-xs text-muted-foreground">No rows yet. Drag on a page to draw one.</p>}
            {rowList.map(([label, idx]) => (
              <button
                key={label}
                type="button"
                onClick={() => goTo(idx[0])}
                className={cn("flex w-full items-center gap-2 rounded px-1.5 py-1 text-left hover:bg-muted", selLabel === label && "bg-background font-medium shadow-sm")}
              >
                <span className="size-2.5 shrink-0 rounded-sm" style={{ background: `hsl(${hue(label)} 70% 45%)` }} aria-hidden />
                <span className="min-w-0 flex-1 truncate font-mono text-xs">{label || "(no label)"}</span>
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {marks[label] != null ? `${marks[label]}m` : ""}
                  {idx.length > 1 ? ` ·${idx.length}` : ""}
                </span>
              </button>
            ))}
          </nav>
        )}
        <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto bg-zinc-200/70 p-4">
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
                        ? { ...o, x0: g.l ? o.x0 + dx : o.x0, x1: g.r ? o.x1 + dx : o.x1, y0: g.t ? o.y0 + dy : o.y0, y1: g.b ? o.y1 + dy : o.y1 }
                        : { ...o, x0: o.x0 + dx, x1: o.x1 + dx, y0: o.y0 + dy, y1: o.y1 + dy };
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
                      const b: DrawnBox = { page: i, x0: Math.min(drag.x, drag.x2), y0: Math.min(drag.y, drag.y2), x1: Math.max(drag.x, drag.x2), y1: Math.max(drag.y, drag.y2) };
                      if (labelled) b.label = newLabel || "?";
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
                      const label = labelOf(box);
                      const sameRow = labelled && selLabel != null && label === selLabel && !on;
                      const c = labelled ? hue(label) : null;
                      return (
                        <div
                          key={`n${k}`}
                          onPointerDown={(e) => startEdit(e, i, k, null)}
                          className={cn(
                            "absolute cursor-move border-2",
                            !labelled && "border-amber-500 bg-amber-400/15",
                            on && "z-10 outline outline-2 outline-offset-1",
                            on && !labelled && "bg-amber-400/25 outline-amber-600",
                            sameRow && "outline outline-1 outline-offset-1",
                          )}
                          style={{
                            left: b.x0 * s,
                            top: b.y0 * s,
                            width: (b.x1 - b.x0) * s,
                            height: (b.y1 - b.y0) * s,
                            ...(c != null && {
                              borderColor: `hsl(${c} 70% 45%)`,
                              background: `hsl(${c} 80% 55% / ${on ? 0.22 : 0.1})`,
                              outlineColor: `hsl(${c} 70% 35%)`,
                            }),
                          }}
                        >
                          <span
                            className={cn("pointer-events-none absolute -top-5 left-0 rounded px-1 text-[10px] font-medium text-white", !labelled && "bg-amber-500")}
                            style={c != null ? { background: `hsl(${c} 70% 40%)` } : undefined}
                          >
                            {label || "?"}
                            {labelled && marks[label] != null ? ` · ${marks[label]}m` : ""}
                          </span>
                          {on &&
                            HANDLES.map((hd, j) => (
                              <span
                                key={j}
                                onPointerDown={(e) => startEdit(e, i, k, hd.edge)}
                                // Bigger on touch screens, with an invisible hit area around each handle.
                                className={cn("absolute size-3 rounded-sm border border-zinc-700 bg-white pointer-coarse:size-4 before:absolute before:-inset-3 before:content-['']", hd.cls)}
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
                            className={cn(
                              "absolute -right-2.5 -top-2.5 size-5 items-center justify-center rounded-full bg-zinc-700 text-xs leading-none text-white shadow hover:bg-red-600 pointer-coarse:size-7",
                              // Labelled mode: only on the selected box (rows sit edge to edge).
                              labelled && !on ? "hidden" : "flex",
                            )}
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
                      >
                        {labelled && <span className="absolute -top-5 left-0 rounded bg-amber-500 px-1 text-[10px] font-medium text-white">{newLabel || "?"}</span>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}

/**
 * Labelled mode's second toolbar: the label for new boxes, and for the selected box its label
 * (this box or its whole row), its row's marks, and remove.
 */
function LabelBar({
  newLabel,
  onNewLabel,
  suggestions,
  selLabel,
  selMarks,
  rowBoxes,
  onRelabel,
  onMarks,
  onDelete,
  onDeleteRow,
}: {
  newLabel: string;
  onNewLabel: (v: string) => void;
  suggestions: string[];
  selLabel: string | null;
  selMarks: number | null;
  rowBoxes: number;
  onRelabel: (to: string, wholeRow: boolean) => void;
  onMarks: (v: number | null) => void;
  onDelete: () => void;
  onDeleteRow: () => void;
}) {
  const [draftNew, setDraftNew] = useState(newLabel);
  useEffect(() => setDraftNew(newLabel), [newLabel]);
  const [draftSel, setDraftSel] = useState(selLabel ?? "");
  useEffect(() => setDraftSel(selLabel ?? ""), [selLabel]);
  const [draftMarks, setDraftMarks] = useState(selMarks == null ? "" : String(selMarks));
  useEffect(() => setDraftMarks(selMarks == null ? "" : String(selMarks)), [selMarks, selLabel]);
  const commitMarks = () => {
    const v = draftMarks.trim() === "" ? null : Number(draftMarks);
    if (v === null || (Number.isInteger(v) && v >= 0 && v <= 200)) {
      if (v !== selMarks) onMarks(v);
    } else setDraftMarks(selMarks == null ? "" : String(selMarks));
  };
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b bg-muted/40 px-4 py-2 text-sm">
      <datalist id="row-label-suggestions">
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <label className="flex items-center gap-2">
        <span className="text-muted-foreground">New boxes are row</span>
        <Input
          value={draftNew}
          list="row-label-suggestions"
          aria-label="Row label for new boxes"
          placeholder="1(a)"
          className="h-8 w-24 font-mono"
          onChange={(e) => setDraftNew(e.target.value)}
          onBlur={() => onNewLabel(draftNew)}
          onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
        />
      </label>
      {selLabel != null ? (
        <div className="flex flex-wrap items-center gap-2 border-l pl-4">
          <span className="text-muted-foreground">Selected box:</span>
          <Input
            value={draftSel}
            list="row-label-suggestions"
            aria-label="Label of the selected box's row"
            className="h-8 w-24 font-mono"
            onChange={(e) => setDraftSel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onRelabel(draftSel, true);
            }}
          />
          <Button size="sm" variant="outline" disabled={!draftSel.trim() || draftSel.trim() === selLabel} onClick={() => onRelabel(draftSel, true)}>
            {rowBoxes > 1 ? `Rename row (${rowBoxes} boxes)` : "Rename row"}
          </Button>
          {rowBoxes > 1 && (
            <Button size="sm" variant="ghost" disabled={!draftSel.trim() || draftSel.trim() === selLabel} onClick={() => onRelabel(draftSel, false)} title="Move only this box to the row typed">
              This box only
            </Button>
          )}
          <label className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Marks</span>
            <Input
              value={draftMarks}
              inputMode="numeric"
              aria-label="Marks for this row"
              placeholder="–"
              className="h-8 w-14 tabular-nums"
              onChange={(e) => setDraftMarks(e.target.value.replace(/[^0-9]/g, ""))}
              onBlur={commitMarks}
              onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
            />
          </label>
          <Button size="sm" variant="ghost" className="text-destructive" onClick={onDelete}>
            Remove box
          </Button>
          {rowBoxes > 1 && (
            <Button size="sm" variant="ghost" className="text-destructive" onClick={onDeleteRow}>
              Remove row
            </Button>
          )}
        </div>
      ) : (
        <span className="text-xs text-muted-foreground">Click a box to rename its row, set its marks or remove it.</span>
      )}
    </div>
  );
}

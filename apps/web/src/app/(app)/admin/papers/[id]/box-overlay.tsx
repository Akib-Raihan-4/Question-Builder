"use client";

import { useRef, useState } from "react";
import { normalizeRect, pdfToScreen, type PdfRect } from "@/lib/coords";
import type { ReviewRegion } from "@/lib/review/types";
import { cn } from "@/lib/utils";

export type Owner = { type: "question" | "part"; id: string };

type Edge = { l?: boolean; r?: boolean; t?: boolean; b?: boolean };
type Drag =
  | { kind: "move" | "resize"; regionId: string; edge: Edge; startX: number; startY: number; orig: PdfRect; moved: boolean }
  | { kind: "draw"; startX: number; startY: number; rect: PdfRect };

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
 * Editable boxes for one page. All maths goes through coords.ts: boxes are stored in PDF
 * points (top-left) and drawn at `scale` CSS px per point.
 */
export function BoxOverlay({
  page,
  scale,
  pageWidthPt,
  pageHeightPt,
  regions,
  labels,
  lowConfidence,
  selectedOwner,
  selectedRegionId,
  onSelect,
  onChange,
  onCommit,
  onDraw,
  drawMode = false,
}: {
  page: number;
  scale: number;
  pageWidthPt: number;
  pageHeightPt: number;
  regions: ReviewRegion[];
  labels: Record<string, string>; // ownerId -> "Q3", "Q3(a)"
  lowConfidence: Set<string>; // question ids
  selectedOwner: Owner | null;
  selectedRegionId: string | null;
  onSelect: (owner: Owner, regionId: string | null) => void;
  onChange: (region: ReviewRegion) => void;
  onCommit: (region: ReviewRegion) => void;
  onDraw: (page: number, rect: PdfRect) => void;
  /** "Draw box" is on: dragging anywhere draws (no Shift needed — works with touch and pens). */
  drawMode?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);

  const toPt = (clientX: number, clientY: number) => {
    const box = ref.current!.getBoundingClientRect();
    return { x: (clientX - box.left) / scale, y: (clientY - box.top) / scale };
  };
  const clamp = (r: PdfRect): PdfRect => ({
    x0: Math.max(0, Math.min(r.x0, pageWidthPt)),
    x1: Math.max(0, Math.min(r.x1, pageWidthPt)),
    y0: Math.max(0, Math.min(r.y0, pageHeightPt)),
    y1: Math.max(0, Math.min(r.y1, pageHeightPt)),
  });

  function startBoxDrag(e: React.PointerEvent, region: ReviewRegion, kind: "move" | "resize", edge: Edge = {}) {
    e.stopPropagation();
    // On touch, the first tap only selects a box (so the page can still be scrolled with a
    // finger); once selected, dragging it moves it.
    if (e.pointerType === "touch" && kind === "move" && selectedRegionId !== region.id) {
      onSelect({ type: region.ownerType, id: region.ownerId }, region.id);
      return;
    }
    e.preventDefault();
    onSelect({ type: region.ownerType, id: region.ownerId }, region.id);
    const p = toPt(e.clientX, e.clientY);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    setDrag({ kind, regionId: region.id, edge, startX: p.x, startY: p.y, orig: { ...region }, moved: false });
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!(drawMode || e.shiftKey) || !selectedOwner) return;
    e.preventDefault();
    const p = toPt(e.clientX, e.clientY);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    setDrag({ kind: "draw", startX: p.x, startY: p.y, rect: { x0: p.x, y0: p.y, x1: p.x, y1: p.y } });
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag) return;
    const p = toPt(e.clientX, e.clientY);
    const dx = p.x - drag.startX;
    const dy = p.y - drag.startY;
    if (drag.kind === "draw") {
      setDrag({ ...drag, rect: clamp({ x0: drag.startX, y0: drag.startY, x1: p.x, y1: p.y }) });
      return;
    }
    if (!drag.moved && Math.hypot(dx, dy) * scale < 3) return; // click, not drag
    const o = drag.orig;
    const next: PdfRect =
      drag.kind === "move"
        ? { x0: o.x0 + dx, x1: o.x1 + dx, y0: o.y0 + dy, y1: o.y1 + dy }
        : {
            x0: drag.edge.l ? o.x0 + dx : o.x0,
            x1: drag.edge.r ? o.x1 + dx : o.x1,
            y0: drag.edge.t ? o.y0 + dy : o.y0,
            y1: drag.edge.b ? o.y1 + dy : o.y1,
          };
    const region = regions.find((r) => r.id === drag.regionId);
    if (region) onChange({ ...region, ...normalizeRect(clamp(next)) });
    if (!drag.moved) setDrag({ ...drag, moved: true });
  }

  function onPointerUp() {
    if (!drag) return;
    if (drag.kind === "draw") {
      const r = normalizeRect(drag.rect);
      if (r.x1 - r.x0 > 8 && r.y1 - r.y0 > 8) onDraw(page, r);
    } else if (drag.moved) {
      const region = regions.find((r) => r.id === drag.regionId);
      if (region) onCommit(region);
    }
    setDrag(null);
  }

  // Questions first, parts on top so a click inside a part selects the part.
  const ordered = [...regions].sort((a, b) => (a.ownerType === b.ownerType ? 0 : a.ownerType === "question" ? -1 : 1));

  return (
    <div
      ref={ref}
      className={cn("absolute inset-0", selectedOwner && (drawMode ? "cursor-crosshair" : "sm:cursor-crosshair"))}
      style={{ touchAction: drawMode ? "none" : undefined }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setDrag(null)}
    >
      {ordered.map((r) => {
        const s = pdfToScreen(r, scale);
        const isPart = r.ownerType === "part";
        const ownerSelected = selectedOwner?.id === r.ownerId;
        const regionSelected = selectedRegionId === r.id;
        const low = !isPart && lowConfidence.has(r.ownerId);
        return (
          <div
            key={r.id}
            data-region={r.id}
            onPointerDown={(e) => startBoxDrag(e, r, "move")}
            className={cn(
              "absolute cursor-move select-none",
              drawMode && "pointer-events-none", // draw over existing boxes
              isPart
                ? "border border-dashed border-violet-500/70 bg-violet-500/10 hover:bg-violet-500/15"
                : low
                  ? "border-2 border-orange-500 hover:bg-orange-500/5"
                  : "border-2 border-blue-500/80 hover:bg-blue-500/5",
              ownerSelected && (isPart ? "border-solid border-violet-600 bg-violet-500/20" : "ring-2 ring-blue-600/40"),
              regionSelected && "z-10 outline outline-2 outline-offset-1 outline-amber-500",
            )}
            style={{ left: s.left, top: s.top, width: s.width, height: s.height, touchAction: regionSelected ? "none" : undefined }}
          >
            <span
              className={cn(
                "pointer-events-none absolute rounded-sm px-1 text-xs font-semibold leading-4 text-white",
                isPart ? "right-0 top-0 bg-violet-600" : low ? "-top-4 left-0 bg-orange-500" : "-top-4 left-0 bg-blue-600",
              )}
            >
              {labels[r.ownerId] ?? "?"}
              {r.editedByAdmin ? " ✎" : ""}
            </span>
            {regionSelected &&
              HANDLES.map((h, i) => (
                <span
                  key={i}
                  onPointerDown={(e) => startBoxDrag(e, r, "resize", h.edge)}
                  // Bigger on touch screens, with an invisible 40px hit area around each handle.
                  className={cn(
                    "absolute size-3 rounded-sm border border-amber-600 bg-white pointer-coarse:size-4 before:absolute before:-inset-3 before:content-['']",
                    h.cls,
                  )}
                  style={{ cursor: h.cursor }}
                />
              ))}
          </div>
        );
      })}
      {drag?.kind === "draw" &&
        (() => {
          const s = pdfToScreen(drag.rect, scale);
          return (
            <div
              className="pointer-events-none absolute border-2 border-dashed border-amber-500 bg-amber-400/10"
              style={{ left: s.left, top: s.top, width: s.width, height: s.height }}
            />
          );
        })()}
    </div>
  );
}

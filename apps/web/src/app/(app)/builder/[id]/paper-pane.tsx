"use client";

import { useEffect, useRef, useState } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CropCanvas } from "@/components/pdf/crop-canvas";
import { chosenParts, dependencyWarnings, itemMarks, itemRegions, totalMarks, type Item } from "@/lib/builder/model";
import { useBuilder } from "@/lib/builder/store";
import { cn } from "@/lib/utils";

const A4_W = 595.28;

export function PaperPane({ saveState }: { saveState: string }) {
  const items = useBuilder((s) => s.items);
  const bank = useBuilder((s) => s.bank);
  const header = useBuilder((s) => s.header);
  const title = useBuilder((s) => s.title);
  const { setTitle, setHeader, move } = useBuilder.getState();
  const [showHeader, setShowHeader] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [sheetWidth, setSheetWidth] = useState(520);
  const total = totalMarks(items, bank);
  const target = header.targetMarks;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    const el = sheetRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSheetWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scale = sheetWidth / A4_W; // crops keep their size relative to the A4 page

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const from = items.findIndex((i) => i.questionId === e.active.id);
    const to = items.findIndex((i) => i.questionId === e.over!.id);
    move(from, to);
  }

  return (
    <aside className="flex w-[min(48vw,660px)] shrink-0 flex-col border-l bg-background">
      <div className="space-y-2 border-b px-4 py-2.5">
        <div className="flex items-center gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="min-w-0 flex-1 rounded-md px-1 text-base font-semibold outline-none hover:bg-muted focus:bg-muted"
            aria-label="Paper name"
          />
          <span className="shrink-0 text-xs text-muted-foreground">{saveState}</span>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="font-medium">
            {items.length} question{items.length === 1 ? "" : "s"} ·{" "}
            <span className={cn(target && total > target && "text-red-600")}>
              {total}
              {target ? ` / ${target}` : ""} marks
            </span>
          </span>
          {target && total > target ? <span className="text-xs text-red-600">{total - target} over your target</span> : null}
          <label className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
            Target
            <input
              inputMode="numeric"
              value={target ?? ""}
              placeholder="–"
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "");
                setHeader({ targetMarks: v ? Number(v) : undefined });
              }}
              className="h-7 w-12 rounded-md border px-1.5 text-right"
            />
          </label>
          <button onClick={() => setShowHeader((s) => !s)} className="rounded-md border px-2 py-1 text-xs hover:bg-muted">
            {showHeader ? "Hide header" : "Edit header"}
          </button>
        </div>
        {showHeader && (
          <div className="grid grid-cols-2 gap-2 pt-1 text-sm">
            {(
              [
                ["school", "School name"],
                ["title", "Paper title (e.g. Algebra test)"],
                ["className", "Class"],
                ["timeAllowed", "Time allowed"],
              ] as const
            ).map(([k, label]) => (
              <input
                key={k}
                placeholder={label}
                aria-label={label}
                value={header[k] ?? ""}
                onChange={(e) => setHeader({ [k]: e.target.value })}
                className="h-8 rounded-md border px-2"
              />
            ))}
            <textarea
              placeholder="Instructions for students"
              aria-label="Instructions"
              value={header.instructions ?? ""}
              onChange={(e) => setHeader({ instructions: e.target.value })}
              className="col-span-2 h-16 rounded-md border px-2 py-1"
            />
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-zinc-100 p-4">
        <div ref={sheetRef} className="mx-auto w-full max-w-[620px] bg-white px-0 pb-8 shadow-sm ring-1 ring-black/5">
          <div className="border-b px-6 pb-4 pt-6 text-center">
            {header.school && <div className="text-sm font-semibold uppercase tracking-wide">{header.school}</div>}
            <div className="text-lg font-bold">{header.title || title}</div>
            <div className="mt-1 flex justify-center gap-4 text-xs text-zinc-600">
              {header.className && <span>Class: {header.className}</span>}
              {header.timeAllowed && <span>Time: {header.timeAllowed}</span>}
              <span>Total: {total} marks</span>
            </div>
            {header.instructions && <p className="mt-2 whitespace-pre-line text-left text-xs text-zinc-700">{header.instructions}</p>}
          </div>

          {items.length === 0 ? (
            <p className="px-6 py-16 text-center text-sm text-muted-foreground">
              Your paper is empty. Click questions in the past paper on the left to add them.
            </p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={items.map((i) => i.questionId)} strategy={verticalListSortingStrategy}>
                {items.map((item, index) => (
                  <PreviewItem key={item.questionId} item={item} index={index} scale={scale} />
                ))}
              </SortableContext>
            </DndContext>
          )}
          {items.length > 0 && (
            <div className="mt-4 px-6 text-right text-sm font-bold">TOTAL FOR PAPER IS {total} MARKS</div>
          )}
        </div>
      </div>
    </aside>
  );
}

function PreviewItem({ item, index, scale }: { item: Item; index: number; scale: number }) {
  const bank = useBuilder((s) => s.bank);
  const { removeItem } = useBuilder.getState();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.questionId });
  const q = bank[item.questionId];
  if (!q) return null;
  const number = index + 1; // never stored
  const marks = itemMarks(item, bank);
  const parts = chosenParts(item, bank);
  const warnings = dependencyWarnings(item, bank);
  const regions = itemRegions(item, bank);
  const numberColW = 36;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("group relative border-b border-dashed border-zinc-200 pb-3 pt-4", isDragging && "z-10 bg-white shadow-lg")}
    >
      <div className="absolute right-2 top-1 flex items-center gap-1 opacity-60 transition-opacity group-hover:opacity-100">
        <span className="text-[11px] text-muted-foreground">
          {q.paperLabel} · Q{q.number}
          {parts.length ? parts.map((p) => `(${p.label})`).join("") : ""}
        </span>
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab rounded px-1.5 text-sm text-zinc-500 hover:bg-zinc-100 active:cursor-grabbing"
          aria-label={`Drag question ${number} to reorder`}
          title="Drag to reorder"
        >
          ⠿
        </button>
        <button
          onClick={() => removeItem(item.questionId)}
          className="rounded px-1.5 text-sm text-zinc-500 hover:bg-red-50 hover:text-red-600"
          aria-label={`Remove question ${number}`}
          title="Remove"
        >
          ✕
        </button>
      </div>
      {warnings.map((w) => (
        <p key={w} className="mx-6 mb-1 mt-2 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-800">⚠ {w}</p>
      ))}
      <div className="flex">
        <div className="shrink-0 pt-1 text-right text-[15px] font-bold" style={{ width: numberColW, paddingRight: 6 }}>
          {number}
        </div>
        <div className="min-w-0 space-y-1">
          {regions.map((r, i) => (
            <CropCanvas key={i} paperId={q.paperId} page={r.page} rect={r} scale={scale} />
          ))}
        </div>
      </div>
      <div className="pr-6 text-right text-[13px] font-bold" style={{ fontFamily: "Times New Roman, serif" }}>
        (Total for Question {number} is {marks} mark{marks === 1 ? "" : "s"})
      </div>
    </div>
  );
}

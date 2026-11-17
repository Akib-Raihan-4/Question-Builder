"use client";

import { pdfToScreen } from "@/lib/coords";
import type { BankQuestion, Item } from "@/lib/builder/model";
import { useBuilder } from "@/lib/builder/store";
import { cn } from "@/lib/utils";

/**
 * Invisible click targets over one source page. Click a part to add that part; click the
 * question-number tab (or the question outside its parts) to add the whole question.
 * Clicking something already added removes it.
 */
export function PickOverlay({ page, scale, questions }: { page: number; scale: number; questions: BankQuestion[] }) {
  const items = useBuilder((s) => s.items);
  const { addQuestion, addPart, removePart, removeItem } = useBuilder.getState();
  const itemOf = (q: BankQuestion): Item | undefined => items.find((i) => i.questionId === q.id);
  const serialOf = (q: BankQuestion) => items.findIndex((i) => i.questionId === q.id) + 1;

  return (
    <div className="absolute inset-0">
      {questions.map((q) => {
        const item = itemOf(q);
        const whole = item && item.partIds.length === 0;
        const qRegions = q.regions.filter((r) => r.page === page);
        const firstRegionHere = q.regions[0]?.page === page;
        return (
          <div key={q.id}>
            {qRegions.map((r, i) => {
              const s = pdfToScreen(r, scale);
              return (
                <button
                  key={`q${i}`}
                  type="button"
                  title={whole ? `Q${q.number} is in your paper as question ${serialOf(q)} — click to remove` : `Add all of Q${q.number}`}
                  onClick={() => (whole ? removeItem(q.id) : addQuestion(q))}
                  className={cn(
                    "group absolute rounded-sm transition-colors",
                    whole ? "bg-emerald-500/10 ring-2 ring-emerald-500" : "hover:bg-blue-500/5 hover:ring-2 hover:ring-blue-400",
                  )}
                  style={{ left: s.left, top: s.top, width: s.width, height: s.height }}
                />
              );
            })}
            {q.parts.flatMap((p) =>
              p.regions
                .filter((r) => r.page === page)
                .map((r, i) => {
                  const s = pdfToScreen(r, scale);
                  const picked = Boolean(whole || item?.partIds.includes(p.id));
                  return (
                    <button
                      key={`${p.id}${i}`}
                      type="button"
                      title={picked ? `Remove Q${q.number}(${p.label})` : `Add Q${q.number}(${p.label}) — ${p.marks} mark${p.marks === 1 ? "" : "s"}`}
                      onClick={() => (picked ? removePart(q, p.id) : addPart(q, p.id))}
                      className={cn(
                        "absolute rounded-sm transition-colors",
                        picked ? "bg-emerald-500/15 ring-1 ring-emerald-500" : "hover:bg-violet-500/10 hover:ring-2 hover:ring-violet-400",
                      )}
                      style={{ left: s.left, top: s.top, width: s.width, height: s.height }}
                    >
                      {picked && !whole && (
                        <span className="absolute right-1 top-1 rounded bg-emerald-600 px-1 text-[10px] font-semibold text-white">✓ ({p.label})</span>
                      )}
                    </button>
                  );
                }),
            )}
            {firstRegionHere && (() => {
              // Tab over the original question-number column, left of the crop.
              const r = q.regions[0];
              const s = pdfToScreen({ x0: r.x0 - 22, x1: r.x0 - 1, y0: r.y0, y1: r.y0 + 22 }, scale);
              return (
                <button
                  type="button"
                  onClick={() => (whole ? removeItem(q.id) : addQuestion(q))}
                  title={whole ? "Remove this question" : `Add all of Q${q.number} (${q.totalMarks} marks)`}
                  className={cn(
                    "absolute z-10 flex items-center justify-center rounded text-[11px] font-bold shadow-sm",
                    item ? "bg-emerald-600 text-white" : "bg-blue-600 text-white opacity-80 hover:opacity-100",
                  )}
                  style={{ left: s.left, top: s.top, width: s.width, height: s.height }}
                >
                  {item ? `✓${serialOf(q)}` : "+"}
                </button>
              );
            })()}
          </div>
        );
      })}
    </div>
  );
}

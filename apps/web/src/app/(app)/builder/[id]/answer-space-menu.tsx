"use client";

import { Popover } from "@base-ui/react/popover";
import type { AnswerSpace } from "@/db/schema";
import { describeAnswerSpace, MAX_LINES, MAX_SPACE_CM } from "@/lib/builder/answer-space";
import { itemRegions, type Item } from "@/lib/builder/model";
import { useBuilder } from "@/lib/builder/store";
import { toast } from "@/components/feedback";
import { cn } from "@/lib/utils";

const DEFAULTS = { lines: 6, space: 4 } as const;

/** Per-question answer space: remove the original, add lines or blank space, or apply to all. */
export function AnswerSpaceMenu({ item, number }: { item: Item; number: number }) {
  const bank = useBuilder((s) => s.bank);
  const count = useBuilder((s) => s.items.length);
  const { setAnswerSpace } = useBuilder.getState();
  const space = item.answerSpace ?? null;
  const removable = itemRegions(item, bank).some((r) => r.gaps?.length);
  const set = (next: AnswerSpace) => setAnswerSpace(item.questionId, next.remove || next.add ? next : null);
  const add = space?.add;
  const changed = Boolean(space?.remove || add);

  return (
    <Popover.Root>
      <Popover.Trigger
        className={cn(
          "whitespace-nowrap rounded px-1.5 py-0.5 text-xs pointer-coarse:py-1.5",
          changed ? "bg-sky-50 text-sky-800 hover:bg-sky-100" : "text-zinc-500 hover:bg-zinc-100",
        )}
        title="Answer space for this question"
      >
        {changed ? describeAnswerSpace(space) : "Answer space"}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} align="end" className="z-[80]">
          <Popover.Popup className="w-72 rounded-xl border bg-popover p-3 text-sm shadow-lg outline-none transition-[scale,opacity] duration-100 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
            <Popover.Title className="mb-2 font-medium">Answer space · question {number}</Popover.Title>

            <label className={cn("flex items-start gap-2", !removable && "opacity-50")}>
              <input
                type="checkbox"
                className="mt-0.5"
                disabled={!removable}
                checked={Boolean(space?.remove)}
                onChange={(e) => set({ ...space, remove: e.target.checked })}
              />
              <span>
                Remove the past paper&apos;s answer lines and working space
                {!removable && <span className="block text-xs text-muted-foreground">Nothing to remove in this question.</span>}
              </span>
            </label>

            <div className="mt-3 text-xs font-medium text-muted-foreground">Add after the question</div>
            <div className="mt-1 inline-flex rounded-lg bg-muted p-0.5" role="radiogroup" aria-label="Add after the question">
              {(
                [
                  ["none", "Nothing"],
                  ["lines", "Lines"],
                  ["space", "Blank space"],
                ] as const
              ).map(([k, label]) => {
                const on = (add?.kind ?? "none") === k;
                return (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => set({ ...space, add: k === "none" ? undefined : { kind: k, amount: add?.kind === k ? add.amount : DEFAULTS[k] } })}
                    className={cn("rounded-md px-2.5 py-1 text-xs pointer-coarse:py-1.5", on ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {add && (
              <div className="mt-2 flex items-center gap-2">
                <Stepper
                  value={add.amount}
                  min={1}
                  max={add.kind === "lines" ? MAX_LINES : MAX_SPACE_CM}
                  label={add.kind === "lines" ? "Number of lines" : "Centimetres of space"}
                  onChange={(amount) => set({ ...space, add: { ...add, amount } })}
                />
                <span className="text-xs text-muted-foreground">{add.kind === "lines" ? (add.amount === 1 ? "line" : "lines") : "cm"}</span>
              </div>
            )}

            <div className="mt-3 flex items-center justify-between border-t pt-2">
              <button
                type="button"
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-40"
                disabled={!changed}
                onClick={() => setAnswerSpace(item.questionId, null)}
              >
                Reset
              </button>
              {count > 1 && (
                <button
                  type="button"
                  className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
                  onClick={() => {
                    setAnswerSpace(null, space);
                    toast(`All ${count} questions: ${describeAnswerSpace(space).toLowerCase()}`);
                  }}
                >
                  Apply to all questions
                </button>
              )}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function Stepper({ value, min, max, label, onChange }: { value: number; min: number; max: number; label: string; onChange: (v: number) => void }) {
  const btn = "flex size-8 items-center justify-center rounded-md border text-base hover:bg-muted disabled:opacity-40 pointer-coarse:size-10";
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <button type="button" className={btn} aria-label="Fewer" disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>
        −
      </button>
      <input
        aria-label={label}
        inputMode="numeric"
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value.replace(/\D/g, ""));
          if (n) onChange(Math.min(max, Math.max(min, n)));
        }}
        className="h-8 w-12 rounded-md border text-center tabular-nums pointer-coarse:h-10"
      />
      <button type="button" className={btn} aria-label="More" disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
        +
      </button>
    </div>
  );
}

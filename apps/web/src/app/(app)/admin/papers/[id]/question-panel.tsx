"use client";

import { useState } from "react";
import type { QuestionIssue } from "@/lib/review/checks";
import type { ReviewData, ReviewQuestion } from "@/lib/review/types";
import { cn } from "@/lib/utils";
import type { Owner } from "./box-overlay";
import { confirmDialog } from "@/components/feedback";

type Api = (url: string, method: string, body?: unknown) => Promise<unknown>;
type Run = (fn: () => Promise<unknown>, success?: string) => Promise<void>;

const numCls =
  "h-7 w-12 rounded-md border border-input bg-transparent px-1.5 text-right text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

/** Commit-on-blur/Enter number input. */
function MarksInput({ value, onCommit, label }: { value: number; onCommit: (n: number) => void; label: string }) {
  const [v, setV] = useState(String(value));
  const [prev, setPrev] = useState(value);
  if (value !== prev) {
    setPrev(value);
    setV(String(value));
  }
  const commit = () => {
    const n = Number(v);
    if (Number.isInteger(n) && n >= 0 && n !== value) onCommit(n);
    else setV(String(value));
  };
  return (
    <input
      aria-label={label}
      className={numCls}
      inputMode="numeric"
      value={v}
      onChange={(e) => setV(e.target.value.replace(/\D/g, ""))}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
    />
  );
}

export function QuestionPanel({
  data,
  issues,
  owner,
  busy,
  onSelect,
  run,
  api,
}: {
  data: ReviewData;
  issues: QuestionIssue[];
  owner: Owner | null;
  busy: boolean;
  onSelect: (o: Owner) => void;
  run: Run;
  api: Api;
}) {
  const [filter, setFilter] = useState<"all" | "issues">("all");
  const selectedQuestionId =
    owner?.type === "question" ? owner.id : data.parts.find((p) => p.id === owner?.id)?.questionId;
  const shown = data.questions.filter((q) => filter === "all" || issues.some((i) => i.questionId === q.id));

  return (
    <aside className="flex w-[380px] shrink-0 flex-col border-l bg-background">
      <div className="flex items-center gap-2 border-b px-3 py-2 text-sm">
        {(["all", "issues"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn("rounded-md px-2 py-1", filter === f ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground")}
          >
            {f === "all" ? `All (${data.questions.length})` : `To fix (${new Set(issues.map((i) => i.questionId)).size})`}
          </button>
        ))}
      </div>
      <AddQuestion data={data} busy={busy} run={run} api={api} />
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {shown.length === 0 && data.questions.length > 0 && <p className="p-4 text-center text-sm text-muted-foreground">Nothing to fix. 🎉</p>}
        {shown.map((q) => (
          <QuestionCard
            key={q.id}
            q={q}
            data={data}
            issues={issues.filter((i) => i.questionId === q.id)}
            selected={selectedQuestionId === q.id}
            owner={owner}
            busy={busy}
            isLast={q.number === Math.max(...data.questions.map((x) => x.number))}
            onSelect={onSelect}
            run={run}
            api={api}
          />
        ))}
      </div>
    </aside>
  );
}

function QuestionCard({
  q,
  data,
  issues,
  selected,
  owner,
  busy,
  isLast,
  onSelect,
  run,
  api,
}: {
  q: ReviewQuestion;
  data: ReviewData;
  issues: QuestionIssue[];
  selected: boolean;
  owner: Owner | null;
  busy: boolean;
  isLast: boolean;
  onSelect: (o: Owner) => void;
  run: Run;
  api: Api;
}) {
  const parts = data.parts.filter((p) => p.questionId === q.id).sort((a, b) => a.sortOrder - b.sortOrder);
  const boxes = (id: string) => data.regions.filter((r) => r.ownerId === id).length;
  const partSum = parts.reduce((s, p) => s + p.marks, 0);
  const [newLabel, setNewLabel] = useState("");
  const [newMarks, setNewMarks] = useState("");

  return (
    <div
      id={`card-${q.id}`}
      className={cn(
        "rounded-lg border p-2.5 text-sm transition-colors",
        selected ? "border-blue-500 bg-blue-50/50" : issues.length ? "border-amber-300" : "border-border",
      )}
    >
      <div className="flex items-center gap-2">
        <button
          onClick={() => onSelect({ type: "question", id: q.id })}
          className={cn(
            "rounded-md px-1.5 py-0.5 font-semibold",
            owner?.id === q.id ? "bg-blue-600 text-white" : "hover:bg-muted",
          )}
          title="Select this question (then Shift+drag on the page to draw a box)"
        >
          Q{q.number}
        </button>
        <span className="text-xs text-muted-foreground">{boxes(q.id)} box{boxes(q.id) === 1 ? "" : "es"}</span>
        {q.confidence < 0.9 && (
          <span className="rounded bg-orange-100 px-1.5 text-xs text-orange-800">{Math.round(q.confidence * 100)}%</span>
        )}
        <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          Total
          <MarksInput
            label={`Q${q.number} total marks`}
            value={q.totalMarks}
            onCommit={(n) => run(() => api(`/api/admin/questions/${q.id}`, "PATCH", { totalMarks: n }))}
          />
          {q.editedByAdmin && <span title="Edited by hand">✎</span>}
        </label>
      </div>

      {q.warnings.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 text-xs text-orange-700">
          {q.warnings.map((w) => <li key={w}>• {w}</li>)}
        </ul>
      )}

      {parts.length > 0 && (
        <div className="mt-2 space-y-1">
          {parts.map((p, i) => (
            <div key={p.id} className="flex items-center gap-1.5">
              <button
                onClick={() => onSelect({ type: "part", id: p.id })}
                className={cn(
                  "min-w-12 rounded-md px-1.5 py-0.5 text-left",
                  owner?.id === p.id ? "bg-violet-600 text-white" : "bg-violet-50 text-violet-900 hover:bg-violet-100",
                )}
              >
                ({p.label})
              </button>
              <span className="text-xs text-muted-foreground">{boxes(p.id) || "no"} box{boxes(p.id) === 1 ? "" : "es"}</span>
              <div className="ml-auto flex items-center gap-1">
                {i > 0 && (
                  <button
                    disabled={busy}
                    onClick={async () =>
                      (await confirmDialog({ title: `Split Q${q.number} at part (${p.label})?`, body: "Part (" + p.label + ") and the parts after it become a new question. Later questions are renumbered.", confirmLabel: "Split" })) &&
                      run(() => api(`/api/admin/questions/${q.id}/split`, "POST", { partId: p.id }), "Question split")
                    }
                    className="rounded px-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="Split the question here"
                  >
                    split
                  </button>
                )}
                <button
                  disabled={busy}
                  onClick={async () => (await confirmDialog({ title: `Remove part (${p.label})?`, body: "Its boxes are removed too.", confirmLabel: "Remove", danger: true })) && run(() => api(`/api/admin/parts/${p.id}`, "DELETE"), "Part removed")}
                  className="rounded px-1 text-xs text-muted-foreground hover:bg-red-50 hover:text-red-700"
                  title="Remove part"
                >
                  ✕
                </button>
                <MarksInput
                  label={`Part ${p.label} marks`}
                  value={p.marks}
                  onCommit={(n) => run(() => api(`/api/admin/parts/${p.id}`, "PATCH", { marks: n }))}
                />
              </div>
            </div>
          ))}
          <div className={cn("text-right text-xs", partSum === q.totalMarks ? "text-muted-foreground" : "font-medium text-red-600")}>
            parts total {partSum} / {q.totalMarks}
          </div>
        </div>
      )}

      {issues.length > 0 && (
        <ul className="mt-2 space-y-0.5 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
          {issues.map((i) => <li key={i.message}>{i.message}</li>)}
        </ul>
      )}

      {selected && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t pt-2">
          <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              const marks = Number(newMarks);
              if (!newLabel.trim() || !Number.isInteger(marks)) return;
              run(() => api(`/api/admin/questions/${q.id}/parts`, "POST", { label: newLabel.trim(), marks }), "Part added — select it and Shift+drag to draw its box").then(() => {
                setNewLabel("");
                setNewMarks("");
              });
            }}
          >
            <input placeholder="label" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} className="h-7 w-14 rounded-md border px-1.5 text-xs" />
            <input placeholder="marks" value={newMarks} onChange={(e) => setNewMarks(e.target.value.replace(/\D/g, ""))} className="h-7 w-14 rounded-md border px-1.5 text-xs" />
            <button disabled={busy} className="h-7 rounded-md border px-2 text-xs hover:bg-muted">Add part</button>
          </form>
          {!isLast && (
            <button
              disabled={busy}
              onClick={async () =>
                (await confirmDialog({ title: `Merge Q${q.number + 1} into Q${q.number}?`, body: "Their parts and boxes are combined. Later questions are renumbered.", confirmLabel: "Merge" })) &&
                run(() => api(`/api/admin/questions/${q.id}/merge-next`, "POST"), "Questions merged")
              }
              className="ml-auto h-7 rounded-md border px-2 text-xs hover:bg-muted"
            >
              Merge with Q{q.number + 1}
            </button>
          )}
          <button
            disabled={busy}
            onClick={async () =>
              (await confirmDialog({ title: `Delete Q${q.number}?`, body: "Its parts and boxes are deleted too.", confirmLabel: "Delete", danger: true })) && run(() => api(`/api/admin/questions/${q.id}`, "DELETE"), `Q${q.number} deleted`)
            }
            className={cn("h-7 rounded-md border px-2 text-xs text-red-700 hover:bg-red-50", isLast && "ml-auto")}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

/** Add a question by hand; then select it and Shift+drag on the page to draw its box. */
function AddQuestion({ data, busy, run, api }: { data: ReviewData; busy: boolean; run: Run; api: Api }) {
  const next = Math.max(0, ...data.questions.map((q) => q.number)) + 1;
  const [number, setNumber] = useState("");
  const [marks, setMarks] = useState("");
  return (
    <form
      className="flex items-center gap-1.5 border-b px-3 py-2 text-xs"
      onSubmit={(e) => {
        e.preventDefault();
        if (!marks) return;
        void run(
          () => api(`/api/admin/papers/${data.paper.id}/questions`, "POST", { number: Number(number || next), totalMarks: Number(marks) }),
          `Q${number || next} added — select it and Shift+drag on the page to draw its box`,
        ).then(() => {
          setNumber("");
          setMarks("");
        });
      }}
    >
      <span className="font-medium">Add question</span>
      <input aria-label="Question number" placeholder={`Q${next}`} value={number} onChange={(e) => setNumber(e.target.value.replace(/\D/g, ""))} className="h-7 w-14 rounded-md border px-1.5" />
      <input aria-label="Total marks" placeholder="marks" value={marks} onChange={(e) => setMarks(e.target.value.replace(/\D/g, ""))} className="h-7 w-14 rounded-md border px-1.5" />
      <button disabled={busy || !marks} className="ml-auto h-7 rounded-md bg-primary px-2 text-primary-foreground disabled:opacity-50">Add</button>
    </form>
  );
}

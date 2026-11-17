"use client";

import { useState } from "react";
import type { QuestionIssue } from "@/lib/review/checks";
import type { ReviewData, ReviewQuestion, ReviewTopic } from "@/lib/review/types";
import { cn } from "@/lib/utils";
import type { Owner } from "./box-overlay";

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
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {shown.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">Nothing to fix. 🎉</p>}
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
                    onClick={() =>
                      confirm(`Start a new question at part (${p.label})? Later questions are renumbered.`) &&
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
                  onClick={() => confirm(`Remove part (${p.label}) and its boxes?`) && run(() => api(`/api/admin/parts/${p.id}`, "DELETE"), "Part removed")}
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

      <TopicPicker
        topics={data.topics}
        value={q.topicIds}
        onChange={(ids) => run(() => api(`/api/admin/questions/${q.id}`, "PATCH", { topicIds: ids }))}
      />

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
              onClick={() =>
                confirm(`Merge Q${q.number + 1} into Q${q.number}? Later questions are renumbered.`) &&
                run(() => api(`/api/admin/questions/${q.id}/merge-next`, "POST"), "Questions merged")
              }
              className="ml-auto h-7 rounded-md border px-2 text-xs hover:bg-muted"
            >
              Merge with Q{q.number + 1}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function TopicPicker({ topics, value, onChange }: { topics: ReviewTopic[]; value: string[]; onChange: (ids: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const byId = new Map(topics.map((t) => [t.id, t]));
  const roots = topics.filter((t) => !t.parentId);
  const childrenOf = (id: string) => topics.filter((t) => t.parentId === id);
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-1">
        {value.map((id) => (
          <span key={id} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-900">
            {byId.get(id)?.code} {byId.get(id)?.name}
            <button onClick={() => toggle(id)} className="text-emerald-700 hover:text-red-600" aria-label="Remove topic">×</button>
          </span>
        ))}
        <button onClick={() => setOpen((o) => !o)} className="rounded-full border border-dashed px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground">
          {open ? "Done" : value.length ? "+ topic" : "+ add topic"}
        </button>
      </div>
      {open && (
        <div className="mt-1.5 max-h-56 overflow-y-auto rounded-md border p-1.5 text-xs">
          {roots.map((r) => {
            const kids = childrenOf(r.id);
            return (
              <div key={r.id} className="mb-1">
                <label className="flex items-center gap-1.5 font-medium">
                  <input type="checkbox" checked={value.includes(r.id)} onChange={() => toggle(r.id)} />
                  {r.code} {r.name}
                </label>
                {kids.map((k) => (
                  <label key={k.id} className="ml-5 flex items-center gap-1.5">
                    <input type="checkbox" checked={value.includes(k.id)} onChange={() => toggle(k.id)} />
                    {k.code} {k.name}
                  </label>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

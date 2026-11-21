"use client";

import { Spinner } from "@/components/ui/spinner";
import { useEffect, useMemo, useState } from "react";
import { CropCanvas } from "@/components/pdf/crop-canvas";
import type { SearchHit } from "@/lib/builder/search";
import { useBuilder } from "@/lib/builder/store";
import { pickPart, pickQuestion, unpickPart, unpickQuestion } from "@/lib/builder/actions";
import { cn } from "@/lib/utils";
import { searchWords, splitMatches } from "@/lib/builder/highlight";
import { SERIES } from "@/lib/paper-filename";
import { Select } from "@/components/ui/select";
import type { SourcePaper } from "./browse-pane";

const field = "h-9 rounded-md border border-input bg-background px-2 text-base sm:text-sm pointer-coarse:h-10";
const PAGE = 20;

type Filters = {
  q: string;
  paperNo: string;
  yearFrom: string;
  yearTo: string;
  series: string;
  minMarks: string;
  maxMarks: string;
  sort: "paper" | "marks" | "popular";
};
const EMPTY: Filters = { q: "", paperNo: "", yearFrom: "", yearTo: "", series: "", minMarks: "", maxMarks: "", sort: "paper" };

/** Find questions across all published papers of a subject (topics are postponed). */
export function SearchPane({ subjectId, paperNo: fixedPaperNo, sources }: { subjectId: string; paperNo?: number; sources: SourcePaper[] }) {
  // When the subject menu already chose a paper (e.g. Maths B Paper 2), search only that paper.
  const start: Filters = { ...EMPTY, paperNo: fixedPaperNo ? String(fixedPaperNo) : "" };
  const [filters, setFilters] = useState<Filters>(start);
  const [debounced, setDebounced] = useState(filters);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState(480);
  // Paper numbers in this subject (Paper 1, Paper 2 …); each includes its regional R version.
  const paperNos = useMemo(
    () =>
      [...new Set(sources.filter((s) => s.subjectId === subjectId).map((s) => Number(s.paperCode.match(/\/0*(\d+)/)?.[1])).filter((n) => n > 0))].sort(
        (a, b) => a - b,
      ),
    [sources, subjectId],
  );
  const years = useMemo(
    () => [...new Set(sources.filter((s) => s.subjectId === subjectId).map((s) => s.year))].sort(),
    [sources, subjectId],
  );

  useEffect(() => {
    const t = setTimeout(() => setDebounced(filters), 300);
    return () => clearTimeout(t);
  }, [filters]);

  const query = useMemo(() => {
    const p = new URLSearchParams({ subjectId, sort: debounced.sort, limit: String(PAGE) });
    for (const k of ["q", "paperNo", "yearFrom", "yearTo", "series", "minMarks", "maxMarks"] as const) if (debounced[k]) p.set(k, debounced[k]);
    return p;
  }, [debounced, subjectId]);

  async function load(offset: number) {
    setLoading(true);
    setError(null);
    try {
      const p = new URLSearchParams(query);
      p.set("offset", String(offset));
      const res = await fetch(`/api/builder/search?${p}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Search failed");
      useBuilder.getState().addToBank(body.hits);
      setHits((h) => (offset ? [...h, ...body.hits] : body.hits));
      setTotal(body.total);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // "any" stands for no filter (a dropdown needs a value for every row).
  const pick = (k: keyof Filters) => (v: string) => setFilters((f) => ({ ...f, [k]: v === "any" ? "" : v }));
  const words = useMemo(() => searchWords(debounced.q), [debounced.q]);
  const set = (k: keyof Filters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setFilters((f) => ({ ...f, [k]: k.endsWith("Marks") ? e.target.value.replace(/\D/g, "") : e.target.value }));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 border-b bg-background px-4 py-2.5">
        <input className={cn(field, "w-full")} placeholder="Search question text, e.g. probability, sequence, cone…" value={filters.q} onChange={set("q")} aria-label="Search text" />
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Select
            aria-label="From year"
            value={filters.yearFrom || "any"}
            onValueChange={pick("yearFrom")}
            options={[{ value: "any", label: "Any year" }, ...years.map((y) => ({ value: String(y), label: `from ${y}` }))]}
          />
          <Select
            aria-label="To year"
            value={filters.yearTo || "any"}
            onValueChange={pick("yearTo")}
            options={[{ value: "any", label: "to any" }, ...years.map((y) => ({ value: String(y), label: `to ${y}` }))]}
          />
          <Select
            aria-label="Series"
            value={filters.series || "any"}
            onValueChange={pick("series")}
            options={[{ value: "any", label: "Any series" }, ...SERIES.map((s) => ({ value: s, label: s }))]}
          />
          {paperNos.length > 1 && !fixedPaperNo && (
            <Select
              aria-label="Paper"
              value={filters.paperNo || "any"}
              onValueChange={pick("paperNo")}
              options={[
                { value: "any", label: "All papers" },
                ...paperNos.map((n) => ({ value: String(n), label: `Paper ${n}`, hint: `incl. ${n}R` })),
              ]}
            />
          )}
          <span className="flex items-center gap-1 text-muted-foreground">
            Marks
            <input className={cn(field, "w-12")} placeholder="min" value={filters.minMarks} onChange={set("minMarks")} aria-label="Minimum marks" />–
            <input className={cn(field, "w-12")} placeholder="max" value={filters.maxMarks} onChange={set("maxMarks")} aria-label="Maximum marks" />
          </span>
          <Select
            aria-label="Sort"
            value={filters.sort}
            onValueChange={pick("sort")}
            options={[
              { value: "paper", label: "Newest papers first" },
              { value: "marks", label: "Most marks first" },
              { value: "popular", label: "Most used first" },
            ]}
          />
          {JSON.stringify(filters) !== JSON.stringify(start) && (
            <button className="text-xs text-muted-foreground underline" onClick={() => setFilters(start)}>Clear</button>
          )}
        </div>
      </div>
      <div
        className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-zinc-100 p-4"
        ref={(el) => {
          if (el && Math.abs(el.clientWidth - 32 - width) > 4) setWidth(el.clientWidth - 32);
        }}
      >
        <div className="text-xs text-muted-foreground">
          {loading && !hits.length ? (
            <span className="inline-flex items-center gap-1.5">
              <Spinner /> Searching…
            </span>
          ) : (
            `${total} question${total === 1 ? "" : "s"} found`
          )}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!loading && !error && total === 0 && (
          <div className="rounded-lg border border-dashed bg-background p-8 text-center text-sm text-muted-foreground">
            No questions match. Try fewer words or a wider marks range.
          </div>
        )}
        {hits.map((h) => <HitCard key={h.id} hit={h} width={width} words={words} />)}
        {hits.length < total && (
          <button disabled={loading} onClick={() => load(hits.length)} className="w-full rounded-md border bg-background py-2 text-sm hover:bg-muted">
            {loading ? (
              <span className="inline-flex items-center gap-1.5">
                <Spinner /> Loading more…
              </span>
            ) : (
              `Show more (${total - hits.length} left)`
            )}
          </button>
        )}
      </div>
    </div>
  );
}

function HitCard({ hit, width, words }: { hit: SearchHit; width: number; words: string[] }) {
  const item = useBuilder((s) => s.items.find((i) => i.questionId === hit.id));
  const serial = useBuilder((s) => s.items.findIndex((i) => i.questionId === hit.id) + 1);
  const [expanded, setExpanded] = useState(false);
  const whole = item && item.partIds.length === 0;
  const scale = Math.min(0.75, (width - 24) / 500);
  const regions = expanded ? hit.regions : hit.regions.slice(0, 1);

  return (
    <div className={cn("overflow-hidden rounded-lg border bg-background", item && "border-emerald-500 ring-1 ring-emerald-500")}>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
        <span className="font-semibold">Q{hit.number}</span>
        <span className="text-muted-foreground">{hit.paperLabel}</span>
        <span className="rounded bg-zinc-100 px-1.5 text-xs font-medium">{hit.totalMarks} mark{hit.totalMarks === 1 ? "" : "s"}</span>
        {hit.uses > 0 && <span className="text-xs text-muted-foreground">used {hit.uses}×</span>}
        <div className="ml-auto flex items-center gap-1">
          {hit.parts.map((p) => {
            const picked = Boolean(whole || item?.partIds.includes(p.id));
            return (
              <button
                key={p.id}
                onClick={() => (picked ? unpickPart(hit, p.id) : pickPart(hit, p.id))}
                title={picked ? `Remove part (${p.label})` : `Add only part (${p.label}), ${p.marks} mark${p.marks === 1 ? "" : "s"}`}
                className={cn("rounded px-1.5 py-0.5 text-xs", picked ? "bg-emerald-600 text-white" : "bg-violet-50 text-violet-900 hover:bg-violet-100")}
              >
                ({p.label}) {p.marks}
              </button>
            );
          })}
          <button
            onClick={() => (whole ? unpickQuestion(hit) : pickQuestion(hit))}
            className={cn(
              "rounded-md px-2 py-1 text-xs font-medium",
              whole ? "bg-emerald-600 text-white hover:bg-red-600" : "bg-primary text-primary-foreground hover:bg-primary/80",
            )}
            title={whole ? "Remove from your paper" : "Add the whole question"}
          >
            {whole ? `✓ Q${serial} in paper` : item ? "Add whole" : "+ Add"}
          </button>
        </div>
      </div>
      {words.length > 0 && hit.snippet && (
        <p className="border-t bg-zinc-50 px-3 py-1.5 text-xs leading-relaxed text-muted-foreground">
          {splitMatches(hit.snippet, words).map((p, i) =>
            p.match ? (
              <mark key={i} className="rounded-sm bg-yellow-200 px-0.5 text-foreground">
                {p.text}
              </mark>
            ) : (
              <span key={i}>{p.text}</span>
            ),
          )}
        </p>
      )}
      <div className={cn("relative border-t bg-white px-3 py-2", !expanded && "max-h-56 overflow-hidden")}>
        {regions.map((r, i) => (
          <CropCanvas key={i} paperId={hit.paperId} page={r.page} rect={r} scale={scale} highlight={words} />
        ))}
        {!expanded && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-white" />}
      </div>
      <button onClick={() => setExpanded((e) => !e)} className="w-full border-t py-1 text-xs text-muted-foreground hover:bg-muted">
        {expanded ? "Show less" : "Show whole question"}
      </button>
    </div>
  );
}

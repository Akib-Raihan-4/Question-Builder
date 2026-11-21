"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { PdfPageCanvas } from "@/components/pdf/pdf-page-canvas";
import { getPdfDoc, onPdfProgress } from "@/components/pdf/pdf-cache";
import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/select";
import { HScroll } from "@/components/h-scroll";
import { isRegional, paperNo } from "@/lib/paper-filename";
import type { BankQuestion } from "@/lib/builder/model";
import { useBuilder } from "@/lib/builder/store";
import { PickOverlay } from "./pick-overlay";
import { LoadingCard } from "@/components/loading-card";
import { SearchPane } from "./search-pane";

export type SourcePaper = {
  id: string;
  subjectId: string;
  subject: string;
  specCode: string;
  paperCode: string;
  series: string;
  year: number;
  tier: string | null;
  pageCount: number | null;
};


export function BrowsePane({ sources }: { sources: SourcePaper[] }) {
  // What to pick from: a subject, or — when it has several papers (Maths B Paper 1 and Paper 2) —
  // each paper of it separately. Regional versions (2R) go with their paper.
  const subjects = useMemo(() => {
    const bySubject = new Map<string, { name: string; nos: Set<number> }>();
    for (const s of sources) {
      const e = bySubject.get(s.subjectId) ?? { name: `${s.specCode} ${s.subject}`, nos: new Set<number>() };
      const n = paperNo(s.paperCode);
      if (n) e.nos.add(n);
      bySubject.set(s.subjectId, e);
    }
    return [...bySubject].flatMap(([id, e]): [string, string][] =>
      e.nos.size > 1 ? [...e.nos].sort((a, b) => a - b).map((n): [string, string] => [`${id}|${n}`, `${e.name} · Paper ${n}`]) : [[`${id}|`, e.name]],
    );
  }, [sources]);
  const [mode, setMode] = useState<"browse" | "search">("browse");
  const [collection, setCollection] = useState<string>(subjects[0]?.[0] ?? "");
  const [subjectId, collectionNo] = collection.split("|");
  const inCollection = (s: SourcePaper) => s.subjectId === subjectId && (!collectionNo || paperNo(s.paperCode) === Number(collectionNo));
  const papers = sources.filter(inCollection);
  const [paperId, setPaperId] = useState(papers[0]?.id ?? "");
  const [questions, setQuestions] = useState<BankQuestion[] | null>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [sizes, setSizes] = useState<{ w: number; h: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<{ fraction: number | null; drawing?: boolean } | null>(null);
  const [width, setWidth] = useState(600);
  const items = useBuilder((s) => s.items);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth - 40));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!paperId) return;
    let cancelled = false;
    setQuestions(null);
    setDoc(null);
    setSizes([]);
    setError(null);
    setLoading({ fraction: null });
    const stop = onPdfProgress(paperId, (fraction) => !cancelled && setLoading({ fraction, drawing: fraction === 1 }));
    (async () => {
      try {
        // The questions and the PDF download at the same time; one bar shows the PDF (the big one).
        const pdf = getPdfDoc(paperId);
        pdf.catch(() => {}); // reported below
        const res = await fetch(`/api/builder/sources/${paperId}`);
        if (!res.ok) throw new Error("Couldn't open this paper. Check your connection and pick it again.");
        const data: { questions: BankQuestion[] } = await res.json();
        if (cancelled) return;
        setQuestions(data.questions);
        useBuilder.getState().addToBank(data.questions);
        const d = await pdf;
        const s = [];
        for (let i = 1; i <= d.numPages; i++) {
          const v = (await d.getPage(i)).getViewport({ scale: 1 });
          s.push({ w: v.width, h: v.height });
        }
        if (cancelled) return;
        setDoc(d);
        setSizes(s);
        setLoading(null);
        ref.current?.scrollTo({ top: 0 });
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message);
          setLoading(null);
        }
      }
    })();
    return () => {
      cancelled = true;
      stop();
    };
  }, [paperId]);

  // Skip the cover and pages without questions.
  const pagesWithQuestions = useMemo(() => {
    const set = new Set<number>();
    for (const q of questions ?? []) for (const r of q.regions) set.add(r.page);
    return [...set].sort((a, b) => a - b);
  }, [questions]);

  const scaleFor = (page: number) => Math.min(1.5, width / (sizes[page]?.w ?? 595));
  function jumpTo(q: BankQuestion) {
    const r = q.regions[0];
    const pageEl = r && document.getElementById(`src-page-${r.page}`);
    const box = ref.current;
    if (!pageEl || !box) return;
    // Position inside the scrolling pane (offsetTop would be relative to some other ancestor).
    const pageTop = pageEl.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
    box.scrollTo({ top: pageTop + r.y0 * scaleFor(r.page) - 12, behavior: "smooth" });
  }

  if (!sources.length) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
        No past papers have been published yet. An admin publishes them from Past papers → Review.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b bg-background px-4 py-2">
        <div className="inline-flex rounded-lg bg-muted p-0.5 text-sm">
          {(["browse", "search"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={mode === m ? "rounded-md bg-background px-2.5 py-1 font-medium shadow-sm" : "px-2.5 py-1 text-muted-foreground hover:text-foreground"}
            >
              {m === "browse" ? "Browse a paper" : "Search questions"}
            </button>
          ))}
        </div>
        <Select
          aria-label="Subject"
          value={collection}
          onValueChange={(v) => {
            setCollection(v);
            const [sid, no] = v.split("|");
            setPaperId(sources.find((s) => s.subjectId === sid && (!no || paperNo(s.paperCode) === Number(no)))?.id ?? "");
          }}
          options={subjects.map(([id, name]) => ({ value: id, label: name }))}
          className="max-w-[16rem]"
        />
        {mode === "browse" && (
          <Select
            aria-label="Past paper"
            value={paperId}
            onValueChange={setPaperId}
            className="flex-1 sm:max-w-xs"
            options={papers.map((p) => ({
              value: p.id,
              label: `${p.series} ${p.year} · ${p.paperCode}`,
              hint: [p.tier && (p.tier === "H" ? "Higher" : "Foundation"), isRegional(p.paperCode) && "Regional"].filter(Boolean).join(", ") || undefined,
              group: String(p.year),
            }))}
          />
        )}
      </div>
      {mode === "browse" && questions && questions.length > 0 && (
        <div className="flex items-center gap-2 border-b bg-background px-3 pt-1.5" role="navigation" aria-label="Jump to a question">
          <span className="shrink-0 pb-1.5 text-xs text-muted-foreground">Jump to</span>
          <HScroll label="questions" className="flex-1">
          {questions.map((q) => {
            const inPaper = items.some((i) => i.questionId === q.id);
            return (
              <button
                key={q.id}
                onClick={() => jumpTo(q)}
                title={`Q${q.number} · ${q.totalMarks} marks${inPaper ? " · in your paper" : ""}`}
                className={cn(
                  "shrink-0 rounded-md border px-2 py-1 text-xs tabular-nums pointer-coarse:py-1.5",
                  inPaper ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "hover:bg-muted",
                )}
              >
                Q{q.number}
                <span className="ml-1 text-muted-foreground">{q.totalMarks}</span>
              </button>
            );
          })}
          </HScroll>
        </div>
      )}
      {mode === "search" && <SearchPane key={collection} subjectId={subjectId} paperNo={collectionNo ? Number(collectionNo) : undefined} sources={sources} />}
      <div ref={ref} hidden={mode === "search"} className="min-h-0 flex-1 overflow-y-auto bg-zinc-200/70 px-5 py-4">
        <p className="mx-auto mb-3 max-w-2xl rounded-lg bg-background/80 px-3 py-2 text-xs text-muted-foreground">
          Click a part to add it, or the <span className="rounded bg-blue-600 px-1 font-bold text-white">+</span> tab to add the whole
          question. Click again to remove. Questions are numbered in the order you pick them.
        </p>
        {error && (
          <div role="alert" className="mx-auto flex max-w-2xl items-center gap-3 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-800">
            <span className="flex-1">{error}</span>
            <button
              type="button"
              className="rounded-md border border-red-300 px-2 py-1 text-xs hover:bg-red-100"
              onClick={() => {
                const id = paperId;
                setPaperId("");
                requestAnimationFrame(() => setPaperId(id));
              }}
            >
              Try again
            </button>
          </div>
        )}
        {!error && loading && (
          <div className="mx-auto max-w-2xl space-y-4" aria-busy="true">
            <LoadingCard
              label={`Opening ${(() => {
                const p = sources.find((x) => x.id === paperId);
                return p ? `${p.paperCode} ${p.series} ${p.year}` : "the paper";
              })()}…`}
              fraction={loading.drawing ? null : loading.fraction}
              detail={loading.drawing ? "Preparing the pages…" : loading.fraction == null ? "Getting the questions and the PDF" : undefined}
            />
            {[0, 1].map((i) => (
              <div key={i} className="aspect-[210/297] w-full animate-pulse rounded bg-white/70 shadow-sm ring-1 ring-black/5" />
            ))}
          </div>
        )}
        {doc && questions &&
          pagesWithQuestions.map((i) => {
            const size = sizes[i];
            if (!size) return null;
            const scale = Math.min(1.5, width / size.w);
            const w = size.w * scale;
            const h = size.h * scale;
            return (
              <div key={`${paperId}-${i}`} id={`src-page-${i}`} className="mx-auto mb-4" style={{ width: w }}>
                <div className="relative shadow-sm ring-1 ring-black/5" style={{ width: w, height: h }}>
                  <PdfPageCanvas doc={doc} pageIndex={i} scale={scale} width={w} height={h} />
                  <PickOverlay page={i} scale={scale} questions={questions} />
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}

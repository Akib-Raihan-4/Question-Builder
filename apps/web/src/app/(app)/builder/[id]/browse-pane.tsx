"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { PdfPageCanvas } from "@/components/pdf/pdf-page-canvas";
import { getPdfDoc } from "@/components/pdf/pdf-cache";
import type { BankQuestion } from "@/lib/builder/model";
import { useBuilder } from "@/lib/builder/store";
import { PickOverlay } from "./pick-overlay";

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

const selectCls = "h-8 rounded-md border border-input bg-background px-2 text-sm";

export function BrowsePane({ sources }: { sources: SourcePaper[] }) {
  const subjects = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sources) m.set(s.subjectId, `${s.specCode} ${s.subject}`);
    return [...m];
  }, [sources]);
  const [subjectId, setSubjectId] = useState(subjects[0]?.[0] ?? "");
  const papers = sources.filter((s) => s.subjectId === subjectId);
  const [paperId, setPaperId] = useState(papers[0]?.id ?? "");
  const [questions, setQuestions] = useState<BankQuestion[] | null>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [sizes, setSizes] = useState<{ w: number; h: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState(600);
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
    (async () => {
      try {
        const res = await fetch(`/api/builder/sources/${paperId}`);
        if (!res.ok) throw new Error("Could not load this paper");
        const data: { questions: BankQuestion[] } = await res.json();
        if (cancelled) return;
        setQuestions(data.questions);
        useBuilder.getState().addToBank(data.questions);
        const d = await getPdfDoc(paperId);
        const s = [];
        for (let i = 1; i <= d.numPages; i++) {
          const v = (await d.getPage(i)).getViewport({ scale: 1 });
          s.push({ w: v.width, h: v.height });
        }
        if (cancelled) return;
        setDoc(d);
        setSizes(s);
        ref.current?.scrollTo({ top: 0 });
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [paperId]);

  // Skip the cover and pages without questions.
  const pagesWithQuestions = useMemo(() => {
    const set = new Set<number>();
    for (const q of questions ?? []) for (const r of q.regions) set.add(r.page);
    return [...set].sort((a, b) => a - b);
  }, [questions]);

  if (!sources.length) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
        No past papers have been published yet. An admin publishes them from Past papers → Review.
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b bg-background px-4 py-2">
        <select
          className={selectCls}
          value={subjectId}
          onChange={(e) => {
            setSubjectId(e.target.value);
            setPaperId(sources.find((s) => s.subjectId === e.target.value)?.id ?? "");
          }}
          aria-label="Subject"
        >
          {subjects.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select className={`${selectCls} min-w-0 flex-1`} value={paperId} onChange={(e) => setPaperId(e.target.value)} aria-label="Past paper">
          {papers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.year} {p.series} · {p.paperCode}{p.tier ? ` (${p.tier === "H" ? "Higher" : "Foundation"})` : ""}
            </option>
          ))}
        </select>
      </div>
      <div ref={ref} className="min-h-0 flex-1 overflow-y-auto bg-zinc-200/70 px-5 py-4">
        <p className="mx-auto mb-3 max-w-2xl rounded-lg bg-background/80 px-3 py-2 text-xs text-muted-foreground">
          Click a part to add it, or the <span className="rounded bg-blue-600 px-1 font-bold text-white">+</span> tab to add the whole
          question. Click again to remove. Questions are numbered in the order you pick them.
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!error && (!doc || !questions) && <p className="text-sm text-muted-foreground">Loading paper…</p>}
        {doc && questions &&
          pagesWithQuestions.map((i) => {
            const size = sizes[i];
            if (!size) return null;
            const scale = Math.min(1.5, width / size.w);
            const w = size.w * scale;
            const h = size.h * scale;
            return (
              <div key={`${paperId}-${i}`} className="mx-auto mb-4" style={{ width: w }}>
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

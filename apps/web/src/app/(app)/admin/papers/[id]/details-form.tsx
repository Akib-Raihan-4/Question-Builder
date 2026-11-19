"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { isRegional, SERIES, withRegional } from "@/lib/paper-filename";
import type { ReviewData } from "@/lib/review/types";

const cls = "h-8 rounded-md border border-input bg-background px-2 text-base sm:text-sm pointer-coarse:h-10";

/** Fix a paper's subject, code, series, year, tier and how its questions are found. */
export function DetailsForm({ data, onSave, onCancel }: { data: ReviewData; onSave: (body: unknown) => Promise<void>; onCancel: () => void }) {
  const p = data.paper;
  const [subjectId, setSubjectId] = useState(p.subjectId);
  const [paperCode, setPaperCode] = useState(p.paperCode);
  const [series, setSeries] = useState(p.series);
  const [year, setYear] = useState(String(p.year));
  const [tier, setTier] = useState(p.tier ?? "");
  const [parserKey, setParserKey] = useState(p.parserKey === "manual" ? "manual" : "edexcel");
  return (
    <form
      className="flex flex-wrap items-end gap-2 border-b bg-muted/40 px-4 py-2.5 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        void onSave({ subjectId, paperCode, series, year: Number(year), tier: tier || null, parserKey });
      }}
    >
      <label className="flex flex-col gap-0.5 text-xs text-muted-foreground">Subject
        <select className={cls} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
          {data.subjects.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-0.5 text-xs text-muted-foreground">Paper code
        <input className={`${cls} w-28`} value={paperCode} onChange={(e) => setPaperCode(e.target.value.toUpperCase())} />
      </label>
      <label className="flex flex-col gap-0.5 text-xs text-muted-foreground">Version
        <select
          className={cls}
          value={isRegional(paperCode) ? "R" : ""}
          onChange={(e) => setPaperCode(withRegional(paperCode, e.target.value === "R"))}
          disabled={!/\/\d{1,2}[FH]?R?$/.test(paperCode)}
        >
          <option value="">Standard</option>
          <option value="R">Regional (R)</option>
        </select>
      </label>
      <label className="flex flex-col gap-0.5 text-xs text-muted-foreground">Series
        <select className={cls} value={series} onChange={(e) => setSeries(e.target.value)}>
          {SERIES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-0.5 text-xs text-muted-foreground">Year
        <input className={`${cls} w-20`} inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, ""))} />
      </label>
      <label className="flex flex-col gap-0.5 text-xs text-muted-foreground">Tier
        <select className={cls} value={tier} onChange={(e) => setTier(e.target.value)}>
          <option value="">No tier</option>
          <option value="F">Foundation</option>
          <option value="H">Higher</option>
        </select>
      </label>
      <label className="flex flex-col gap-0.5 text-xs text-muted-foreground">Questions found
        <select className={cls} value={parserKey} onChange={(e) => setParserKey(e.target.value)}>
          <option value="edexcel">Automatically (Edexcel layout)</option>
          <option value="manual">By hand</option>
        </select>
      </label>
      <Button size="sm" type="submit">Save details</Button>
      <Button size="sm" type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
    </form>
  );
}

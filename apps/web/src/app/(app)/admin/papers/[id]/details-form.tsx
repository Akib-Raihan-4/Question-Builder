"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
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
  const [regional, setRegional] = useState(isRegional(p.paperCode));
  return (
    <form
      className="flex flex-wrap items-end gap-2 border-b bg-muted/40 px-4 py-2.5 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        void onSave({ subjectId, paperCode: withRegional(paperCode, regional), series, year: Number(year), tier: tier || null, parserKey });
      }}
    >
      <Field label="Subject">
        <Select aria-label="Subject" className="h-8 max-w-[16rem]" value={subjectId} onValueChange={setSubjectId} options={data.subjects.map((s) => ({ value: s.id, label: s.label }))} />
      </Field>
      <Field label="Paper code">
        <input
          aria-label="Paper code"
          className={`${cls} w-28`}
          value={paperCode}
          onChange={(e) => {
            const v = e.target.value.toUpperCase();
            setPaperCode(v);
            if (isRegional(v)) setRegional(true);
          }}
        />
      </Field>
      <Field label="Version">
        <Select
          aria-label="Version"
          className="h-8"
          value={regional ? "R" : "S"}
          onValueChange={(v) => {
            setRegional(v === "R");
            setPaperCode(withRegional(paperCode, v === "R"));
          }}
          options={[
            { value: "S", label: "Standard" },
            { value: "R", label: "Regional (R)" },
          ]}
        />
      </Field>
      <Field label="Series">
        <Select aria-label="Series" className="h-8" value={series} onValueChange={setSeries} options={SERIES.map((x) => ({ value: x, label: x }))} />
      </Field>
      <Field label="Year">
        <input aria-label="Year" className={`${cls} w-20`} inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, ""))} />
      </Field>
      <Field label="Tier">
        <Select
          aria-label="Tier"
          className="h-8"
          value={tier || "none"}
          onValueChange={(v) => setTier(v === "none" ? "" : v)}
          options={[
            { value: "none", label: "No tier" },
            { value: "F", label: "Foundation" },
            { value: "H", label: "Higher" },
          ]}
        />
      </Field>
      <Field label="Questions found">
        <Select
          aria-label="Questions found"
          className="h-8"
          value={parserKey}
          onValueChange={setParserKey}
          options={[
            { value: "edexcel", label: "Automatically (Edexcel layout)" },
            { value: "manual", label: "By hand" },
          ]}
        />
      </Field>
      <Button size="sm" type="submit">Save details</Button>
      <Button size="sm" type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
      <span>{label}</span>
      {children}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parsePaperFilename, SERIES } from "@/lib/paper-filename";
import { cn } from "@/lib/utils";

export type Subject = { id: string; name: string; specCode: string; qualification: string };
type BulkRow = { file: string; ok: boolean; message: string };

const selectCls =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export const subjectLabel = (s: Subject) => `${s.name} · ${s.qualification} (${s.specCode})`;

function AutoDetect({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" className="mt-0.5" checked={value} onChange={(e) => onChange(e.target.checked)} />
      <span>
        Find questions automatically
        <span className="block text-xs text-muted-foreground">
          Works for Edexcel layouts. Untick for other papers or scans — you&apos;ll draw the question boxes yourself in Review.
        </span>
      </span>
    </label>
  );
}

export function UploadPanel({ subjects, defaultSubjectId }: { subjects: Subject[]; defaultSubjectId?: string }) {
  const [mode, setMode] = useState<"single" | "zip">("single");
  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload</CardTitle>
        <CardDescription>
          {mode === "zip"
            ? "A ZIP of question papers. Details come from file names (4MA1_1H_2020_06_qp.pdf, WPH13_01_que_20240123.pdf …) or, failing that, from each paper's cover page."
            : "One question paper PDF. Choosing a file reads the paper code, series and year from its cover page — check them before uploading."}
        </CardDescription>
        <div className="mt-2 inline-flex w-fit rounded-lg bg-muted p-1 text-sm">
          {(["single", "zip"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn("rounded-md px-3 py-1", mode === m ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              {m === "zip" ? "ZIP (bulk)" : "Single PDF"}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {mode === "zip" ? <ZipUpload /> : <SingleUpload subjects={subjects} defaultSubjectId={defaultSubjectId} />}
      </CardContent>
    </Card>
  );
}

function SingleUpload({ subjects, defaultSubjectId }: { subjects: Subject[]; defaultSubjectId?: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [subjectId, setSubjectId] = useState(defaultSubjectId ?? subjects[0]?.id ?? "");
  const [paperCode, setPaperCode] = useState("");
  const [series, setSeries] = useState<string>("June");
  const [year, setYear] = useState(String(new Date().getFullYear() - 1));
  const [tier, setTier] = useState("");
  const [autoDetect, setAutoDetect] = useState(true);
  const [reading, setReading] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (defaultSubjectId) setSubjectId(defaultSubjectId);
  }, [defaultSubjectId]);

  async function onFile(file: File | undefined) {
    setNote(null);
    if (!file) return;
    const meta = parsePaperFilename(file.name);
    if (meta) {
      const s = subjects.find((x) => x.specCode === meta.specCode);
      if (s) setSubjectId(s.id);
      setPaperCode(meta.paperCode);
      setSeries(meta.series);
      setYear(String(meta.year));
      setTier(meta.tier ?? "");
    }
    // The cover page is the better source (works for any file name).
    setReading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/papers/inspect", { method: "POST", body: fd });
      const body = await res.json();
      const c = body.cover;
      if (c) {
        if (c.paper_code) setPaperCode(c.paper_code);
        if (c.series) setSeries(c.series);
        if (c.year) setYear(String(c.year));
        if (c.tier) setTier(c.tier);
        if (body.subjectId) setSubjectId(body.subjectId);
        const found = [c.paper_code, c.series && c.year && `${c.series} ${c.year}`, c.qualification, c.title].filter(Boolean);
        setNote(
          found.length
            ? `From the cover: ${found.join(" · ")}${!body.subjectId && c.paper_code ? ` — no subject matches ${c.paper_code}; add it with “+ Add subject”.` : ""}`
            : "Couldn't read details from the cover; please fill them in.",
        );
      }
    } catch {
      /* the form still works by hand */
    } finally {
      setReading(false);
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setMsg(null);
    const fd = new FormData(e.currentTarget);
    fd.set("autoDetect", String(autoDetect));
    const res = await fetch("/api/admin/papers", { method: "POST", body: fd });
    const body = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) return setMsg({ ok: false, text: body.error ?? "Upload failed" });
    setMsg({
      ok: true,
      text: autoDetect ? `Uploaded ${paperCode} ${series} ${year} — finding questions…` : `Uploaded ${paperCode} ${series} ${year} — open Review to mark its questions.`,
    });
    formRef.current?.reset();
    setPaperCode("");
    setNote(null);
    router.refresh();
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div className="space-y-2 sm:col-span-2 lg:col-span-3">
        <Label htmlFor="file">Question paper (PDF)</Label>
        <Input id="file" name="file" type="file" accept="application/pdf,.pdf" required onChange={(e) => onFile(e.target.files?.[0])} />
        {(reading || note) && <p className="text-xs text-muted-foreground">{reading ? "Reading the cover page…" : note}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="subjectId">Subject</Label>
        <select id="subjectId" name="subjectId" className={selectCls} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
          {subjects.map((s) => <option key={s.id} value={s.id}>{subjectLabel(s)}</option>)}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="paperCode">Paper code</Label>
        <Input id="paperCode" name="paperCode" placeholder="e.g. 4MB1/01 or WPH13/01" value={paperCode} onChange={(e) => setPaperCode(e.target.value.toUpperCase())} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="tier">Tier</Label>
        <select id="tier" name="tier" className={selectCls} value={tier} onChange={(e) => setTier(e.target.value)}>
          <option value="">No tier</option>
          <option value="F">Foundation</option>
          <option value="H">Higher</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="series">Series</Label>
        <select id="series" name="series" className={selectCls} value={series} onChange={(e) => setSeries(e.target.value)}>
          {SERIES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="year">Year</Label>
        <Input id="year" name="year" type="number" min={2000} max={2100} value={year} onChange={(e) => setYear(e.target.value)} required />
      </div>
      <div className="flex items-end">
        <Button type="submit" disabled={pending || reading} className="w-full">{pending ? "Uploading…" : "Upload paper"}</Button>
      </div>
      <div className="sm:col-span-2 lg:col-span-3">
        <AutoDetect value={autoDetect} onChange={setAutoDetect} />
      </div>
      {msg && <p className={cn("text-sm sm:col-span-2 lg:col-span-3", msg.ok ? "text-emerald-700" : "text-destructive")}>{msg.text}</p>}
    </form>
  );
}

function ZipUpload() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [autoDetect, setAutoDetect] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<BulkRow[] | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setPending(true);
    setError(null);
    setRows(null);
    const fd = new FormData(form);
    fd.set("autoDetect", String(autoDetect));
    const res = await fetch("/api/admin/papers/bulk", { method: "POST", body: fd });
    const body = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) return setError(body.error ?? "Upload failed");
    setRows(body.results);
    form.reset();
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-2">
            <Label htmlFor="zip">ZIP file</Label>
            <Input id="zip" name="file" type="file" accept=".zip,application/zip" required />
          </div>
          <Button type="submit" disabled={pending}>{pending ? "Uploading… this can take a minute" : "Upload ZIP"}</Button>
        </div>
        <AutoDetect value={autoDetect} onChange={setAutoDetect} />
      </form>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {rows && (
        <ul className="divide-y rounded-lg border text-sm">
          {rows.length === 0 && <li className="p-3 text-muted-foreground">No PDFs found in the ZIP.</li>}
          {rows.map((r) => (
            <li key={r.file} className="flex gap-3 p-3">
              <span className={r.ok ? "text-emerald-600" : "text-amber-600"}>{r.ok ? "✓" : "!"}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-xs leading-5">{r.file}</span>
              <span className="text-muted-foreground">{r.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

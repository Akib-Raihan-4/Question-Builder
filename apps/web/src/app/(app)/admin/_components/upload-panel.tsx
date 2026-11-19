"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { unzipSync } from "fflate";
import { isRegional, parsePaperFilename, SERIES, withRegional } from "@/lib/paper-filename";
import { matchSubject, MAX_UPLOAD_BYTES } from "@/lib/papers/match";
import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/select";
import { postWithProgress } from "@/lib/upload";

export type Subject = { id: string; name: string; specCode: string; qualification: string };
type BulkRow = { file: string; ok: boolean; message: string };

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
        {mode === "zip" ? <ZipUpload subjects={subjects} /> : <SingleUpload subjects={subjects} defaultSubjectId={defaultSubjectId} />}
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
  // Regional (R) is its own choice: it can be picked before or after the code, and is applied to
  // the code when the paper is uploaded (4MB1/02 → 4MB1/02R).
  const [regional, setRegional] = useState(false);
  const [autoDetect, setAutoDetect] = useState(true);
  const [reading, setReading] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState<number | null>(null); // upload progress 0–1

  useEffect(() => {
    if (defaultSubjectId) setSubjectId(defaultSubjectId);
  }, [defaultSubjectId]);

  async function onFile(file: File | undefined) {
    setNote(null);
    setMsg(null);
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      setMsg({ ok: false, text: `This PDF is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is 4.4 MB. Compress it (e.g. "Reduce file size" in Preview or an online PDF compressor) and try again.` });
      return;
    }
    const meta = parsePaperFilename(file.name);
    if (meta) {
      const s = subjects.find((x) => x.specCode === meta.specCode);
      if (s) setSubjectId(s.id);
      setPaperCode(meta.paperCode);
      setRegional(isRegional(meta.paperCode));
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
        if (c.paper_code) {
          setPaperCode(c.paper_code);
          setRegional(isRegional(c.paper_code));
        }
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
    fd.set("paperCode", withRegional(paperCode, regional));
    setSent(0);
    let res: { ok: boolean; body: Record<string, unknown> };
    try {
      res = await postWithProgress("/api/admin/papers", fd, setSent);
    } catch (err) {
      setPending(false);
      setSent(null);
      return setMsg({ ok: false, text: (err as Error).message });
    }
    const body = res.body;
    setPending(false);
    setSent(null);
    if (!res.ok) return setMsg({ ok: false, text: String(body.error ?? "Upload failed") });
    setMsg({
      ok: true,
      text: autoDetect ? `Uploaded ${paperCode} ${series} ${year} — finding questions…` : `Uploaded ${paperCode} ${series} ${year} — open Review to mark its questions.`,
    });
    formRef.current?.reset();
    setPaperCode("");
    setRegional(false);
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
        <Select
          id="subjectId"
          aria-label="Subject"
          className="w-full"
          value={subjectId}
          onValueChange={setSubjectId}
          options={subjects.map((s) => ({ value: s.id, label: subjectLabel(s), group: s.qualification }))}
        />
        <input type="hidden" name="subjectId" value={subjectId} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="paperCode">Paper code</Label>
        <Input
          id="paperCode"
          name="paperCode"
          placeholder="e.g. 4MB1/01 or WPH13/01"
          value={paperCode}
          onChange={(e) => {
            const v = e.target.value.toUpperCase();
            setPaperCode(v);
            if (isRegional(v)) setRegional(true);
          }}
          required
        />
        {regional && paperCode && withRegional(paperCode, true) !== paperCode && (
          <p className="text-xs text-muted-foreground">Uploads as {withRegional(paperCode, true)}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="version">Version</Label>
        <Select
          id="version"
          aria-label="Version"
          className="w-full"
          value={regional ? "R" : "S"}
          onValueChange={(v) => {
            setRegional(v === "R");
            if (paperCode) setPaperCode(withRegional(paperCode, v === "R"));
          }}
          options={[
            { value: "S", label: "Standard" },
            { value: "R", label: "Regional (R)", hint: "code ends in R" },
          ]}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="tier">Tier</Label>
        <Select
          id="tier"
          aria-label="Tier"
          className="w-full"
          value={tier || "none"}
          onValueChange={(v) => setTier(v === "none" ? "" : v)}
          options={[
            { value: "none", label: "No tier" },
            { value: "F", label: "Foundation" },
            { value: "H", label: "Higher" },
          ]}
        />
        <input type="hidden" name="tier" value={tier} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="series">Series</Label>
        <Select id="series" aria-label="Series" className="w-full" value={series} onValueChange={setSeries} options={SERIES.map((x) => ({ value: x, label: x }))} />
        <input type="hidden" name="series" value={series} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="year">Year</Label>
        <Input id="year" name="year" type="number" min={2000} max={2100} value={year} onChange={(e) => setYear(e.target.value)} required />
      </div>
      <div className="flex items-end">
        <Button type="submit" disabled={pending || reading} className="w-full">
          {pending ? (sent !== null && sent < 1 ? `Uploading ${Math.round(sent * 100)}%` : "Saving…") : "Upload paper"}
        </Button>
      </div>
      <div className="sm:col-span-2 lg:col-span-3">
        <AutoDetect value={autoDetect} onChange={setAutoDetect} />
      </div>
      {msg && <p className={cn("text-sm sm:col-span-2 lg:col-span-3", msg.ok ? "text-emerald-700" : "text-destructive")}>{msg.text}</p>}
    </form>
  );
}

/**
 * ZIP upload, unzipped in the browser: each PDF is uploaded as its own small request (hosting
 * limits request bodies to ~4.5 MB). Details come from the file name, else from the cover page.
 */
function ZipUpload({ subjects }: { subjects: Subject[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [autoDetect, setAutoDetect] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<BulkRow[] | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  async function uploadOne(name: string, bytes: Uint8Array): Promise<BulkRow> {
    if (bytes.length > MAX_UPLOAD_BYTES) return { file: name, ok: false, message: "Skipped: larger than 4.4 MB" };
    const file = new File([bytes as BlobPart], name, { type: "application/pdf" });
    let meta = parsePaperFilename(name);
    let subjectId = meta ? matchSubject(meta.paperCode, subjects)?.id : undefined;
    if (!meta || !subjectId) {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/papers/inspect", { method: "POST", body: fd });
      const body = await res.json().catch(() => ({}));
      const c = body.cover;
      if (c?.paper_code && c.series && c.year) {
        meta = { specCode: "", paperCode: c.paper_code, series: c.series, year: c.year, tier: c.tier ?? null };
        subjectId = body.subjectId ?? undefined;
      }
    }
    if (!meta) return { file: name, ok: false, message: "Skipped: couldn't tell the paper code/series/year — upload it on its own" };
    if (!subjectId) return { file: name, ok: false, message: `Skipped: no subject for ${meta.paperCode} — add the subject first` };
    const fd = new FormData();
    fd.append("file", file);
    fd.append("subjectId", subjectId);
    fd.append("paperCode", meta.paperCode);
    fd.append("series", meta.series);
    fd.append("year", String(meta.year));
    fd.append("tier", meta.tier ?? "");
    fd.append("autoDetect", String(autoDetect));
    const res = await fetch("/api/admin/papers", { method: "POST", body: fd });
    const body = await res.json().catch(() => ({}));
    return res.ok
      ? { file: name, ok: true, message: `${meta.paperCode} ${meta.series} ${meta.year}` }
      : { file: name, ok: false, message: body.error ?? "Upload failed" };
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const zip = (form.elements.namedItem("file") as HTMLInputElement).files?.[0];
    if (!zip) return;
    setPending(true);
    setError(null);
    setRows([]);
    let entries: Record<string, Uint8Array>;
    try {
      entries = unzipSync(new Uint8Array(await zip.arrayBuffer()), {
        filter: (f) => f.name.toLowerCase().endsWith(".pdf") && !f.name.includes("__MACOSX/"),
      });
    } catch {
      setPending(false);
      return setError("Could not read the ZIP file");
    }
    const files = Object.entries(entries).sort(([a], [b]) => a.localeCompare(b));
    const done: BulkRow[] = [];
    for (const [i, [path, bytes]] of files.entries()) {
      const name = path.split("/").pop()!;
      setProgress(`Uploading ${i + 1} of ${files.length}: ${name}`);
      done.push(await uploadOne(name, bytes));
      setRows([...done]);
    }
    setProgress(null);
    setPending(false);
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
          <Button type="submit" disabled={pending}>{pending ? "Uploading…" : "Upload ZIP"}</Button>
        </div>
        <AutoDetect value={autoDetect} onChange={setAutoDetect} />
      </form>
      {progress && <p className="text-sm text-muted-foreground">{progress}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {rows && rows.length > 0 && (
        <ul className="divide-y rounded-lg border text-sm">
          {rows.map((r) => (
            <li key={r.file} className="flex gap-3 p-3">
              <span className={r.ok ? "text-emerald-600" : "text-amber-600"}>{r.ok ? "✓" : "!"}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-xs leading-5">{r.file}</span>
              <span className="text-muted-foreground">{r.message}</span>
            </li>
          ))}
        </ul>
      )}
      {rows && rows.length === 0 && !pending && <p className="text-sm text-muted-foreground">No PDFs found in the ZIP.</p>}
    </div>
  );
}

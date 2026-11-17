"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parsePaperFilename, SERIES } from "@/lib/paper-filename";
import { cn } from "@/lib/utils";

type Subject = { id: string; name: string; specCode: string };
type BulkRow = { file: string; ok: boolean; message: string };

const selectCls =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function UploadPanel({ subjects }: { subjects: Subject[] }) {
  const [mode, setMode] = useState<"single" | "zip">("zip");
  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload</CardTitle>
        <CardDescription>
          {mode === "zip"
            ? "A ZIP of question papers. Details are read from file names, e.g. 4MA1_1H_2020_06_qp.pdf or IGCSE_MATHEMATICS_B_2021_MayJune_P1_QP.pdf."
            : "One question paper PDF. Choosing a file fills in what it can from the file name."}
        </CardDescription>
        <div className="mt-2 inline-flex w-fit rounded-lg bg-muted p-1 text-sm">
          {(["zip", "single"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "rounded-md px-3 py-1",
                mode === m ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m === "zip" ? "ZIP (bulk)" : "Single PDF"}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>{mode === "zip" ? <ZipUpload /> : <SingleUpload subjects={subjects} />}</CardContent>
    </Card>
  );
}

function SingleUpload({ subjects }: { subjects: Subject[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
  const [paperCode, setPaperCode] = useState("");
  const [series, setSeries] = useState<string>("June");
  const [year, setYear] = useState(String(new Date().getFullYear() - 1));
  const [tier, setTier] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  function onFile(file: File | undefined) {
    if (!file) return;
    const meta = parsePaperFilename(file.name);
    if (!meta) return;
    const s = subjects.find((x) => x.specCode === meta.specCode);
    if (s) setSubjectId(s.id);
    setPaperCode(meta.paperCode);
    setSeries(meta.series);
    setYear(String(meta.year));
    setTier(meta.tier ?? "");
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setMsg(null);
    const res = await fetch("/api/admin/papers", { method: "POST", body: new FormData(e.currentTarget) });
    const body = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) return setMsg({ ok: false, text: body.error ?? "Upload failed" });
    setMsg({ ok: true, text: `Uploaded ${paperCode} ${series} ${year} — processing…` });
    formRef.current?.reset();
    setPaperCode("");
    router.refresh();
  }

  const spec = subjects.find((s) => s.id === subjectId)?.specCode ?? "";

  return (
    <form ref={formRef} onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div className="space-y-2 sm:col-span-2 lg:col-span-3">
        <Label htmlFor="file">Question paper (PDF)</Label>
        <Input id="file" name="file" type="file" accept="application/pdf,.pdf" required onChange={(e) => onFile(e.target.files?.[0])} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="subjectId">Subject</Label>
        <select id="subjectId" name="subjectId" className={selectCls} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>{s.specCode} · {s.name}</option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="paperCode">Paper code</Label>
        <Input id="paperCode" name="paperCode" placeholder={spec === "4MB1" ? "4MB1/01" : `${spec}/1H`} value={paperCode} onChange={(e) => setPaperCode(e.target.value.toUpperCase())} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="tier">Tier</Label>
        <select id="tier" name="tier" className={selectCls} value={tier} onChange={(e) => setTier(e.target.value)}>
          <option value="">Untiered</option>
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
        <Button type="submit" disabled={pending} className="w-full">{pending ? "Uploading…" : "Upload paper"}</Button>
      </div>
      {msg && <p className={cn("text-sm sm:col-span-2 lg:col-span-3", msg.ok ? "text-emerald-700" : "text-destructive")}>{msg.text}</p>}
    </form>
  );
}

function ZipUpload() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<BulkRow[] | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setRows(null);
    const res = await fetch("/api/admin/papers/bulk", { method: "POST", body: new FormData(e.currentTarget) });
    const body = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) return setError(body.error ?? "Upload failed");
    setRows(body.results);
    e.currentTarget?.reset?.();
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-2">
          <Label htmlFor="zip">ZIP file</Label>
          <Input id="zip" name="file" type="file" accept=".zip,application/zip" required />
        </div>
        <Button type="submit" disabled={pending}>{pending ? "Uploading… this can take a minute" : "Upload ZIP"}</Button>
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

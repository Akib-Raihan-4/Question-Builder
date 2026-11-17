"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PapersTable, type PaperRow } from "./papers-table";
import { UploadPanel, type Subject } from "./upload-panel";

/** Past papers, one tab per subject/level (e.g. "Mathematics B · International GCSE", "Physics Unit 3 · International A Level"). */
export function PapersWorkspace({ subjects, rows }: { subjects: Subject[]; rows: (PaperRow & { subjectId: string })[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.subjectId, (counts.get(r.subjectId) ?? 0) + 1);
  // Tabs: subjects that have papers first, then the rest.
  const tabs = [...subjects].sort((a, b) => (counts.get(b.id) ?? 0 ? 1 : 0) - (counts.get(a.id) ?? 0 ? 1 : 0));
  const firstWithPapers = tabs.find((s) => counts.get(s.id))?.id ?? tabs[0]?.id ?? "";
  const active = params.get("subject") ?? firstWithPapers;
  const [adding, setAdding] = useState(false);
  const current = subjects.find((s) => s.id === active);

  const select = (id: string) => router.replace(`/admin?subject=${id}`, { scroll: false });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1 border-b">
        {tabs.map((s) => {
          const n = counts.get(s.id) ?? 0;
          return (
            <button
              key={s.id}
              onClick={() => select(s.id)}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-left text-sm transition-colors",
                s.id === active ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground",
                !n && s.id !== active && "opacity-60",
              )}
            >
              {s.name}
              <span className="block text-[11px] font-normal text-muted-foreground">
                {s.qualification} · {s.specCode} · {n} paper{n === 1 ? "" : "s"}
              </span>
            </button>
          );
        })}
        <button onClick={() => setAdding((a) => !a)} className="ml-auto rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
          {adding ? "Cancel" : "+ Add subject"}
        </button>
      </div>

      {adding && <AddSubject onAdded={(id) => { setAdding(false); router.refresh(); select(id); }} />}

      <UploadPanel subjects={subjects} defaultSubjectId={current?.id} />
      <PapersTable rows={rows.filter((r) => r.subjectId === active)} subjectName={current ? `${current.name} (${current.qualification})` : ""} />
    </div>
  );
}

function AddSubject({ onAdded }: { onAdded: (id: string) => void }) {
  const [qualification, setQualification] = useState("International A Level");
  const [name, setName] = useState("");
  const [specCode, setSpecCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="grid gap-3 rounded-xl border bg-background p-4 sm:grid-cols-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const res = await fetch("/api/admin/subjects", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ qualification, name, specCode }),
        });
        const body = await res.json().catch(() => ({}));
        setBusy(false);
        if (!res.ok) return setError(body.error ?? "Could not add the subject");
        onAdded(body.id);
      }}
    >
      <p className="text-sm text-muted-foreground sm:col-span-4">
        Add a subject or an A-level unit. Papers whose code starts with the spec code (e.g. <b>WPH14</b>/01) are matched to it automatically.
      </p>
      <select className="h-9 rounded-lg border px-2 text-sm" value={qualification} onChange={(e) => setQualification(e.target.value)} aria-label="Qualification">
        <option>International A Level</option>
        <option>International GCSE</option>
        <option>A Level</option>
        <option>GCSE</option>
      </select>
      <Input placeholder="Name, e.g. Physics Unit 4" value={name} onChange={(e) => setName(e.target.value)} required aria-label="Subject name" />
      <Input placeholder="Spec code, e.g. WPH14" value={specCode} onChange={(e) => setSpecCode(e.target.value.toUpperCase())} required aria-label="Spec code" />
      <Button type="submit" disabled={busy}>{busy ? "Adding…" : "Add subject"}</Button>
      {error && <p className="text-sm text-destructive sm:col-span-4">{error}</p>}
    </form>
  );
}

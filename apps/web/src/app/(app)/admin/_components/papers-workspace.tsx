"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { PapersTable, type PaperRow } from "./papers-table";
import { UploadPanel, type Subject } from "./upload-panel";
import { Select } from "@/components/ui/select";
import { MsReviewBanner } from "./ms-review-banner";
import { toast } from "@/components/feedback";
import { ProcessorStatus } from "./processor-status";

type Row = PaperRow & { subjectId: string };
type Stats = { papers: number; review: number; failed: number; published: number };

/**
 * Past papers by subject/level (e.g. "Mathematics B · International GCSE", "Physics Unit 3 ·
 * International A Level"): a subject list on the left (a dropdown on phones), that subject's
 * papers on the right. Every paper is already on the page, so switching subject is instant —
 * only the address changes (?subject=…), nothing is fetched.
 */
export function PapersWorkspace({ subjects, rows }: { subjects: Subject[]; rows: Row[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [refreshing, startRefresh] = useTransition();

  const stats = useMemo(() => {
    const m = new Map<string, Stats>();
    for (const r of rows) {
      const s = m.get(r.subjectId) ?? { papers: 0, review: 0, failed: 0, published: 0 };
      s.papers++;
      if (r.status === "needs_review" || r.msStatus === "needs_review") s.review++;
      if (r.status === "failed") s.failed++;
      if (r.status === "published") s.published++;
      m.set(r.subjectId, s);
    }
    return m;
  }, [rows]);
  const statsOf = (id: string): Stats => stats.get(id) ?? { papers: 0, review: 0, failed: 0, published: 0 };

  // Grouped by level; within a level, subjects with papers first.
  const groups = useMemo(() => {
    const g = new Map<string, Subject[]>();
    for (const s of subjects) g.set(s.qualification, [...(g.get(s.qualification) ?? []), s]);
    return [...g].map(([level, list]) => ({
      level,
      list: list.sort((a, b) => Number(Boolean(statsOf(b.id).papers)) - Number(Boolean(statsOf(a.id).papers)) || a.name.localeCompare(b.name)),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- statsOf reads `stats`
  }, [subjects, stats]);
  const firstWithPapers = groups.flatMap((g) => g.list).find((s) => statsOf(s.id).papers)?.id ?? subjects[0]?.id ?? "";
  const active = params.get("subject") ?? firstWithPapers;
  const current = subjects.find((s) => s.id === active);
  const currentStats = statsOf(active);

  const [filter, setFilter] = useState("");
  const [dialog, setDialog] = useState<"add" | "rename" | null>(null);
  const [uploading, setUploading] = useState(false);
  const showUpload = uploading || currentStats.papers === 0;

  /** Switch subject without a round trip to the server. */
  function select(id: string) {
    if (id === active) return;
    setUploading(false);
    window.history.replaceState(null, "", `/admin?subject=${id}`);
  }

  const shown = filter.trim()
    ? groups
        .map((g) => ({ ...g, list: g.list.filter((s) => `${s.name} ${s.specCode} ${s.qualification}`.toLowerCase().includes(filter.trim().toLowerCase())) }))
        .filter((g) => g.list.length)
    : groups;

  return (
    <div className="grid gap-6 lg:grid-cols-[17rem_1fr]">
      {/* Subjects: a list on wide screens */}
      <aside className="hidden lg:block" aria-label="Subjects">
        <div className="sticky top-20 flex max-h-[calc(100dvh-6rem)] flex-col rounded-xl bg-background ring-1 ring-foreground/10">
          <div className="space-y-2 border-b p-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">Subjects</h2>
              <Button size="sm" variant="ghost" onClick={() => setDialog("add")}>
                + Add
              </Button>
            </div>
            {subjects.length > 6 && (
              <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find a subject…" aria-label="Find a subject" className="h-8" />
            )}
          </div>
          <nav className="min-h-0 flex-1 overflow-y-auto p-2">
            {shown.length === 0 && <p className="px-2 py-3 text-sm text-muted-foreground">No subject matches “{filter}”.</p>}
            {shown.map((g) => (
              <div key={g.level} className="mb-2">
                <div className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g.level}</div>
                <ul className="space-y-0.5">
                  {g.list.map((s) => {
                    const st = statsOf(s.id);
                    const on = s.id === active;
                    return (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => select(s.id)}
                          aria-current={on ? "true" : undefined}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors",
                            on ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                            !st.papers && !on && "text-muted-foreground",
                          )}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{s.name}</span>
                            <span className={cn("block truncate text-xs", on ? "text-primary-foreground/75" : "text-muted-foreground")}>
                              {s.specCode} · {st.papers} paper{st.papers === 1 ? "" : "s"}
                            </span>
                          </span>
                          {st.review > 0 && (
                            <span
                              className={cn("shrink-0 rounded-full px-1.5 text-xs font-semibold leading-5", on ? "bg-amber-400 text-amber-950" : "bg-amber-100 text-amber-800")}
                              title={`${st.review} to review`}
                            >
                              {st.review}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </div>
      </aside>

      <div className="min-w-0 space-y-4">
        {/* Phones and tablets: pick the subject from a list */}
        <div className="flex items-center gap-2 lg:hidden">
          <Select
            aria-label="Subject"
            value={active}
            onValueChange={select}
            className="min-w-0 flex-1"
            options={groups.flatMap((g) =>
              g.list.map((s) => {
                const st = statsOf(s.id);
                return { value: s.id, label: s.name, group: g.level, hint: `${s.specCode} · ${st.papers}${st.review ? ` · ${st.review} to review` : ""}` };
              }),
            )}
          />
          <Button variant="outline" onClick={() => setDialog("add")}>
            + Add
          </Button>
        </div>

        {current ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl bg-background p-4 ring-1 ring-foreground/10">
            {/* Phones: details on their own line, buttons under them */}
            <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-lg font-semibold">{current.name}</h2>
                {refreshing && <Spinner className="text-muted-foreground" label="Updating" />}
              </div>
              <p className="text-sm text-muted-foreground">
                {current.qualification} · <span className="font-mono">{current.specCode}</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {currentStats.papers} paper{currentStats.papers === 1 ? "" : "s"}
                {currentStats.published > 0 && <> · <span className="text-emerald-700">{currentStats.published} published</span></>}
                {currentStats.review > 0 && <> · <span className="text-amber-700">{currentStats.review} to review</span></>}
                {currentStats.failed > 0 && <> · <span className="text-red-700">{currentStats.failed} failed</span></>}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => setDialog("rename")}>
                Edit subject
              </Button>
              {currentStats.papers > 0 && (
                <Button onClick={() => setUploading((u) => !u)} variant={uploading ? "outline" : "default"}>
                  {uploading ? "Hide upload" : "Upload papers"}
                </Button>
              )}
            </div>
            <div className="basis-full border-t pt-2.5">
              <ProcessorStatus />
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            No subjects yet. <button className="font-medium text-foreground underline underline-offset-2" onClick={() => setDialog("add")}>Add your first subject</button> to start uploading papers.
          </div>
        )}

        {showUpload && current && <UploadPanel key={`upload-${current.id}`} subjects={subjects} defaultSubjectId={current.id} />}
        {current && <MsReviewBanner subjectId={current.id} waiting={rows.filter((r) => r.subjectId === active && r.msStatus === "needs_review").length} />}
        {current && (
          <div key={`papers-${active}`} className="animate-fade-in">
            <PapersTable rows={rows.filter((r) => r.subjectId === active)} subjectName={`${current.name} (${current.qualification})`} />
          </div>
        )}
      </div>

      <Dialog
        open={dialog === "add"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Add a subject"
        description={
          <>
            A subject or an A-level unit. Papers whose code starts with the spec code (e.g. <b>WPH14</b>/01) are matched to it automatically. To give one
            paper its own subject, put the paper in the spec code: <b>4MB1/02</b> takes Maths B Paper 2 and 2R (already uploaded ones move too).
          </>
        }
      >
        <SubjectForm
          onCancel={() => setDialog(null)}
          onDone={(id) => {
            setDialog(null);
            startRefresh(() => {
              router.refresh();
              window.history.replaceState(null, "", `/admin?subject=${id}`);
            });
          }}
        />
      </Dialog>
      <Dialog
        open={dialog === "rename" && Boolean(current)}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Edit subject"
        description="Teachers see the new name straight away; its papers stay with it."
      >
        {current && (
          <SubjectForm
            key={current.id}
            subject={current}
            onCancel={() => setDialog(null)}
            onDone={() => {
              setDialog(null);
              startRefresh(() => router.refresh());
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

/** Add a subject, or rename one (name, level, spec code). */
function SubjectForm({ subject, onDone, onCancel }: { subject?: Subject; onDone: (id: string) => void; onCancel: () => void }) {
  const [qualification, setQualification] = useState(subject?.qualification ?? "International A Level");
  const [name, setName] = useState(subject?.name ?? "");
  const [specCode, setSpecCode] = useState(subject?.specCode ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const editing = Boolean(subject);
  const unchanged = editing && name === subject!.name && specCode === subject!.specCode && qualification === subject!.qualification;

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          const res = await fetch(editing ? `/api/admin/subjects/${subject!.id}` : "/api/admin/subjects", {
            method: editing ? "PATCH" : "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ qualification, name, specCode }),
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) return setError(body.error ?? (editing ? "Could not save the subject" : "Could not add the subject"));
          toast(editing ? `Saved ${body.name ?? name}` : `Added ${body.name ?? name}`);
          if (body.moved) toast(`Moved ${body.moved} paper${body.moved === 1 ? "" : "s"} into ${body.name}`);
          onDone(body.id);
        } catch {
          setError("Couldn't reach the server. Check your connection and try again.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">Level</span>
        <Select
          aria-label="Level"
          value={qualification}
          onValueChange={setQualification}
          className="w-full"
          options={["International A Level", "International GCSE", "A Level", "GCSE", "O Level"].map((q) => ({ value: q, label: q }))}
        />
      </label>
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">Name</span>
        <Input placeholder="e.g. Physics Unit 4" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
      </label>
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">Spec code</span>
        <Input placeholder="e.g. WPH14 or 4MB1/02" value={specCode} onChange={(e) => setSpecCode(e.target.value.toUpperCase())} required className="font-mono" />
      </label>
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || unchanged}>
          {busy ? (
            <>
              <Spinner /> Saving…
            </>
          ) : editing ? (
            "Save changes"
          ) : (
            "Add subject"
          )}
        </Button>
      </div>
    </form>
  );
}

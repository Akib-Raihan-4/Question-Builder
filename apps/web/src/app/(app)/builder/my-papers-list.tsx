"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/feedback";
import { DeletePaperButton, DuplicatePaperButton } from "./paper-actions";
import { EmptyState } from "@/components/empty-state";

type Paper = { id: string; title: string; updatedAt: string; items: number; marks: number; subjects: string[] };

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

export function MyPapersList({ papers }: { papers: Paper[] }) {
  const [q, setQ] = useState("");
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = papers.filter((p) => words.every((w) => `${p.title} ${p.subjects.join(" ")}`.toLowerCase().includes(w)));

  if (papers.length === 0) {
    return (
      <EmptyState title="You haven’t built a paper yet">
        Press <span className="font-medium text-foreground">New paper</span>, then click questions in past papers to add them.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-3">
      {papers.length > 3 && (
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search your papers by name or subject"
          aria-label="Search your papers"
          className="h-10 w-full rounded-lg border bg-background px-3 text-base sm:max-w-sm sm:text-sm"
        />
      )}
      {shown.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">No papers match “{q}”.</p>
      ) : (
        <ul className="divide-y rounded-xl border bg-background">
          {shown.map((p) => (
            <PaperRow key={p.id} paper={p} />
          ))}
        </ul>
      )}
    </div>
  );
}

function PaperRow({ paper: p }: { paper: Paper }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(p.title);

  async function save() {
    setEditing(false);
    const next = title.trim();
    if (!next || next === p.title) return setTitle(p.title);
    const res = await fetch(`/api/built-papers/${p.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: next }),
    });
    if (!res.ok) {
      setTitle(p.title);
      return toast("Could not rename the paper", "error");
    }
    toast("Renamed");
    router.refresh();
  }

  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                setTitle(p.title);
                setEditing(false);
              }
            }}
            aria-label="Paper name"
            className="h-9 w-full rounded-md border px-2 text-base font-medium sm:text-sm"
          />
        ) : (
          <div className="flex items-center gap-1">
            <Link href={`/builder/${p.id}`} className="truncate font-medium hover:underline">
              {title}
            </Link>
            <button
              onClick={() => setEditing(true)}
              className="shrink-0 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground pointer-coarse:py-1.5"
              aria-label={`Rename ${title}`}
              title="Rename"
            >
              ✎
            </button>
          </div>
        )}
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {p.subjects.map((s) => (
            <span key={s} className="rounded bg-muted px-1.5 py-0.5 text-foreground/80">{s}</span>
          ))}
          <span>
            {p.items} question{p.items === 1 ? "" : "s"} · {p.marks} marks · edited {when(p.updatedAt)}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 gap-1">
        <Link href={`/builder/${p.id}`} className="inline-flex h-8 items-center rounded-md border px-3 text-sm hover:bg-muted pointer-coarse:h-9">
          Open
        </Link>
        <DuplicatePaperButton id={p.id} />
        <DeletePaperButton id={p.id} title={title} questions={p.items} />
      </div>
    </li>
  );
}

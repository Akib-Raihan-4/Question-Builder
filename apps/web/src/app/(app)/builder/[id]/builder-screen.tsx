"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { PaperHeader } from "@/db/schema";
import type { BankQuestion, Item } from "@/lib/builder/model";
import { useBuilder } from "@/lib/builder/store";
import { BrowsePane, type SourcePaper } from "./browse-pane";
import { PaperPane } from "./paper-pane";

type Props = {
  paper: { id: string; title: string; header: PaperHeader; items: Item[]; bank: BankQuestion[] };
  sources: SourcePaper[];
};

export function BuilderScreen({ paper, sources }: Props) {
  const [ready, setReady] = useState(false);
  const [saveState, setSaveState] = useState("Saved");
  const savedVersion = useRef(0);

  // Load this paper into the store once.
  useEffect(() => {
    const s = useBuilder.getState();
    s.addToBank(paper.bank);
    s.load({ title: paper.title, header: paper.header, items: paper.items.filter((i) => paper.bank.some((q) => q.id === i.questionId)) });
    savedVersion.current = 0;
    setReady(true);
  }, [paper]);

  // Auto-save a couple of seconds after the last change.
  useEffect(() => {
    if (!ready) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const save = async () => {
      const { title, header, items, version } = useBuilder.getState();
      if (version === savedVersion.current) return;
      setSaveState("Saving…");
      try {
        const res = await fetch(`/api/built-papers/${paper.id}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title, header, items }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Save failed");
        savedVersion.current = version;
        setSaveState(useBuilder.getState().version === version ? "Saved" : "Unsaved changes");
      } catch (e) {
        setSaveState(`Not saved: ${(e as Error).message}`);
      }
    };
    const unsub = useBuilder.subscribe((s, prev) => {
      if (s.version === prev.version) return;
      setSaveState("Unsaved changes");
      if (timer) clearTimeout(timer);
      timer = setTimeout(save, 1500);
    });
    const onUnload = (e: BeforeUnloadEvent) => {
      if (useBuilder.getState().version !== savedVersion.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", onUnload);
    return () => {
      unsub();
      window.removeEventListener("beforeunload", onUnload);
      if (timer) {
        clearTimeout(timer);
        void save();
      }
    };
  }, [ready, paper.id]);

  return (
    <div className="-my-8 ml-[calc(50%-50vw)] flex h-[calc(100vh-3.5rem)] w-screen flex-col">
      <div className="flex items-center gap-3 border-b bg-background px-4 py-2 text-sm">
        <Link href="/builder" className="text-muted-foreground hover:text-foreground">← My papers</Link>
      </div>
      <div className="flex min-h-0 flex-1">
        {ready && <BrowsePane sources={sources} />}
        {ready && <PaperPane saveState={saveState} />}
      </div>
    </div>
  );
}

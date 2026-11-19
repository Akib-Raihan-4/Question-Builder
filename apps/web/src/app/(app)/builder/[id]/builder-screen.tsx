"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { totalMarks } from "@/lib/builder/model";
import { cn } from "@/lib/utils";
import type { PaperHeader } from "@/db/schema";
import type { BankQuestion, Item } from "@/lib/builder/model";
import { useBuilder } from "@/lib/builder/store";
import { BrowsePane, type SourcePaper } from "./browse-pane";
import { PaperPane } from "./paper-pane";
import { toast } from "@/components/feedback";

type Props = {
  paper: { id: string; title: string; header: PaperHeader; items: Item[]; bank: BankQuestion[] };
  sources: SourcePaper[];
};

export function BuilderScreen({ paper, sources }: Props) {
  const [ready, setReady] = useState(false);
  const [saveState, setSaveState] = useState("Saved");
  const savedVersion = useRef(0);
  const saveRef = useRef<(() => Promise<void>) | null>(null);
  const [exporting, setExporting] = useState(false);
  const [menu, setMenu] = useState(false);

  async function exportAs(query: string) {
    setExporting(true);
    try {
      await saveRef.current?.(); // export what's on screen
      const res = await fetch(`/api/built-papers/${paper.id}/export?${query}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.url) throw new Error(body.error ?? "Export failed");
      // A private link that expires in a few minutes; the browser saves the file.
      window.location.assign(body.url);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setExporting(false);
    }
  }
  const itemCount = useBuilder((st) => st.items.length);
  // How many of the paper's questions have a published mark scheme.
  const msCount = useBuilder((st) => st.items.filter((i) => st.bank[i.questionId]?.hasMarkScheme).length);
  const marks = useBuilder((st) => totalMarks(st.items, st.bank));
  const target = useBuilder((st) => st.header.targetMarks);

  // Phones: one pane at a time. Tablets/desktops: side by side, with a draggable divider.
  const [tab, setTab] = useState<"pick" | "paper">("pick");
  const [collapsed, setCollapsed] = useState(false);
  const [paneW, setPaneW] = useState<number | null>(null); // null = not chosen yet: use about half
  const [splitW, setSplitW] = useState(1200);
  const [isPhone, setIsPhone] = useState(false);
  const splitRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsPhone(mq.matches);
    update();
    mq.addEventListener("change", update);
    try {
      const saved = Number(localStorage.getItem("builder.paneW"));
      if (saved >= 320) setPaneW(saved);
      setCollapsed(localStorage.getItem("builder.collapsed") === "1");
    } catch {
      /* storage unavailable: defaults are fine */
    }
    return () => mq.removeEventListener("change", update);
  }, []);
  // Track the room available so the preview never squeezes the past paper below 320px.
  useEffect(() => {
    const el = splitRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSplitW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const effectivePaneW = Math.round(Math.max(320, Math.min(paneW ?? splitW * 0.47, splitW - 320)));

  useEffect(() => {
    useBuilder.getState().setPreviewVisible(isPhone ? tab === "paper" : !collapsed);
  }, [isPhone, tab, collapsed]);
  useEffect(() => {
    try {
      if (paneW != null) localStorage.setItem("builder.paneW", String(Math.round(paneW)));
      localStorage.setItem("builder.collapsed", collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [paneW, collapsed]);

  function startResize(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const box = splitRef.current!.getBoundingClientRect();
    const move = (ev: PointerEvent) => {
      const w = box.right - ev.clientX;
      setPaneW(Math.max(320, Math.min(box.width - 320, w)));
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  }

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
    saveRef.current = save;
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
    <div className="-my-6 ml-[calc(50%-50vw)] flex h-[calc(100dvh-3.5rem-1px)] w-screen flex-col sm:-my-8">
      <div className="flex items-center gap-2 border-b bg-background px-3 py-2 text-sm sm:gap-3 sm:px-4">
        <Link href="/builder" className="shrink-0 text-muted-foreground hover:text-foreground">← <span className="hidden sm:inline">My papers</span></Link>
        {/* Phones: switch between picking and the paper */}
        <div className="inline-flex rounded-lg bg-muted p-0.5 md:hidden" role="tablist" aria-label="Builder view">
          {(
            [
              ["pick", "Pick questions"],
              ["paper", `My paper (${itemCount})`],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={cn("rounded-md px-2.5 py-1.5 text-sm", tab === k ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}
            >
              {label}
            </button>
          ))}
        </div>
        {collapsed && (
          <button onClick={() => setCollapsed(false)} className="hidden rounded-md border px-2 py-1 text-xs hover:bg-muted md:inline-flex">
            Show paper ({itemCount} · {marks} marks)
          </button>
        )}
        <div className="relative ml-auto">
          <button
            disabled={!itemCount || exporting}
            onClick={() => setMenu((m) => !m)}
            aria-expanded={menu}
            className="inline-flex h-9 items-center gap-1 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/80 disabled:opacity-50 md:h-8"
            title={itemCount ? "Download this paper" : "Add some questions first"}
          >
            {exporting ? "Exporting…" : "Export ▾"}
          </button>
          {menu && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setMenu(false)} />
              <div className="absolute right-0 z-30 mt-1 w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-lg border bg-background text-sm shadow-lg">
                {(
                  [
                    ["format=pdf", "PDF", "Print-ready. Sharp, exactly like the originals."],
                    ["format=docx&mode=pictures", "Word — exact look", "Questions as pictures. Numbers, marks, header and instructions are editable."],
                    ["format=docx&mode=editable", "Word — editable text", "Question wording is editable; diagrams and tables stay as pictures. Best for wordy papers (e.g. Physics); maths with fractions may need tidying."],
                  ] as const
                ).map(([query, label, hint]) => (
                  <button
                    key={query}
                    onClick={() => {
                      setMenu(false);
                      void exportAs(query);
                    }}
                    className="block w-full px-3 py-2.5 text-left hover:bg-muted"
                  >
                    <span className="font-medium">{label}</span>
                    <span className="block text-xs text-muted-foreground">{hint}</span>
                  </button>
                ))}
                <div className="border-t bg-muted/30 px-3 pb-1 pt-2 text-xs font-medium text-muted-foreground">
                  Mark scheme {msCount < itemCount && `(${msCount} of ${itemCount} questions have one)`}
                </div>
                {(
                  [
                    ["format=ms", "Mark scheme (PDF)", "Renumbered to match your paper, with question and paper totals."],
                    ["format=pdf&ms=1", "Paper + mark scheme (PDF)", "One file: the paper, then its mark scheme."],
                  ] as const
                ).map(([query, label, hint]) => (
                  <button
                    key={query}
                    disabled={msCount === 0}
                    title={msCount === 0 ? "None of these questions has a published mark scheme yet" : undefined}
                    onClick={() => {
                      setMenu(false);
                      void exportAs(query);
                    }}
                    className="block w-full px-3 py-2.5 text-left hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
                  >
                    <span className="font-medium">{label}</span>
                    <span className="block text-xs text-muted-foreground">{hint}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div ref={splitRef} className="flex min-h-0 flex-1">
        <div className={cn("min-h-0 min-w-0 flex-1 flex-col", tab === "pick" ? "flex" : "hidden", "md:flex")}>
          {ready && <BrowsePane sources={sources} />}
        </div>
        {!collapsed && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Drag to resize the paper preview"
            onPointerDown={startResize}
            className="group hidden w-2 shrink-0 cursor-col-resize touch-none items-center justify-center border-l bg-zinc-100 hover:bg-zinc-200 md:flex"
          >
            <span className="h-10 w-0.5 rounded bg-zinc-400 group-hover:bg-zinc-600" />
          </div>
        )}
        <div
          className={cn("min-h-0 min-w-0 flex-col", tab === "paper" ? "flex w-full" : "hidden", collapsed ? "md:hidden" : "md:flex md:shrink-0 md:w-[var(--pane-w)]")}
          style={{ "--pane-w": `${effectivePaneW}px` } as React.CSSProperties}
        >
          {ready && <PaperPane saveState={saveState} onCollapse={() => setCollapsed(true)} />}
        </div>
      </div>

      {/* Phones: always show where the paper stands */}
      <div className="flex items-center gap-3 border-t bg-background px-4 py-2.5 md:hidden">
        <div className="text-sm">
          <span className="font-medium">{itemCount} question{itemCount === 1 ? "" : "s"}</span> ·{" "}
          <span className={cn(target && marks > target && "text-red-600")}>
            {marks}
            {target ? `/${target}` : ""} marks
          </span>
        </div>
        <button
          onClick={() => setTab(tab === "pick" ? "paper" : "pick")}
          className="ml-auto h-10 rounded-lg border px-3 text-sm font-medium hover:bg-muted"
        >
          {tab === "pick" ? "View paper →" : "← Pick more"}
        </button>
      </div>
    </div>
  );
}

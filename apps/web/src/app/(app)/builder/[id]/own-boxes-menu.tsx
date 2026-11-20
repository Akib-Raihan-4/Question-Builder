"use client";

import { useState } from "react";
import { Popover } from "@base-ui/react/popover";
import { DrawBoxesDialog, type DrawnBox, type Outline } from "@/components/pdf/draw-boxes-dialog";
import { msDocKey } from "@/components/pdf/pdf-cache";
import { confirmDialog, toast } from "@/components/feedback";
import type { BankQuestion, Item } from "@/lib/builder/model";
import { useBuilder } from "@/lib/builder/store";
import { cn } from "@/lib/utils";
import { loadMs } from "./mark-scheme-preview";

type Doc = "paper" | "ms";
type Target = { doc: Doc; ownerType: "question" | "part"; ownerId: string; label: string };

const plain = ({ page, x0, y0, x1, y1 }: DrawnBox) => ({ page, x0, y0, x1, y1 });

/** Reload a question as this teacher sees it (after they change their own boxes). */
async function refreshQuestion(id: string) {
  const res = await fetch(`/api/builder/questions?ids=${id}`);
  const body = await res.json().catch(() => ({}));
  if (res.ok && body.questions?.length) useBuilder.getState().addToBank(body.questions);
}

/**
 * "My boxes": a teacher redraws where a question (or its mark scheme) is cut from the past paper
 * when the shared boxes don't suit them. Their boxes are used in their own preview and exports
 * only; the shared boxes, the admin's work and other teachers are untouched.
 */
export function OwnBoxesMenu({ item, q }: { item: Item; q: BankQuestion }) {
  const ms = useBuilder((s) => s.ms[q.id]);
  const [editing, setEditing] = useState<Target | null>(null);
  const [open, setOpen] = useState(false);
  // Parts this item uses (all of them for a whole question).
  const parts = item.partIds.length ? q.parts.filter((p) => item.partIds.includes(p.id)) : q.parts;
  const msOwn = new Set((ms ?? []).filter((r) => r.own).map((r) => r.partId ?? q.id));
  const anyOwn = Boolean(q.ownBoxes || q.parts.some((p) => p.ownBoxes) || msOwn.size);

  const targets = (doc: Doc): (Target & { own: boolean })[] => [
    { doc, ownerType: "question" as const, ownerId: q.id, label: parts.length ? `Q${q.number} (whole question)` : `Q${q.number}`, own: doc === "paper" ? Boolean(q.ownBoxes) : msOwn.has(q.id) },
    ...parts.map((p) => ({ doc, ownerType: "part" as const, ownerId: p.id, label: `Q${q.number}(${p.label})`, own: doc === "paper" ? Boolean(p.ownBoxes) : msOwn.has(p.id) })),
  ];

  async function reset(t: Target) {
    if (!(await confirmDialog({ title: `Use the shared boxes for ${t.label}?`, body: "Your own boxes for it are removed. Nothing else changes.", confirmLabel: "Use shared boxes" }))) return;
    const qs = new URLSearchParams({ doc: t.doc, ownerType: t.ownerType, ownerId: t.ownerId });
    const res = await fetch(`/api/builder/own-boxes?${qs}`, { method: "DELETE" });
    if (!res.ok) return toast("Couldn't reset the boxes", "error");
    await after(t);
    toast(`${t.label} uses the shared boxes again`, "ok");
  }

  async function save(t: Target, boxes: DrawnBox[]) {
    const res = await fetch(`/api/builder/own-boxes`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ doc: t.doc, ownerType: t.ownerType, ownerId: t.ownerId, boxes: boxes.map(plain) }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return toast(body.error ?? "Couldn't save your boxes", "error");
    setEditing(null);
    await after(t);
    toast(`Saved your boxes for ${t.label} — only your papers use them`, "ok");
  }

  async function after(t: Target) {
    if (t.doc === "paper") await refreshQuestion(q.id);
    else {
      useBuilder.getState().dropMs([q.id]);
      await loadMs([q.id]).catch(() => {});
    }
  }

  async function startEdit(t: Target) {
    setOpen(false);
    if (t.doc === "ms") await loadMs([q.id]).catch(() => {});
    setEditing(t);
  }

  return (
    <>
      <Popover.Root open={open} onOpenChange={(o) => { setOpen(o); if (o && q.hasMarkScheme) loadMs([q.id]).catch(() => {}); }}>
        <Popover.Trigger
          className={cn(
            "rounded px-1.5 py-0.5 text-xs pointer-coarse:py-1.5",
            anyOwn ? "bg-violet-50 text-violet-800 hover:bg-violet-100" : "text-zinc-500 hover:bg-zinc-100",
          )}
          title="Redraw the boxes for this question, for your papers only"
        >
          {anyOwn ? "My boxes ✎" : "Boxes"}
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner sideOffset={6} align="end" className="z-[80]">
            <Popover.Popup className="w-80 rounded-xl border bg-popover p-3 text-sm shadow-lg outline-none transition-[scale,opacity] duration-100 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
              <Popover.Title className="font-medium">Your own boxes</Popover.Title>
              <Popover.Description className="mb-2 mt-0.5 text-xs text-muted-foreground">
                Cut too much or too little? Redraw it. Only your papers use your boxes — the shared ones don&apos;t change.
              </Popover.Description>
              <TargetList title="Question" targets={targets("paper")} onEdit={startEdit} onReset={reset} />
              {q.hasMarkScheme && <TargetList title="Mark scheme" targets={targets("ms")} onEdit={startEdit} onReset={reset} />}
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
      {editing && <EditDialog target={editing} q={q} onClose={() => setEditing(null)} onSave={(b) => save(editing, b)} />}
    </>
  );
}

function TargetList({
  title,
  targets,
  onEdit,
  onReset,
}: {
  title: string;
  targets: (Target & { own: boolean })[];
  onEdit: (t: Target) => void;
  onReset: (t: Target) => void;
}) {
  return (
    <div className="mt-2">
      <div className="mb-1 text-xs font-medium text-muted-foreground">{title}</div>
      <ul className="space-y-1">
        {targets.map((t) => (
          <li key={t.ownerId} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate">
              {t.label}
              {t.own && <span className="ml-1.5 rounded bg-violet-100 px-1 text-[10px] font-medium text-violet-800">yours</span>}
            </span>
            <button type="button" onClick={() => onEdit(t)} className="rounded border px-2 py-0.5 text-xs hover:bg-muted pointer-coarse:py-1.5">
              Redraw
            </button>
            {t.own && (
              <button type="button" onClick={() => onReset(t)} className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground pointer-coarse:py-1.5">
                Reset
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The draw dialog on the past paper or on its mark scheme, starting from the boxes in use now. */
function EditDialog({ target, q, onClose, onSave }: { target: Target; q: BankQuestion; onClose: () => void; onSave: (b: DrawnBox[]) => void }) {
  const ms = useBuilder((s) => s.ms[q.id]) ?? [];
  const version = useBuilder((s) => s.msVersions[q.paperId]);
  let current: DrawnBox[];
  let outlines: Outline[];
  if (target.doc === "paper") {
    const part = q.parts.find((p) => p.id === target.ownerId);
    current = (part ? part.regions : q.regions).map(plain);
    // The rest of the question for reference.
    outlines = [
      ...(part ? q.regions.map((r) => ({ ...plain(r), label: `Q${q.number}` })) : []),
      ...q.parts.filter((p) => p.id !== target.ownerId).flatMap((p) => p.regions.map((r) => ({ ...plain(r), label: `(${p.label})` }))),
    ];
  } else {
    const mine = (r: { partId: string | null }) => (target.ownerType === "question" ? true : r.partId === target.ownerId);
    current = ms.filter(mine).flatMap((r) => r.regions.map(plain));
    outlines = ms.filter((r) => !mine(r)).flatMap((r) => r.regions.map((g) => ({ ...plain(g), label: r.label })));
  }
  const startPage = current[0]?.page ?? outlines[0]?.page;
  return (
    <DrawBoxesDialog
      docKey={target.doc === "paper" ? q.paperId : msDocKey(q.paperId, version)}
      heading={`Your boxes for ${target.label}${target.doc === "ms" ? " — mark scheme" : ""} · ${q.paperLabel}`}
      help={
        <>
          The boxes used now are in orange. Click one to move it or drag its handles to resize it; remove one with its ×; drag on an empty
          part of the page to draw a new one. Only your papers use these.
        </>
      }
      boxLabel={target.label}
      outlines={outlines}
      initialBoxes={current}
      startPage={startPage}
      saveLabel="Save my boxes"
      onClose={onClose}
      onSave={onSave}
    />
  );
}

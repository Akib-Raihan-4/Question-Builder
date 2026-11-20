"use client";

import { useEffect } from "react";
import { CropCanvas } from "@/components/pdf/crop-canvas";
import { msDocKey } from "@/components/pdf/pdf-cache";
import type { Item } from "@/lib/builder/model";
import { useBuilder, type MsPreviewRow } from "@/lib/builder/store";

const pending = new Set<string>();

/** Load the mark scheme rows of these questions (once each) into the builder store. */
export async function loadMs(questionIds: string[]) {
  const { ms } = useBuilder.getState();
  const ids = questionIds.filter((id) => !ms[id] && !pending.has(id));
  if (!ids.length) return;
  ids.forEach((id) => pending.add(id));
  try {
    const res = await fetch(`/api/builder/mark-scheme?ids=${ids.join(",")}`);
    if (!res.ok) throw new Error(`Couldn't load the mark scheme (${res.status})`);
    const body: { questions: Record<string, MsPreviewRow[]>; versions: Record<string, string> } = await res.json();
    // Questions without rows get an empty list, so they aren't asked for again.
    useBuilder.getState().setMs(Object.fromEntries(ids.map((id) => [id, body.questions[id] ?? []])), body.versions);
  } finally {
    ids.forEach((id) => pending.delete(id));
  }
}

/** The rows that go with an item: all of them for a whole question, else the chosen parts' rows plus whole-question rows. */
export function msRowsForItem(item: Item, rows: MsPreviewRow[]) {
  if (!item.partIds.length) return rows;
  return rows.filter((r) => r.partId === null || item.partIds.includes(r.partId));
}

/** "4(b)(ii)" for the paper's question 2 → "2(b)(ii)". */
const renumber = (label: string, serial: number) => label.replace(/\s*\(drawn[^)]*\)\s*$/, "").replace(/^\s*\d+/, String(serial));

/**
 * The question's mark scheme under it in the preview: the board's own rows, cropped from its
 * mark scheme PDF and renumbered — what the mark scheme export will print.
 */
export function MarkSchemePreview({ item, number, paperId, width }: { item: Item; number: number; paperId: string; width: number }) {
  const rows = useBuilder((s) => s.ms[item.questionId]);
  const version = useBuilder((s) => s.msVersions[paperId]);
  useEffect(() => {
    if (!rows) loadMs([item.questionId]).catch(() => {});
  }, [rows, item.questionId]);

  if (!rows) {
    return <p className="px-2 py-3 text-xs text-muted-foreground" role="status">Loading the mark scheme…</p>;
  }
  const shown = msRowsForItem(item, rows);
  if (!shown.length) {
    return <p className="px-2 py-3 text-xs text-muted-foreground">No mark scheme for this question yet.</p>;
  }
  const labelW = 44;
  const room = Math.max(120, width - labelW);
  return (
    <div className="overflow-hidden rounded-md border border-emerald-200 bg-emerald-50/40">
      <div className="flex items-center justify-between border-b border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-800">
        <span>Mark scheme</span>
        {shown.some((r) => r.own) && <span className="font-normal">your own boxes</span>}
      </div>
      {shown.map((row) => (
        <div key={row.label + (row.partId ?? "")} className="flex border-b border-emerald-100 last:border-b-0">
          <div className="shrink-0 px-1.5 py-1 text-xs font-bold" style={{ width: labelW }}>
            {renumber(row.label, number)}
            {row.marks != null && <div className="font-normal text-muted-foreground">{row.marks} mark{row.marks === 1 ? "" : "s"}</div>}
          </div>
          <div className="min-w-0 flex-1 space-y-px bg-white">
            {row.regions.map((g, i) => (
              <CropCanvas key={i} paperId={msDocKey(paperId, version)} page={g.page} rect={g} scale={Math.min(1.2, room / (g.x1 - g.x0))} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The paper a teacher builds: an ordered list of picks from the question bank.
 * The serial number shown to students is NEVER stored — it is always position + 1.
 */
import type { PdfRect } from "@/lib/coords";
import type { AnswerSpace } from "@/db/schema";
import { answerSpaceBlocks, type Block, type Gap } from "./answer-space";

/** gaps: stretches that "remove answer space" may cut out (from the paper's layout). */
export type Region = PdfRect & { page: number; gaps?: Gap[] };

/** ownBoxes: the teacher drew their own boxes for it (used instead of the shared ones, for them only). */
export type BankPart = { id: string; label: string; marks: number; sortOrder: number; regions: Region[]; ownBoxes?: boolean };

export type BankQuestion = {
  id: string;
  paperId: string;
  paperLabel: string; // "4MB1/01 June 2020"
  number: number; // number on the ORIGINAL paper
  totalMarks: number;
  regions: Region[];
  /** The teacher drew their own boxes for the whole question. */
  ownBoxes?: boolean;
  parts: BankPart[];
  /** A published mark scheme has rows for this question (teachers can export it). */
  hasMarkScheme?: boolean;
};

/** partIds empty = the whole question. */
export type Item = { questionId: string; partIds: string[]; answerSpace?: AnswerSpace | null };

export type Bank = Record<string, BankQuestion>;

export const serial = (items: Item[], questionId: string) => items.findIndex((i) => i.questionId === questionId) + 1;

export function itemMarks(item: Item, bank: Bank): number {
  const q = bank[item.questionId];
  if (!q) return 0;
  if (!item.partIds.length) return q.totalMarks;
  return q.parts.filter((p) => item.partIds.includes(p.id)).reduce((s, p) => s + p.marks, 0);
}

export const totalMarks = (items: Item[], bank: Bank) => items.reduce((s, i) => s + itemMarks(i, bank), 0);

/** Parts of an item in paper order. */
export function chosenParts(item: Item, bank: Bank): BankPart[] {
  const q = bank[item.questionId];
  if (!q || !item.partIds.length) return [];
  return q.parts.filter((p) => item.partIds.includes(p.id)).sort((a, b) => a.sortOrder - b.sortOrder);
}

/** "Part (b) may depend on (a)" when earlier parts were left out. */
export function dependencyWarnings(item: Item, bank: Bank): string[] {
  const q = bank[item.questionId];
  if (!q || !item.partIds.length) return [];
  const parts = [...q.parts].sort((a, b) => a.sortOrder - b.sortOrder);
  const first = parts.findIndex((p) => item.partIds.includes(p.id));
  const skipped = parts.slice(0, first).map((p) => `(${p.label})`);
  if (!skipped.length) return [];
  return [`Part (${parts[first].label}) may depend on ${skipped.join(", ")}`];
}

export function addQuestion(items: Item[], q: BankQuestion): Item[] {
  const existing = items.find((i) => i.questionId === q.id);
  if (existing) {
    // Upgrade a partial pick to the whole question, in place.
    return existing.partIds.length ? items.map((i) => (i.questionId === q.id ? { ...i, partIds: [] } : i)) : items;
  }
  return [...items, { questionId: q.id, partIds: [] }];
}

export function addPart(items: Item[], q: BankQuestion, partId: string): Item[] {
  if (!q.parts.some((p) => p.id === partId)) return items;
  const existing = items.find((i) => i.questionId === q.id);
  if (!existing) return [...items, { questionId: q.id, partIds: [partId] }];
  if (!existing.partIds.length || existing.partIds.includes(partId)) return items; // already covered
  const order = new Map(q.parts.map((p) => [p.id, p.sortOrder]));
  const partIds = [...existing.partIds, partId].sort((a, b) => order.get(a)! - order.get(b)!);
  // Every part picked = the whole question.
  const whole = partIds.length === q.parts.length;
  return items.map((i) => (i.questionId === q.id ? { ...i, partIds: whole ? [] : partIds } : i));
}

export function removePart(items: Item[], q: BankQuestion, partId: string): Item[] {
  const existing = items.find((i) => i.questionId === q.id);
  if (!existing) return items;
  const current = existing.partIds.length ? existing.partIds : q.parts.map((p) => p.id);
  const partIds = current.filter((id) => id !== partId);
  if (!partIds.length) return items.filter((i) => i.questionId !== q.id);
  return items.map((i) => (i.questionId === q.id ? { ...i, partIds } : i));
}

export const removeItem = (items: Item[], questionId: string) => items.filter((i) => i.questionId !== questionId);

export function move(items: Item[], from: number, to: number): Item[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const next = [...items];
  const [it] = next.splice(from, 1);
  next.splice(to, 0, it);
  return next;
}

/**
 * The boxes to show for an item: the whole question's boxes, or — for a partial pick — the
 * question's opening text (above its first part) followed by the chosen parts' boxes.
 */
/** What to draw for an item, top to bottom, with its answer-space setting applied. */
export function itemBlocks(item: Item, bank: Bank): Block[] {
  return answerSpaceBlocks(itemRegions(item, bank), item.answerSpace, (r) => r.gaps ?? []);
}

export function itemRegions(item: Item, bank: Bank): Region[] {
  const q = bank[item.questionId];
  if (!q) return [];
  if (!item.partIds.length) return q.regions;
  const parts = [...q.parts].sort((a, b) => a.sortOrder - b.sortOrder);
  const firstTop = parts[0]?.regions[0];
  const stem: Region[] = [];
  if (firstTop) {
    for (const r of q.regions) {
      if (r.page < firstTop.page) stem.push(r);
      else if (r.page === firstTop.page && r.y0 < firstTop.y0 - 8) stem.push({ ...r, y1: Math.min(r.y1, firstTop.y0) });
    }
  }
  return [...stem, ...chosenParts(item, bank).flatMap((p) => p.regions)];
}

/**
 * Answer space: remove the past paper's own answer lines / blank working space, and/or add
 * dotted lines or blank space after a question. One function (itemBlocks) drives the builder
 * preview, the PDF and the Word export, so all three always match.
 */
import type { AnswerSpace, Box } from "@/db/schema";
import type { Region } from "./model";

/** A stretch inside a region that can go: [y0, y1] in PDF points. */
export type Gap = [number, number];

export const LINE_PITCH = 28; // pt between answer lines (as on Edexcel papers)
export const MAX_LINES = 30;
export const MAX_SPACE_CM = 20;
const CM = 72 / 2.54;

export type GapOptions = {
  /** Blank stretches at least this tall go even without dots (working space). */
  minBlank: number;
  /** White space left either side of a removed stretch so text doesn't touch. */
  pad: number;
};
export const DEFAULT_GAP_OPTIONS: GapOptions = { minBlank: 56, pad: 4 };

/**
 * Removable stretches inside one region, from its page's layout. A stretch between kept things
 * (text, drawings, images) is removable when it holds answer dots or is a big blank area. Small
 * gaps — between paragraphs, inside a diagram — always stay.
 */
export function removableGaps(region: Region, page: { ink: Box[]; dots: Box[] } | undefined, opts = DEFAULT_GAP_OPTIONS): Gap[] {
  if (!page) return [];
  const across = (b: Box) => b[2] > region.x0 + 1 && b[0] < region.x1 - 1;
  const inside = (b: Box) => b[3] > region.y0 && b[1] < region.y1;
  // Ink as merged vertical intervals, clipped to the region.
  const ink = page.ink
    .filter((b) => across(b) && inside(b))
    .map((b): Gap => [Math.max(region.y0, b[1]), Math.min(region.y1, b[3])])
    .sort((a, b) => a[0] - b[0]);
  const merged: Gap[] = [];
  for (const iv of ink) {
    const last = merged[merged.length - 1];
    if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
    else merged.push([...iv]);
  }
  const dots = page.dots.filter((b) => across(b) && inside(b));

  const gaps: Gap[] = [];
  let y = region.y0;
  for (const iv of [...merged, [region.y1, region.y1] as Gap]) {
    const [a, b] = [y, iv[0]];
    if (b > a) {
      const hasDots = dots.some((d) => (d[1] + d[3]) / 2 > a && (d[1] + d[3]) / 2 < b);
      const top = a === region.y0 ? a : a + opts.pad; // nothing above to protect at the very top
      const bottom = b === region.y1 ? b : b - opts.pad;
      if ((hasDots || b - a >= opts.minBlank) && bottom - top > 2) gaps.push([top, bottom]);
    }
    y = Math.max(y, iv[1]);
  }
  return gaps;
}

/** A region with its removable stretches cut out (pieces shorter than 2 pt are dropped). */
export function splitRegion(region: Region, gaps: Gap[]): Region[] {
  const out: Region[] = [];
  let y = region.y0;
  // Gaps may come from a taller stored box (e.g. a question's opening cut above its first part).
  const inside = gaps
    .map(([a, b]): Gap => [Math.max(a, region.y0), Math.min(b, region.y1)])
    .filter(([a, b]) => b > a)
    .sort((p, q) => p[0] - q[0]);
  for (const [a, b] of inside) {
    if (a - y >= 2) out.push({ ...region, y0: y, y1: a });
    y = Math.max(y, b);
  }
  if (region.y1 - y >= 2) out.push({ ...region, y0: y, y1: region.y1 });
  return out;
}

export type Block =
  | { kind: "crop"; region: Region }
  /** Dotted answer lines, `count` of them. */
  | { kind: "lines"; count: number }
  /** Blank space, `h` points tall. */
  | { kind: "space"; h: number };

export const blockHeight = (b: Block) =>
  b.kind === "crop" ? b.region.y1 - b.region.y0 : b.kind === "lines" ? b.count * LINE_PITCH + 6 + LINES_BOTTOM : b.h;

/** Room under the last added line so the Total line doesn't touch it. */
export const LINES_BOTTOM = 8;

/** Lines and space come in page-sized chunks so a long stretch can flow onto the next page. */
const LINES_PER_BLOCK = 8;
const SPACE_PER_BLOCK = 8 * LINE_PITCH;

/**
 * What to draw for one question, top to bottom. `gapsFor` returns a region's removable
 * stretches (empty when the paper has no layout yet, so nothing is removed).
 */
export function answerSpaceBlocks(regions: Region[], space: AnswerSpace | null | undefined, gapsFor: (r: Region) => Gap[]): Block[] {
  const crops = space?.remove ? regions.flatMap((r) => splitRegion(r, gapsFor(r))) : regions;
  const blocks: Block[] = crops.map((region) => ({ kind: "crop", region }));
  const add = space?.add;
  if (add && add.amount > 0) {
    if (add.kind === "lines") {
      let left = Math.min(MAX_LINES, Math.round(add.amount));
      while (left > 0) {
        const n = Math.min(LINES_PER_BLOCK, left);
        blocks.push({ kind: "lines", count: n });
        left -= n;
      }
    } else {
      let left = Math.min(MAX_SPACE_CM, add.amount) * CM;
      while (left > 0.5) {
        const h = Math.min(SPACE_PER_BLOCK, left);
        blocks.push({ kind: "space", h });
        left -= h;
      }
    }
  }
  return blocks;
}

/** Short words for the setting, e.g. "Removed · +6 lines". */
export function describeAnswerSpace(s: AnswerSpace | null | undefined): string {
  const parts: string[] = [];
  if (s?.remove) parts.push("Space removed");
  if (s?.add?.amount) parts.push(s.add.kind === "lines" ? `+${s.add.amount} line${s.add.amount === 1 ? "" : "s"}` : `+${s.add.amount} cm space`);
  return parts.join(" · ") || "As in the past paper";
}

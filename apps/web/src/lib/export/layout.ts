/**
 * Page layout for an exported paper. Pure and top-down (y grows downward, like stored
 * regions); the PDF writer converts to pdf-lib coordinates via coords.ts.
 *
 * Rules (PLAN.md → PDF export):
 *  - A4, 20 mm margins; the new question number sits in a left column.
 *  - Keep a crop's original size when it fits; scale down only if wider than the content area
 *    (or taller than a whole page). Never scale up.
 *  - Never split a region: if it doesn't fit, start a new page. Regions of one question may
 *    fall on different pages. A question's Total line stays with its last region.
 *  - Two refinements to avoid wasted pages: a region that misses fitting by a little is shrunk
 *    (to no less than `minFitScale`) instead of leaving a near-empty page, and a short region
 *    (e.g. a question's opening lines) is kept on the same page as the region after it.
 */

import { blockHeight, type Block } from "@/lib/builder/answer-space";

export const A4 = { w: 595.28, h: 841.89 };
const MM = 72 / 25.4;
/** School logo above the title on page 1. */
export const LOGO_MAX_H = 40; // pt (~14 mm)
export const LOGO_GAP = 8;

/** What the layout needs of each block: crops keep their size; lines and space have no width of
 * their own (w 1 = never scaled) and span the content width. */
export const blockSizes = (blocks: Block[]): Size[] =>
  blocks.map((b) => (b.kind === "crop" ? { w: b.region.x1 - b.region.x0, h: b.region.y1 - b.region.y0 } : { w: 1, h: blockHeight(b) }));

export type LayoutOptions = {
  margin: number;
  numberColW: number;
  regionGap: number;
  itemGap: number;
  totalLineH: number;
  paperTotalH: number;
  minFitScale: number;
  keepWithNextMaxH: number;
};

export const DEFAULT_LAYOUT: LayoutOptions = {
  margin: 20 * MM,
  numberColW: 26,
  regionGap: 4,
  itemGap: 14,
  totalLineH: 18,
  paperTotalH: 26,
  minFitScale: 0.85,
  keepWithNextMaxH: 160,
};

export type Size = { w: number; h: number };
export type Placement = { item: number; region: number; page: number; x: number; top: number; w: number; h: number; scale: number };
export type Mark = { item: number; page: number; top: number };

export type Layout = {
  pages: number;
  contentLeft: number;
  contentRight: number;
  placements: Placement[];
  numbers: Mark[]; // where each item's new number goes (top of its first region)
  totals: Mark[]; // where each item's Total line goes
  paperTotal: { page: number; top: number } | null;
};

export function layoutPaper(items: Size[][], headerHeight: number, opts: LayoutOptions = DEFAULT_LAYOUT): Layout {
  const top = opts.margin;
  const bottom = A4.h - opts.margin;
  const contentLeft = opts.margin;
  const contentRight = A4.w - opts.margin;
  const cropX = contentLeft + opts.numberColW;
  const maxW = contentRight - cropX;
  const maxH = bottom - top - opts.totalLineH;

  const out: Layout = { pages: 1, contentLeft, contentRight, placements: [], numbers: [], totals: [], paperTotal: null };
  let page = 0;
  let y = top + headerHeight;
  let pageHasContent = headerHeight > 0;
  const newPage = () => {
    page += 1;
    y = top;
    pageHasContent = false;
  };

  const baseScale = (size: Size) => Math.min(1, maxW / size.w, maxH / size.h);

  items.forEach((regions, item) => {
    regions.forEach((size, region) => {
      let scale = baseScale(size);
      const isLast = region === regions.length - 1;
      const extra = isLast ? opts.totalLineH : 0;
      const room = bottom - y;
      if (size.h * scale + extra > room && pageHasContent) {
        const fit = (room - extra) / size.h;
        if (fit >= scale * opts.minFitScale) scale = fit; // nearly fits: shrink a little
        else newPage();
      } else if (!isLast && pageHasContent && size.h * scale <= opts.keepWithNextMaxH) {
        // Keep a short region with the next one (don't strand a question's opening lines).
        const next = regions[region + 1];
        const nextH = next.h * baseScale(next) * opts.minFitScale + (region + 1 === regions.length - 1 ? opts.totalLineH : 0);
        if (y + size.h * scale + opts.regionGap + nextH > bottom) newPage();
      }
      const w = size.w * scale;
      const h = size.h * scale;
      out.placements.push({ item, region, page, x: cropX, top: y, w, h, scale });
      if (region === 0) out.numbers.push({ item, page, top: y });
      y += h;
      pageHasContent = true;
      if (isLast) {
        out.totals.push({ item, page, top: y + 2 });
        y += opts.totalLineH + opts.itemGap;
      } else {
        y += opts.regionGap;
      }
    });
  });

  if (items.length) {
    if (y + opts.paperTotalH > bottom) newPage();
    out.paperTotal = { page, top: y };
  }
  out.pages = page + 1;
  return out;
}

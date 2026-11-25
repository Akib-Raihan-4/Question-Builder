/**
 * Where the exported PDF's pages will break, for the builder preview. It runs the export's own
 * layout (lib/export/layout.ts) on the same blocks, so the preview's "Page 2" marks land where the
 * PDF's pages do. Only the header's height is estimated (the PDF measures its fonts; this counts
 * characters), so a break can move by a line when the header is long.
 */
import type { PaperHeader } from "@/db/schema";
import { A4, DEFAULT_LAYOUT, LOGO_GAP, LOGO_MAX_H, blockSizes, layoutPaper } from "@/lib/export/layout";
import { itemBlocks, type Bank, type Item } from "./model";

/** The page-1 header's height as build-pdf.ts draws it (school, title, info line, instructions, logo). */
export function headerHeight(header: PaperHeader, hasLogo: boolean): number {
  const contentW = A4.w - 2 * DEFAULT_LAYOUT.margin;
  let h = (header.school ? 11 + 6 : 0) + (16 + 8) + (10 + 10);
  if (header.instructions) {
    // Helvetica 9.5 pt is about 4.9 pt per character on average.
    const perLine = Math.max(20, Math.floor(contentW / 4.9));
    const lines = header.instructions.split(/\r?\n/).reduce((n, para) => n + Math.max(1, Math.ceil(para.length / perLine)), 0);
    h += lines * (9.5 + 3);
  }
  if (hasLogo) h += LOGO_MAX_H + LOGO_GAP;
  return h + 16;
}

export type PageBreaks = {
  pages: number;
  /** "item:block" of the first block on each new page → that page's number (2, 3, …). */
  breaks: Map<string, number>;
  /** The page the "TOTAL FOR PAPER" line falls on. */
  totalPage: number;
};

export function pageBreaks(items: Item[], bank: Bank, header: PaperHeader, hasLogo: boolean): PageBreaks {
  const layout = layoutPaper(
    items.map((it) => blockSizes(itemBlocks(it, bank))),
    headerHeight(header, hasLogo),
  );
  const breaks = new Map<string, number>();
  let page = 0;
  for (const pl of layout.placements) {
    if (pl.page > page) {
      breaks.set(`${pl.item}:${pl.region}`, pl.page + 1);
      page = pl.page;
    }
  }
  return { pages: layout.pages, breaks, totalPage: (layout.paperTotal?.page ?? page) + 1 };
}

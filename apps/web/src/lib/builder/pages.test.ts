import { describe, expect, it } from "vitest";
import { pageBreaks, headerHeight } from "./pages";
import { layoutPaper, blockSizes } from "@/lib/export/layout";
import { itemBlocks, type Bank, type BankQuestion, type Item } from "./model";

/** A question with one box per given height (pt), each 480 pt wide. */
const q = (id: string, heights: number[]): BankQuestion => ({
  id,
  paperId: "p",
  paperLabel: "X",
  number: 1,
  totalMarks: 3,
  regions: heights.map((h, i) => ({ page: i, x0: 59, y0: 60, x1: 539, y1: 60 + h })),
  parts: [],
});

describe("pageBreaks", () => {
  const bank: Bank = { a: q("a", [300]), b: q("b", [500, 600]), c: q("c", [200]) };
  const items: Item[] = [{ questionId: "a", partIds: [] }, { questionId: "b", partIds: [] }, { questionId: "c", partIds: [] }];

  it("breaks exactly where the PDF export's layout starts a new page", () => {
    const header = { title: "Test" };
    const got = pageBreaks(items, bank, header, false);
    const layout = layoutPaper(items.map((it) => blockSizes(itemBlocks(it, bank))), headerHeight(header, false));
    expect(got.pages).toBe(layout.pages);
    const firsts = new Map<number, string>();
    for (const pl of layout.placements) if (pl.page > 0 && !firsts.has(pl.page)) firsts.set(pl.page, `${pl.item}:${pl.region}`);
    expect([...got.breaks.entries()]).toEqual([...firsts.entries()].map(([page, key]) => [key, page + 1]));
    expect(got.pages).toBeGreaterThan(1);
  });

  it("a longer header (instructions, logo) can push content onto later pages, never fewer", () => {
    const short = pageBreaks(items, bank, { title: "T" }, false);
    const long = pageBreaks(items, bank, { title: "T", school: "S", instructions: "Answer all questions.\n".repeat(20) }, true);
    expect(long.pages).toBeGreaterThanOrEqual(short.pages);
  });
});

import { describe, expect, it } from "vitest";
import { A4, DEFAULT_LAYOUT as O, layoutPaper } from "./layout";

const bottom = A4.h - O.margin;
const maxW = A4.w - 2 * O.margin - O.numberColW;

describe("layoutPaper", () => {
  it("keeps crops that fit at their original size and never scales up", () => {
    const l = layoutPaper([[{ w: 300, h: 100 }]], 50);
    expect(l.placements[0]).toMatchObject({ w: 300, h: 100, scale: 1, page: 0, top: O.margin + 50 });
  });

  it("scales a crop down only when wider than the content area", () => {
    const l = layoutPaper([[{ w: 498.5, h: 200 }]], 0);
    expect(l.placements[0].scale).toBeCloseTo(maxW / 498.5);
    expect(l.placements[0].w).toBeCloseTo(maxW);
  });

  it("puts the number at the top of the item's first region and the total after its last", () => {
    const l = layoutPaper([[{ w: 400, h: 100 }, { w: 400, h: 50 }]], 0);
    expect(l.numbers[0].top).toBe(l.placements[0].top);
    expect(l.totals[0].top).toBeCloseTo(l.placements[1].top + 50 + 2);
  });

  it("never splits a region: one that doesn't fit starts a new page", () => {
    const l = layoutPaper([[{ w: 400, h: 500 }], [{ w: 400, h: 400 }]], 0);
    expect(l.placements.map((p) => p.page)).toEqual([0, 1]);
    expect(l.placements[1].top).toBe(O.margin);
    expect(l.numbers[1]).toMatchObject({ page: 1, top: O.margin });
    for (const p of l.placements) expect(p.top + p.h).toBeLessThanOrEqual(bottom);
    expect(l.pages).toBe(2);
  });

  it("keeps a Total line with its region", () => {
    // Region alone fits, but with its total line it would not; too big to shrink → next page.
    const h = bottom - O.margin - 5;
    const l = layoutPaper([[{ w: 100, h: 300 }], [{ w: 400, h }]], 0);
    expect(l.placements[1].page).toBe(1);
  });

  it("shrinks a region that nearly fits instead of leaving a near-empty page", () => {
    const header = 90;
    const h = bottom - O.margin - header; // fills the page below the header, no room for its total
    const l = layoutPaper([[{ w: 400, h }]], header);
    expect(l.placements[0].page).toBe(0);
    expect(l.placements[0].scale).toBeGreaterThanOrEqual(O.minFitScale);
    expect(l.totals[0].top + O.totalLineH - 2).toBeLessThanOrEqual(bottom + 0.001);
  });

  it("keeps a short opening region on the same page as the region after it", () => {
    const l = layoutPaper([[{ w: 400, h: 600 }], [{ w: 400, h: 40 }, { w: 400, h: 300 }]], 0);
    expect(l.placements[1].page).toBe(1);
    expect(l.placements[2].page).toBe(1);
    expect(l.numbers[1].page).toBe(1);
  });

  it("shrinks a region taller than a whole page to fit", () => {
    const l = layoutPaper([[{ w: 400, h: 2000 }]], 0);
    const p = l.placements[0];
    expect(p.top + p.h + O.totalLineH).toBeLessThanOrEqual(bottom + 0.001);
    expect(p.scale).toBeLessThan(1);
  });

  it("places the paper total after the last question", () => {
    const l = layoutPaper([[{ w: 400, h: 100 }]], 0);
    expect(l.paperTotal).toEqual({ page: 0, top: l.totals[0].top - 2 + O.totalLineH + O.itemGap });
    expect(layoutPaper([], 0).paperTotal).toBeNull();
  });
});

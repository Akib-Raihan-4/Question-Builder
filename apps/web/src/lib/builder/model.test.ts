import { describe, expect, it } from "vitest";
import * as m from "./model";

const r = (page: number, y0: number, y1: number) => ({ page, x0: 59, x1: 562, y0, y1 });
// 2020 June Q4: parts (i) 1 mark, (ii) 1 mark. 2021 Jan Q8: whole, 3 marks.
const q4: m.BankQuestion = {
  id: "q4", paperId: "p2020", paperLabel: "4MB1/01 June 2020", number: 4, totalMarks: 2,
  regions: [r(2, 316, 767)],
  parts: [
    { id: "i", label: "i", marks: 1, sortOrder: 0, regions: [r(2, 360, 562)] },
    { id: "ii", label: "ii", marks: 1, sortOrder: 1, regions: [r(2, 565, 767)] },
  ],
};
const q8: m.BankQuestion = {
  id: "q8", paperId: "p2021", paperLabel: "4MB1/01 January 2021", number: 8, totalMarks: 3,
  regions: [r(5, 55, 740)],
  parts: [
    { id: "a", label: "a", marks: 1, sortOrder: 0, regions: [r(5, 100, 300)] },
    { id: "b", label: "b", marks: 2, sortOrder: 1, regions: [r(5, 320, 740)] },
  ],
};
const bank: m.Bank = { q4, q8 };

describe("picking questions", () => {
  it("numbers by pick order and totals marks (Phase 6 check)", () => {
    let items: m.Item[] = [];
    items = m.addPart(items, q4, "i");
    items = m.addQuestion(items, q8);
    expect(items.map((i) => m.serial(items, i.questionId))).toEqual([1, 2]);
    expect(items.map((i) => m.itemMarks(i, bank))).toEqual([1, 3]);
    expect(m.totalMarks(items, bank)).toBe(4);
  });

  it("reorder renumbers", () => {
    const items = m.move([{ questionId: "q4", partIds: ["i"] }, { questionId: "q8", partIds: [] }], 1, 0);
    expect(m.serial(items, "q8")).toBe(1);
    expect(m.serial(items, "q4")).toBe(2);
    expect(m.totalMarks(items, bank)).toBe(4);
  });

  it("adds a second part to the same item, in paper order", () => {
    let items = m.addPart([], q8, "b");
    items = m.addQuestion(items, q4);
    items = m.addPart(items, q8, "a");
    // all parts picked = whole question; it keeps its original position
    expect(items).toEqual([{ questionId: "q8", partIds: [] }, { questionId: "q4", partIds: [] }]);
  });

  it("does not duplicate a question", () => {
    let items = m.addQuestion([], q8);
    items = m.addQuestion(items, q8);
    items = m.addPart(items, q8, "a");
    expect(items).toEqual([{ questionId: "q8", partIds: [] }]);
  });

  it("upgrades a partial pick to the whole question", () => {
    expect(m.addQuestion([{ questionId: "q8", partIds: ["b"] }], q8)).toEqual([{ questionId: "q8", partIds: [] }]);
  });

  it("removes parts and drops the item when none are left", () => {
    let items: m.Item[] = [{ questionId: "q8", partIds: [] }];
    items = m.removePart(items, q8, "a");
    expect(items).toEqual([{ questionId: "q8", partIds: ["b"] }]);
    expect(m.itemMarks(items[0], bank)).toBe(2);
    items = m.removePart(items, q8, "b");
    expect(items).toEqual([]);
  });
});

describe("partial picks", () => {
  it("warns when an earlier part was left out", () => {
    expect(m.dependencyWarnings({ questionId: "q8", partIds: ["b"] }, bank)).toEqual(["Part (b) may depend on (a)"]);
    expect(m.dependencyWarnings({ questionId: "q8", partIds: ["a"] }, bank)).toEqual([]);
  });

  it("shows the question's opening text above the chosen parts", () => {
    const regions = m.itemRegions({ questionId: "q8", partIds: ["b"] }, bank);
    expect(regions).toEqual([r(5, 55, 100), r(5, 320, 740)]);
    expect(m.itemRegions({ questionId: "q8", partIds: [] }, bank)).toEqual(q8.regions);
  });
});

import { describe, expect, it } from "vitest";
import { renumber, rowsForItem } from "./build-ms-pdf";

describe("renumber", () => {
  it("puts the new question number on the row label", () => {
    expect(renumber("4(b)(ii)", 2)).toBe("2(b)(ii)");
    expect(renumber("12", 1)).toBe("1");
  });
  it("drops the '(drawn)' note of a box drawn by hand", () => {
    expect(renumber("3(b) (drawn)", 5)).toBe("5(b)");
    expect(renumber("3(b) (drawn 2)", 5)).toBe("5(b)");
  });
});

describe("rowsForItem", () => {
  const rows = [
    { label: "1", partId: null, regions: [] },
    { label: "1(a)", partId: "a", regions: [] },
    { label: "1(b)", partId: "b", regions: [] },
  ];
  it("keeps whole-question rows with any picked part", () => {
    expect(rowsForItem({ questionId: "q", partIds: ["b"] }, rows).map((r) => r.label)).toEqual(["1", "1(b)"]);
    expect(rowsForItem({ questionId: "q", partIds: [] }, rows)).toHaveLength(3);
  });
});

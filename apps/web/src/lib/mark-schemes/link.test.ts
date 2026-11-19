import { describe, expect, it } from "vitest";
import { coverage, coverageSummary, linkRows, type QuestionRef } from "./link";

const reg = [{ page: 4, x0: 96, y0: 70, x1: 552, y1: 96 }];
const qs: QuestionRef[] = [
  { id: "q1", number: 1, parts: [{ id: "p1a", label: "a(i)" }, { id: "p1b", label: "a(ii)" }, { id: "p1c", label: "b" }] },
  { id: "q2", number: 2, parts: [{ id: "p2a", label: "a" }] },
  { id: "q3", number: 3, parts: [] },
];

describe("linkRows", () => {
  it("links by part label, finer rows to their parent part, and leaves strangers unlinked", () => {
    const rows = linkRows(
      [
        { label: "1(a)(i)", question: 1, part: "a(i)", regions: reg },
        { label: "1(a)(ii)", question: 1, part: "a(ii)", regions: reg },
        { label: "2(a)(i)", question: 2, part: "a(i)", regions: reg }, // paper only has 2(a)
        { label: "2(c)", question: 2, part: "c", regions: reg }, // no such part
        { label: "3(a)", question: 3, part: "a", regions: reg }, // paper didn't split Q3
        { label: "9", question: 9, part: null, regions: reg }, // no such question
      ],
      qs,
    );
    expect(rows.map((r) => [r.label, r.questionId, r.partId])).toEqual([
      ["1(a)(i)", "q1", "p1a"],
      ["1(a)(ii)", "q1", "p1b"],
      ["2(a)(i)", "q2", "p2a"],
      ["2(c)", null, null],
      ["3(a)", "q3", null],
      ["9", null, null],
    ]);
  });
});

describe("coverage", () => {
  it("lists parts without a row and rows without a question", () => {
    const rows = linkRows(
      [
        { label: "1(a)(i)", question: 1, part: "a(i)", regions: reg },
        { label: "2", question: 2, part: null, regions: reg }, // whole-question row covers 2(a)
        { label: "7(b)", question: 7, part: "b", regions: reg },
      ],
      qs,
    );
    const c = coverage(qs, rows);
    expect(c).toEqual({ missing: ["Q1(a)(ii)", "Q1(b)", "Q3"], unlinked: ["7(b)"] });
    expect(coverageSummary(c)).toBe("No mark scheme row for Q1(a)(ii), Q1(b), Q3. 1 row not matched to a question (7(b)).");
    expect(coverageSummary({ missing: [], unlinked: [] })).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { covers, matchSubject, planMoves, SPEC_CODE_RE } from "./match";

const subjects = [
  { id: "mb", specCode: "4MB1" },
  { id: "mb2", specCode: "4MB1/02" },
  { id: "ph3", specCode: "WPH13" },
];

describe("matchSubject", () => {
  it("puts a paper with its own subject when there is one", () => {
    expect(matchSubject("4MB1/02", subjects)?.id).toBe("mb2");
    expect(matchSubject("4MB1/02R", subjects)?.id).toBe("mb2");
    expect(matchSubject("4MB1/01", subjects)?.id).toBe("mb");
    expect(matchSubject("WPH13/01", subjects)?.id).toBe("ph3");
  });
  it("doesn't match look-alike codes", () => {
    expect(covers("4MB1", "4MB12/01")).toBe(false);
    expect(covers("4MB1/1", "4MB1/12")).toBe(false);
    expect(matchSubject("4MA1/1H", subjects)).toBeNull();
  });
  it("accepts spec codes for one paper", () => {
    expect(SPEC_CODE_RE.test("4MB1/02")).toBe(true);
    expect(SPEC_CODE_RE.test("WPH13")).toBe(true);
    expect(SPEC_CODE_RE.test("4MB1/")).toBe(false);
  });
});

describe("planMoves", () => {
  it("moves Paper 2 and 2R to a new Paper 2 subject, and nothing else", () => {
    const papers = [
      { id: "p1", code: "4MB1/01", subjectId: "mb" },
      { id: "p2", code: "4MB1/02", subjectId: "mb" },
      { id: "p2r", code: "4MB1/02R", subjectId: "mb" },
      { id: "x", code: "ODD/9", subjectId: "mb" }, // filed by hand: stays
      { id: "ph", code: "WPH13/01", subjectId: "ph3" },
    ];
    expect(planMoves(subjects, papers)).toEqual([
      { paperId: "p2", to: "mb2" },
      { paperId: "p2r", to: "mb2" },
    ]);
  });
});

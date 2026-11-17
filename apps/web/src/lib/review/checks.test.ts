import { describe, expect, it } from "vitest";
import { publishIssues } from "./checks";
import type { ReviewPart, ReviewQuestion, ReviewRegion } from "./types";

const q = (id: string, totalMarks: number, topicIds = ["t1"]): ReviewQuestion => ({
  id, number: Number(id.slice(1)), totalMarks, confidence: 1, warnings: [], editedByAdmin: false, topicIds,
});
const part = (id: string, questionId: string, marks: number): ReviewPart => ({
  id, questionId, label: id, sortOrder: 0, marks, editedByAdmin: false,
});
const box = (ownerType: "question" | "part", ownerId: string): ReviewRegion => ({
  id: `r-${ownerId}`, ownerType, ownerId, page: 1, x0: 59, y0: 100, x1: 562, y1: 300, sortOrder: 0, editedByAdmin: false,
});

describe("publishIssues", () => {
  it("passes a clean paper", () => {
    const qs = [q("q1", 2), q("q2", 3)];
    const ps = [part("a", "q2", 1), part("b", "q2", 2)];
    const rs = [box("question", "q1"), box("question", "q2"), box("part", "a"), box("part", "b")];
    expect(publishIssues(qs, ps, rs)).toEqual([]);
  });

  it("flags part marks that don't add up", () => {
    const issues = publishIssues([q("q1", 4)], [part("a", "q1", 1), part("b", "q1", 2)], [
      box("question", "q1"), box("part", "a"), box("part", "b"),
    ]);
    expect(issues.map((i) => i.message)).toEqual(["Part marks add up to 3, not 4"]);
  });

  it("flags missing boxes", () => {
    const issues = publishIssues([q("q1", 2)], [part("a", "q1", 2)], []);
    expect(issues.map((i) => i.message)).toEqual(["Part (a) has no box", "No box on the page"]);
  });

  it("does not require topics", () => {
    expect(publishIssues([q("q1", 2, [])], [], [box("question", "q1")])).toEqual([]);
  });

  it("flags an empty paper", () => {
    expect(publishIssues([], [], [])).toHaveLength(1);
  });
});

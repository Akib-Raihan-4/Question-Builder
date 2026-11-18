import { describe, expect, it } from "vitest";
import { searchWords, snippet, splitMatches } from "./highlight";

describe("searchWords", () => {
  it("lower-cases, drops repeats and blanks", () => {
    expect(searchWords("  Probability  probability CONE ")).toEqual(["probability", "cone"]);
  });
});

describe("splitMatches", () => {
  it("marks every match, ignoring case", () => {
    expect(splitMatches("A cone and a Cone.", ["cone"])).toEqual([
      { text: "A ", match: false },
      { text: "cone", match: true },
      { text: " and a ", match: false },
      { text: "Cone", match: true },
      { text: ".", match: false },
    ]);
  });
  it("prefers the longer word when two overlap", () => {
    expect(splitMatches("sequences", ["seq", "sequence"]).filter((p) => p.match).map((p) => p.text)).toEqual(["sequence"]);
  });
  it("treats regex characters literally", () => {
    expect(splitMatches("x (a+b) y", ["(a+b)"]).some((p) => p.match)).toBe(true);
  });
  it("returns the text unchanged with no words", () => {
    expect(splitMatches("abc", [])).toEqual([{ text: "abc", match: false }]);
  });
});

describe("snippet", () => {
  const long = `${"intro ".repeat(40)}the probability that a counter is red ${"outro ".repeat(40)}`;
  it("centres on the first match and marks cuts", () => {
    const s = snippet(long, ["probability"], 80);
    expect(s).toContain("probability");
    expect(s.startsWith("…")).toBe(true);
    expect(s.endsWith("…")).toBe(true);
    expect(s.length).toBeLessThanOrEqual(82);
  });
  it("uses the opening when nothing matches", () => {
    expect(snippet(long, ["zebra"], 40).startsWith("intro")).toBe(true);
  });
  it("keeps short text whole", () => {
    expect(snippet("  Find   x. ", ["x"])).toBe("Find x.");
  });
});

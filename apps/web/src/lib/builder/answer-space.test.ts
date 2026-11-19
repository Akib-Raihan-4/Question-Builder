import { describe, expect, it } from "vitest";
import type { Box } from "@/db/schema";
import { answerSpaceBlocks, blockHeight, describeAnswerSpace, LINE_PITCH, removableGaps, splitRegion } from "./answer-space";

const region = { page: 0, x0: 50, y0: 100, x1: 550, y1: 600 };
// Question text 100–130, six rows of dots 150–300, a diagram 320–420, a mark "(2)" 590–600.
const page = {
  ink: [
    [60, 100, 500, 112],
    [60, 118, 400, 130],
    [100, 320, 400, 420],
    [520, 590, 540, 600],
  ] as Box[],
  dots: [150, 178, 206, 234, 262, 290].map((y) => [60, y, 540, y + 8] as Box),
};

describe("removableGaps", () => {
  const gaps = removableGaps(region, page);

  it("removes the dotted lines and big blank space, keeping a little padding", () => {
    expect(gaps).toEqual([
      [134, 316], // dots (130–320 between text and diagram)
      [424, 586], // 166 pt of blank working space under the diagram
    ]);
  });

  it("keeps small gaps such as paragraph spacing", () => {
    expect(gaps.some(([a, b]) => a < 118 && b > 112)).toBe(false); // 112–118 between the two text lines
  });

  it("ignores things outside the region's width (e.g. margin text)", () => {
    const withMargin = { ...page, ink: [...page.ink, [565, 120, 580, 590] as Box] };
    expect(removableGaps(region, withMargin)).toEqual(gaps);
  });

  it("does nothing without a layout", () => {
    expect(removableGaps(region, undefined)).toEqual([]);
  });

  it("removes a blank or dotted stretch at the very bottom fully", () => {
    const r = { ...region, y1: 310 };
    expect(removableGaps(r, page)).toEqual([[134, 310]]);
  });
});

describe("splitRegion", () => {
  it("cuts the gaps out", () => {
    expect(splitRegion(region, [[134, 316], [424, 586]]).map((r) => [r.y0, r.y1])).toEqual([
      [100, 134],
      [316, 424],
      [586, 600],
    ]);
  });
});

describe("answerSpaceBlocks", () => {
  const gapsFor = () => removableGaps(region, page);

  it("keeps the region whole by default", () => {
    expect(answerSpaceBlocks([region], null, gapsFor)).toEqual([{ kind: "crop", region }]);
  });

  it("adds lines in page-sized chunks, capped at 30", () => {
    const blocks = answerSpaceBlocks([region], { add: { kind: "lines", amount: 40 } }, gapsFor);
    const lines = blocks.filter((b) => b.kind === "lines");
    expect(lines.map((b) => (b.kind === "lines" ? b.count : 0))).toEqual([8, 8, 8, 6]);
    expect(blockHeight(lines[0])).toBe(8 * LINE_PITCH + 14);
  });

  it("removes and adds blank space", () => {
    const blocks = answerSpaceBlocks([region], { remove: true, add: { kind: "space", amount: 3 } }, gapsFor);
    expect(blocks.filter((b) => b.kind === "crop")).toHaveLength(3);
    const space = blocks.filter((b) => b.kind === "space").reduce((s, b) => s + blockHeight(b), 0);
    expect(space).toBeCloseTo((3 * 72) / 2.54);
  });
});

describe("describeAnswerSpace", () => {
  it("says what was chosen", () => {
    expect(describeAnswerSpace(undefined)).toBe("As in the past paper");
    expect(describeAnswerSpace({ remove: true, add: { kind: "lines", amount: 6 } })).toBe("Space removed · +6 lines");
  });
});

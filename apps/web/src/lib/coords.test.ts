import { describe, expect, it } from "vitest";
import { flipY, normalizeRect, pdfLibToPdf, pdfToPdfLib, pdfToScreen, rectSize, screenToPdf, topDownToPdfLibY, rotatedPlacement } from "./coords";

const A4_H = 841.89;
const rect = { x0: 60, y0: 100, x1: 540, y1: 300 };

describe("pdf.js screen conversion", () => {
  it("multiplies by viewport scale", () => {
    expect(pdfToScreen(rect, 1.5)).toEqual({ left: 90, top: 150, width: 720, height: 300 });
  });
  it("is identity at scale 1", () => {
    expect(pdfToScreen(rect, 1)).toEqual({ left: 60, top: 100, width: 480, height: 200 });
  });
  it("round-trips through screenToPdf", () => {
    for (const s of [0.5, 1, 1.333, 2, 3.7]) {
      const back = screenToPdf(pdfToScreen(rect, s), s);
      expect(back.x0).toBeCloseTo(rect.x0);
      expect(back.y0).toBeCloseTo(rect.y0);
      expect(back.x1).toBeCloseTo(rect.x1);
      expect(back.y1).toBeCloseTo(rect.y1);
    }
  });
  it("rejects a non-positive scale", () => {
    expect(() => screenToPdf({ left: 0, top: 0, width: 1, height: 1 }, 0)).toThrow();
  });
});

describe("pdf-lib (bottom-left) conversion", () => {
  it("flips y against page height", () => {
    expect(flipY(0, A4_H)).toBeCloseTo(A4_H);
    expect(flipY(A4_H, A4_H)).toBeCloseTo(0);
    expect(flipY(flipY(123.4, A4_H), A4_H)).toBeCloseTo(123.4);
  });
  it("maps a top-left rect to an embedPage box", () => {
    const b = pdfToPdfLib(rect, A4_H);
    expect(b.left).toBe(60);
    expect(b.right).toBe(540);
    expect(b.top).toBeCloseTo(A4_H - 100);
    expect(b.bottom).toBeCloseTo(A4_H - 300);
    expect(b.top).toBeGreaterThan(b.bottom);
  });
  it("round-trips", () => {
    const back = pdfLibToPdf(pdfToPdfLib(rect, A4_H), A4_H);
    expect(back.x0).toBeCloseTo(rect.x0);
    expect(back.y0).toBeCloseTo(rect.y0);
    expect(back.x1).toBeCloseTo(rect.x1);
    expect(back.y1).toBeCloseTo(rect.y1);
  });
  it("preserves size", () => {
    const b = pdfToPdfLib(rect, A4_H);
    expect(b.right - b.left).toBeCloseTo(rectSize(rect).width);
    expect(b.top - b.bottom).toBeCloseTo(rectSize(rect).height);
  });
});

describe("pdf-lib with an offset CropBox", () => {
  it("shifts the box by the CropBox origin", () => {
    const b = pdfToPdfLib(rect, 800, { x: 10, y: 20 });
    expect(b).toEqual({ left: 70, right: 550, bottom: 20 + 800 - 300, top: 20 + 800 - 100 });
  });
});

describe("top-down layout → pdf-lib", () => {
  it("places a box's bottom edge from its top and height", () => {
    expect(topDownToPdfLibY(56.69, 100, A4_H)).toBeCloseTo(A4_H - 156.69);
    expect(topDownToPdfLibY(0, A4_H, A4_H)).toBe(0);
  });
});

describe("normalizeRect", () => {
  it("orders inverted corners (e.g. a box dragged up-left)", () => {
    expect(normalizeRect({ x0: 540, y0: 300, x1: 60, y1: 100 })).toEqual(rect);
  });
});

describe("rotatedPlacement (pages stored rotated, boxes as displayed)", () => {
  const portrait = { x: 0, y: 0, width: 595, height: 842 }; // unrotated page; shown landscape when /Rotate 90
  it("leaves unrotated pages alone", () => {
    const p = rotatedPlacement({ x0: 10, y0: 20, x1: 110, y1: 70 }, 0, portrait);
    expect(p.box).toEqual({ left: 10, right: 110, bottom: 772, top: 822 });
    expect(p.draw(5, 6, 100, 50)).toEqual({ x: 5, y: 6, width: 100, height: 50, rotate: 0 });
  });
  it("maps a displayed box on a 90° page back to the page's own space and draws it turned", () => {
    // Displayed (842 wide): x 78–124, y 102–116 is unrotated x 102–116, y 718–764 (top-left).
    const p = rotatedPlacement({ x0: 78, y0: 102, x1: 124, y1: 116 }, 90, portrait);
    expect(p.box).toEqual({ left: 102, right: 116, bottom: 78, top: 124 });
    const d = p.draw(0, 0, 46, 14);
    expect([d.x, d.y, d.width, d.height]).toEqual([0, 14, 14, 46]);
    expect(d.rotate).toBe(-90);
  });
});

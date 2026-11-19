import { describe, expect, it } from "vitest";
import UPNG from "@pdf-lib/upng";
import { fadePngToWhite } from "./fade-png";

const pixels = (png: Uint8Array) => new Uint8Array(UPNG.toRGBA8(UPNG.decode(png.buffer as ArrayBuffer))[0]);

describe("fadePngToWhite", () => {
  // 2×1: an opaque blue pixel and a fully transparent one.
  const src = new Uint8Array(UPNG.encode([new Uint8Array([0, 0, 255, 255, 0, 0, 0, 0]).buffer], 2, 1, 0));

  it("fades colour towards white and makes everything opaque", () => {
    const p = pixels(fadePngToWhite(src, 0.1));
    expect(Array.from(p.slice(0, 4))).toEqual([230, 230, 255, 255]); // 255 - 0.1 × 255 ≈ 230
    expect(Array.from(p.slice(4, 8))).toEqual([255, 255, 255, 255]); // transparent → white
  });
});

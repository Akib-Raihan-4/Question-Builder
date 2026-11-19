import { describe, expect, it } from "vitest";
import { imageInfo } from "./image-info";

// 1×1 transparent PNG and a tiny 3×2 JPEG.
const PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
const JPEG = Uint8Array.from(
  [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x02, 0x00, 0x03, 0x01, 0x01, 0x11, 0x00, 0xff, 0xd9],
);

describe("imageInfo", () => {
  it("reads a PNG's size", () => expect(imageInfo(PNG)).toEqual({ type: "image/png", width: 1, height: 1 }));
  it("reads a JPEG's size", () => expect(imageInfo(JPEG)).toEqual({ type: "image/jpeg", width: 3, height: 2 }));
  it("rejects anything else, whatever it's called", () => {
    expect(imageInfo(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    expect(imageInfo(new TextEncoder().encode("%PDF-1.7 ..."))).toBeNull();
  });
});

import UPNG from "@pdf-lib/upng";

/**
 * A see-through PNG faded towards white and made fully opaque. Drawn with "multiply" it gives a
 * faint watermark in every PDF viewer — some ignore opacity on images that have their own
 * transparency, so the fading is done here instead of with the PDF's opacity setting.
 */
export function fadePngToWhite(png: Uint8Array, opacity: number): Uint8Array {
  const img = UPNG.decode(png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer);
  const rgba = new Uint8Array(UPNG.toRGBA8(img)[0]);
  for (let i = 0; i < rgba.length; i += 4) {
    const a = (rgba[i + 3] / 255) * opacity;
    for (let c = 0; c < 3; c++) rgba[i + c] = Math.round(255 - a * (255 - rgba[i + c]));
    rgba[i + 3] = 255;
  }
  return new Uint8Array(UPNG.encode([rgba.buffer], img.width, img.height, 0));
}

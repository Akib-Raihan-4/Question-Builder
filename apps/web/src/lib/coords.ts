/**
 * The ONLY place that converts coordinates.
 *
 * Stored form ("PdfRect"): PDF points, TOP-LEFT origin, as returned by PyMuPDF.
 *   x grows right, y grows DOWN. 0-based page index.
 *
 * - pdf.js screen pixels: multiply by the viewport scale (pdf.js viewports are top-left too).
 * - pdf-lib: BOTTOM-LEFT origin, so y_pdflib = pageHeight - y.
 */

export type PdfRect = { x0: number; y0: number; x1: number; y1: number };
export type ScreenRect = { left: number; top: number; width: number; height: number };
export type PdfLibBox = { left: number; right: number; bottom: number; top: number };

export function normalizeRect(r: PdfRect): PdfRect {
  return {
    x0: Math.min(r.x0, r.x1),
    y0: Math.min(r.y0, r.y1),
    x1: Math.max(r.x0, r.x1),
    y1: Math.max(r.y0, r.y1),
  };
}

/** PDF points (top-left) → pdf.js canvas/CSS pixels at `scale`. */
export function pdfToScreen(r: PdfRect, scale: number): ScreenRect {
  const n = normalizeRect(r);
  return {
    left: n.x0 * scale,
    top: n.y0 * scale,
    width: (n.x1 - n.x0) * scale,
    height: (n.y1 - n.y0) * scale,
  };
}

/** pdf.js canvas/CSS pixels at `scale` → PDF points (top-left). Used when an admin drags a box. */
export function screenToPdf(s: ScreenRect, scale: number): PdfRect {
  if (scale <= 0) throw new Error("scale must be > 0");
  return normalizeRect({
    x0: s.left / scale,
    y0: s.top / scale,
    x1: (s.left + s.width) / scale,
    y1: (s.top + s.height) / scale,
  });
}

/** A single y value, top-left → bottom-left (pdf-lib). The conversion is its own inverse. */
export function flipY(y: number, pageHeight: number): number {
  return pageHeight - y;
}

/**
 * PDF points (top-left) → pdf-lib embedPage bounding box (bottom-left).
 * `pageHeight` and `origin` are the source page's CropBox (PyMuPDF measures from the CropBox's
 * top-left; pdf-lib works in default user space, so a CropBox that doesn't start at 0,0 shifts it).
 */
export function pdfToPdfLib(r: PdfRect, pageHeight: number, origin: { x: number; y: number } = { x: 0, y: 0 }): PdfLibBox {
  const n = normalizeRect(r);
  return {
    left: origin.x + n.x0,
    right: origin.x + n.x1,
    bottom: origin.y + flipY(n.y1, pageHeight),
    top: origin.y + flipY(n.y0, pageHeight),
  };
}

/**
 * Our own output pages are laid out top-down (like the stored regions). pdf-lib draws from the
 * bottom-left corner of a box, so a box whose top edge is `top` and that is `height` tall sits
 * at y = pageHeight - top - height.
 */
export function topDownToPdfLibY(top: number, height: number, pageHeight: number): number {
  return pageHeight - top - height;
}

/** pdf-lib box (bottom-left) → PDF points (top-left). */
export function pdfLibToPdf(b: PdfLibBox, pageHeight: number): PdfRect {
  return normalizeRect({
    x0: b.left,
    x1: b.right,
    y0: flipY(b.top, pageHeight),
    y1: flipY(b.bottom, pageHeight),
  });
}

export function rectSize(r: PdfRect): { width: number; height: number } {
  const n = normalizeRect(r);
  return { width: n.x1 - n.x0, height: n.y1 - n.y0 };
}

/**
 * Stored boxes are in the page AS DISPLAYED (that's how the app renders them). Some mark schemes
 * keep landscape pages rotated (/Rotate 90), so for those the box is turned back into the page's
 * own (unrotated) space for embedding, and the embedded piece is drawn turned the same way.
 * Returns the embed box (pdf-lib, bottom-left origin) and how to draw it into a target rectangle.
 */
export function rotatedPlacement(
  g: { x0: number; y0: number; x1: number; y1: number },
  angle: number,
  page: { x: number; y: number; width: number; height: number },
) {
  const a = ((angle % 360) + 360) % 360;
  const { x: ox, y: oy, width: w0, height: h0 } = page;
  // Unrotated top-left box, then pdf-lib's bottom-left box.
  const tl =
    a === 90
      ? { x0: g.y0, x1: g.y1, y0: h0 - g.x1, y1: h0 - g.x0 }
      : a === 180
        ? { x0: w0 - g.x1, x1: w0 - g.x0, y0: h0 - g.y1, y1: h0 - g.y0 }
        : a === 270
          ? { x0: w0 - g.y1, x1: w0 - g.y0, y0: g.x0, y1: g.x1 }
          : { x0: g.x0, x1: g.x1, y0: g.y0, y1: g.y1 };
  const box = { left: ox + tl.x0, right: ox + tl.x1, bottom: oy + h0 - tl.y1, top: oy + h0 - tl.y0 };
  /** Draw params for a target rectangle (pdf-lib coords: left, bottom, width, height) in display orientation; rotate in degrees. */
  const draw = (L: number, B: number, DW: number, DH: number) =>
    a === 90
      ? { x: L, y: B + DH, width: DH, height: DW, rotate: -90 }
      : a === 180
        ? { x: L + DW, y: B + DH, width: DW, height: DH, rotate: 180 }
        : a === 270
          ? { x: L + DW, y: B, width: DH, height: DW, rotate: 90 }
          : { x: L, y: B, width: DW, height: DH, rotate: 0 };
  return { box, draw };
}

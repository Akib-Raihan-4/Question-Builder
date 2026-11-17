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

/** PDF points (top-left) → pdf-lib embedPage bounding box (bottom-left). */
export function pdfToPdfLib(r: PdfRect, pageHeight: number): PdfLibBox {
  const n = normalizeRect(r);
  return {
    left: n.x0,
    right: n.x1,
    bottom: flipY(n.y1, pageHeight),
    top: flipY(n.y0, pageHeight),
  };
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

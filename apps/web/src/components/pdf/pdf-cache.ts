"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";
import { loadPdfjs } from "./use-pdf";

/** One loaded PDF per source paper, shared by the browse pane and the preview. */
const docs = new Map<string, Promise<PDFDocumentProxy>>();
/** Each needed page rendered once and kept as an ImageBitmap, keyed "paperId:page". */
const pages = new Map<string, Promise<ImageBitmap>>();

export const PREVIEW_RENDER_SCALE = 2; // px per PDF point: sharp enough to crop and scale down

export function getPdfDoc(paperId: string): Promise<PDFDocumentProxy> {
  let p = docs.get(paperId);
  if (!p) {
    p = loadPdfjs().then((pdfjs) => pdfjs.getDocument({ url: `/api/papers/${paperId}/file`, withCredentials: true }).promise);
    p.catch(() => docs.delete(paperId));
    docs.set(paperId, p);
  }
  return p;
}

export function getPageImage(paperId: string, page: number): Promise<ImageBitmap> {
  const key = `${paperId}:${page}`;
  let p = pages.get(key);
  if (!p) {
    p = (async () => {
      const doc = await getPdfDoc(paperId);
      const pg = await doc.getPage(page + 1);
      const viewport = pg.getViewport({ scale: PREVIEW_RENDER_SCALE });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await pg.render({ canvas, viewport }).promise;
      return createImageBitmap(canvas);
    })();
    p.catch(() => pages.delete(key));
    pages.set(key, p);
  }
  return p;
}

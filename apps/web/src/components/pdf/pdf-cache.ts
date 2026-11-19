"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";
import { loadPdfjs } from "./use-pdf";

/** One loaded PDF per source paper, shared by the browse pane, search results and the preview. */
const docs = new Map<string, Promise<PDFDocumentProxy>>();
/** Download progress per paper (fraction 0–1, or null when the size is unknown). */
const progress = new Map<string, Set<(fraction: number | null) => void>>();
const lastProgress = new Map<string, number | null>();

export function onPdfProgress(paperId: string, cb: (fraction: number | null) => void) {
  let set = progress.get(paperId);
  if (!set) progress.set(paperId, (set = new Set()));
  set.add(cb);
  if (lastProgress.has(paperId)) cb(lastProgress.get(paperId)!);
  return () => set!.delete(cb);
}

/** Each needed page rendered once and kept as an ImageBitmap, keyed "paperId:page". */
const pages = new Map<string, Promise<ImageBitmap>>();

export const PREVIEW_RENDER_SCALE = 2; // px per PDF point: sharp enough to crop and scale down

/**
 * A tiny queue so only a few PDFs download and a few pages render at the same time. Whatever is
 * asked for first (the pictures on screen) finishes first, instead of everything crawling along
 * together.
 */
function limiter(max: number) {
  let running = 0;
  const waiting: (() => void)[] = [];
  return async function run<T>(job: () => Promise<T>): Promise<T> {
    if (running >= max) await new Promise<void>((r) => waiting.push(r));
    running++;
    try {
      return await job();
    } finally {
      running--;
      waiting.shift()?.();
    }
  };
}
const downloads = limiter(3);
const renders = limiter(2);

/**
 * A source document: a paper's question paper (its id) or its mark scheme ("ms:<paperId>").
 * Everything below is keyed by this string.
 */
const fileUrl = (key: string) => (key.startsWith("ms:") ? `/api/papers/${key.slice(3)}/mark-scheme` : `/api/papers/${key}/file`);
export const msDocKey = (paperId: string) => `ms:${paperId}`;

export function getPdfDoc(paperId: string): Promise<PDFDocumentProxy> {
  let p = docs.get(paperId);
  if (!p) {
    p = downloads(async () => {
      const { pdfjs, worker } = await loadPdfjs();
      const task = pdfjs.getDocument({ url: fileUrl(paperId), withCredentials: true, worker });
      task.onProgress = ({ loaded, total }: { loaded: number; total: number }) => {
        const f = total ? Math.min(1, loaded / total) : null;
        lastProgress.set(paperId, f);
        progress.get(paperId)?.forEach((cb) => cb(f));
      };
      return task.promise;
    });
    p.catch(() => docs.delete(paperId)).finally(() => lastProgress.delete(paperId));
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
      return renders(async () => {
        const pg = await doc.getPage(page + 1);
        const viewport = pg.getViewport({ scale: PREVIEW_RENDER_SCALE });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await pg.render({ canvas, viewport }).promise;
        return createImageBitmap(canvas);
      });
    })();
    p.catch(() => pages.delete(key));
    pages.set(key, p);
  }
  return p;
}

/** Positioned words on a page, in PDF points from the top-left (the same space as regions). */
export type PageWord = { str: string; x0: number; y0: number; x1: number; y1: number };
const texts = new Map<string, Promise<PageWord[]>>();

export function getPageText(paperId: string, page: number): Promise<PageWord[]> {
  const key = `${paperId}:${page}`;
  let p = texts.get(key);
  if (!p) {
    p = (async () => {
      const doc = await getPdfDoc(paperId);
      const pg = await doc.getPage(page + 1);
      const viewport = pg.getViewport({ scale: 1 });
      const content = await pg.getTextContent();
      const out: PageWord[] = [];
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        const [, , , , e, f] = item.transform as number[];
        const h = item.height || Math.hypot(item.transform[2], item.transform[3]);
        // Baseline-up box in PDF space → top-left points via the page's own viewport.
        const [ax, ay] = viewport.convertToViewportPoint(e, f - h * 0.2) as number[];
        const [bx, by] = viewport.convertToViewportPoint(e + item.width, f + h * 0.85) as number[];
        out.push({ str: item.str, x0: Math.min(ax, bx), y0: Math.min(ay, by), x1: Math.max(ax, bx), y1: Math.max(ay, by) });
      }
      return out;
    })();
    p.catch(() => texts.delete(key));
    texts.set(key, p);
  }
  return p;
}

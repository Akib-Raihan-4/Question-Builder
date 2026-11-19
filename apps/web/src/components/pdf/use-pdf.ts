"use client";


type Pdfjs = typeof import("pdfjs-dist");
let pdfjsPromise: Promise<{ pdfjs: Pdfjs; worker: InstanceType<Pdfjs["PDFWorker"]> }> | null = null;

/**
 * pdf.js is loaded only in the browser, once, with ONE background worker shared by every PDF.
 * (By default pdf.js starts a new worker per document; with 20 search results from 20 papers
 * that meant 20 workers starting at once and every picture waiting on all of them.)
 */
export function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
      return { pdfjs, worker: new pdfjs.PDFWorker() };
    });
  }
  return pdfjsPromise;
}

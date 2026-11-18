"use client";

import { useEffect, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

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

/** Load a PDF from an authenticated same-origin URL (cookies are sent). */
export function usePdf(url: string) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    let task: { destroy: () => Promise<void> } | null = null;
    loadPdfjs()
      .then(({ pdfjs, worker }) => {
        const t = pdfjs.getDocument({ url, withCredentials: true, worker });
        task = t;
        return t.promise;
      })
      .then((d) => !cancelled && setDoc(d))
      .catch((e) => !cancelled && setError(String(e?.message ?? e)));
    return () => {
      cancelled = true;
      (task as { destroy: () => Promise<void> } | null)?.destroy();
    };
  }, [url]);
  return { doc, error };
}

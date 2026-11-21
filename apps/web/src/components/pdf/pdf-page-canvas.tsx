"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

/** One PDF page drawn at `scale` CSS px per PDF point. Renders lazily when scrolled near. */
export function PdfPageCanvas({
  doc,
  pageIndex,
  scale,
  width,
  height,
}: {
  doc: PDFDocumentProxy;
  pageIndex: number; // 0-based, like stored regions
  scale: number;
  width: number; // CSS px
  height: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const holderRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    const el = holderRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), { rootMargin: "800px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let task: { cancel: () => void } | null = null;
    setDrawn(false);
    (async () => {
      const page = await doc.getPage(pageIndex + 1);
      if (cancelled || !canvasRef.current) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale: scale * dpr });
      const canvas = canvasRef.current;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const t = page.render({ canvas, viewport });
      task = t;
      await t.promise.then(() => !cancelled && setDrawn(true)).catch(() => {});
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, pageIndex, scale, visible]);

  return (
    <div ref={holderRef} className="absolute inset-0 bg-white">
      <canvas ref={canvasRef} style={{ width, height }} className={drawn ? "block animate-fade-in" : "block opacity-0"} />
      {!drawn && (
        // Grey lines stand in for the page's text while it's drawn.
        <div className="pointer-events-none absolute inset-0 space-y-3 p-[8%]" aria-hidden>
          {[88, 72, 94, 60, 80, 70, 90, 55].map((w, i) => (
            <div key={i} className="h-2.5 animate-pulse rounded bg-zinc-200/80" style={{ width: `${w}%` }} />
          ))}
        </div>
      )}
    </div>
  );
}

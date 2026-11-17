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
      await t.promise.catch(() => {});
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, pageIndex, scale, visible]);

  return (
    <div ref={holderRef} className="absolute inset-0 bg-white">
      <canvas ref={canvasRef} style={{ width, height }} className="block" />
    </div>
  );
}

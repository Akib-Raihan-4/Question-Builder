"use client";

import { useEffect, useRef, useState } from "react";
import { pdfToScreen, type PdfRect } from "@/lib/coords";
import { getPageImage, PREVIEW_RENDER_SCALE } from "./pdf-cache";

/** One stored region drawn from the cached page image at `scale` CSS px per PDF point. */
export function CropCanvas({ paperId, page, rect, scale }: { paperId: string; page: number; rect: PdfRect; scale: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const css = pdfToScreen(rect, scale);
  const src = pdfToScreen(rect, PREVIEW_RENDER_SCALE);

  useEffect(() => {
    let cancelled = false;
    getPageImage(paperId, page)
      .then((img) => {
        const c = ref.current;
        if (cancelled || !c) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        c.width = Math.round(css.width * dpr);
        c.height = Math.round(css.height * dpr);
        const ctx = c.getContext("2d")!;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, src.left, src.top, src.width, src.height, 0, 0, c.width, c.height);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [paperId, page, css.width, css.height, src.left, src.top, src.width, src.height]);

  if (failed) return <div className="text-xs text-destructive" style={{ width: css.width }}>Could not load this part of the paper.</div>;
  return <canvas ref={ref} className="block bg-white" style={{ width: css.width, height: css.height }} />;
}

"use client";

import { useEffect, useRef, useState } from "react";
import { pdfToScreen, type PdfRect } from "@/lib/coords";
import { getPageImage, getPageText, onPdfProgress, PREVIEW_RENDER_SCALE, type PageWord } from "./pdf-cache";

type State = { stage: "waiting" | "downloading" | "drawing" | "done" | "failed"; fraction?: number | null };

/**
 * One stored region drawn from the cached page image at `scale` CSS px per PDF point.
 * It starts loading only when it's near the screen, shows real progress while its paper
 * downloads, and can highlight search words on the picture.
 */
export function CropCanvas({
  paperId,
  page,
  rect,
  scale,
  highlight,
}: {
  paperId: string;
  page: number;
  rect: PdfRect;
  scale: number;
  /** Lower-case words to mark on the picture. */
  highlight?: string[];
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(false);
  const [state, setState] = useState<State>({ stage: "waiting" });
  const [attempt, setAttempt] = useState(0);
  const [marks, setMarks] = useState<{ left: number; top: number; width: number; height: number }[]>([]);
  const css = pdfToScreen(rect, scale);
  const src = pdfToScreen(rect, PREVIEW_RENDER_SCALE);

  // Wait until it's within a screen or so of being visible.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || near) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setNear(true), { rootMargin: "600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [near]);

  useEffect(() => {
    if (!near) return;
    let cancelled = false;
    setState({ stage: "downloading", fraction: null });
    const stop = onPdfProgress(paperId, (fraction) => !cancelled && setState((s) => (s.stage === "downloading" ? { stage: "downloading", fraction } : s)));
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
        setState({ stage: "done" });
      })
      .catch(() => !cancelled && setState({ stage: "failed" }));
    return () => {
      cancelled = true;
      stop();
    };
  }, [near, attempt, paperId, page, css.width, css.height, src.left, src.top, src.width, src.height]);

  // Boxes over the search words inside this region.
  const words = (highlight ?? []).join(" ");
  useEffect(() => {
    if (!near || !words) return setMarks([]);
    let cancelled = false;
    const list = words.split(" ");
    getPageText(paperId, page)
      .then((items) => !cancelled && setMarks(findMarks(items, list, rect, scale)))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rect compared by value
  }, [near, words, paperId, page, rect.x0, rect.y0, rect.x1, rect.y1, scale]);

  const done = state.stage === "done";
  return (
    <div ref={wrapRef} className="relative" style={{ width: css.width, height: css.height }}>
      <canvas ref={ref} className="block bg-white" style={{ width: css.width, height: css.height }} />
      {done &&
        marks.map((m, i) => (
          <span key={i} aria-hidden className="pointer-events-none absolute rounded-[2px] bg-yellow-300/60 mix-blend-multiply ring-1 ring-yellow-500/60" style={m} />
        ))}
      {!done && (
        <div className="absolute inset-0 overflow-hidden bg-white" role="status" aria-live="polite">
          {state.stage === "failed" ? (
            <div className="flex h-full min-h-10 items-center gap-2 px-2 text-xs text-destructive">
              Couldn&apos;t load this part of the paper.
              <button type="button" className="rounded border border-current px-1.5 py-0.5 hover:bg-red-50" onClick={() => setAttempt((a) => a + 1)}>
                Retry
              </button>
            </div>
          ) : (
            <>
              {/* Grey lines standing in for the question's text. */}
              <div className="space-y-2 p-2">
                {Array.from({ length: Math.max(1, Math.min(8, Math.floor((css.height - 16) / 18))) }, (_, i) => (
                  <div key={i} className="h-2.5 animate-pulse rounded bg-zinc-200/80" style={{ width: `${[92, 78, 85, 64, 88, 72, 80, 58][i]}%` }} />
                ))}
              </div>
              {css.height >= 40 && (
                <div className="absolute bottom-1 right-2 rounded bg-white/90 px-1.5 text-[11px] tabular-nums text-muted-foreground">
                  {state.stage === "waiting"
                    ? "Waiting…"
                    : state.stage === "downloading"
                      ? `Loading paper${state.fraction != null ? ` ${Math.round(state.fraction * 100)}%` : "…"}`
                      : "Drawing…"}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Where the search words sit inside `rect`, in CSS px relative to the crop. */
function findMarks(items: PageWord[], words: string[], rect: PdfRect, scale: number) {
  const out: { left: number; top: number; width: number; height: number }[] = [];
  for (const it of items) {
    // Only text whose middle lies inside this region.
    const cy = (it.y0 + it.y1) / 2;
    if (cy < rect.y0 || cy > rect.y1 || it.x1 < rect.x0 || it.x0 > rect.x1) continue;
    const lower = it.str.toLowerCase();
    const perChar = (it.x1 - it.x0) / Math.max(1, it.str.length);
    for (const w of words) {
      for (let at = lower.indexOf(w); at >= 0; at = lower.indexOf(w, at + w.length)) {
        const x0 = Math.max(rect.x0, it.x0 + at * perChar);
        const x1 = Math.min(rect.x1, it.x0 + (at + w.length) * perChar);
        if (x1 <= x0) continue;
        out.push({
          left: (x0 - rect.x0) * scale - 1,
          top: (Math.max(rect.y0, it.y0) - rect.y0) * scale - 1,
          width: (x1 - x0) * scale + 2,
          height: (Math.min(rect.y1, it.y1) - Math.max(rect.y0, it.y0)) * scale + 2,
        });
      }
    }
  }
  return out;
}

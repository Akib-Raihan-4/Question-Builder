"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A one-line row that scrolls sideways: arrow buttons appear when there's more to either side,
 * the mouse wheel scrolls it, and a thin scrollbar sits BELOW the row (in its own space) so it
 * never covers the buttons.
 */
export function HScroll({ children, className, label }: { children: React.ReactNode; className?: string; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdges({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    for (const c of Array.from(el.children)) ro.observe(c);
    // Plain mouse wheels only scroll up/down; turn that into sideways scrolling here.
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      ro.disconnect();
      el.removeEventListener("wheel", onWheel);
    };
  }, [update, children]);

  const nudge = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.7, behavior: "smooth" });
  const arrow = "absolute top-0 z-10 flex h-full items-center bg-gradient-to-r px-1 text-muted-foreground hover:text-foreground";

  return (
    <div className={cn("relative min-w-0", className)}>
      {edges.left && (
        <button type="button" aria-label={`Scroll ${label} left`} onClick={() => nudge(-1)} className={cn(arrow, "left-0 from-background via-background/90 to-transparent pr-4")}>
          <ChevronLeft className="size-4" aria-hidden />
        </button>
      )}
      <div ref={ref} onScroll={update} className="nice-scroll flex items-center gap-1 overflow-x-auto pb-1.5">
        {children}
      </div>
      {edges.right && (
        <button type="button" aria-label={`Scroll ${label} right`} onClick={() => nudge(1)} className={cn(arrow, "right-0 bg-gradient-to-l from-background via-background/90 to-transparent pl-4")}>
          <ChevronRight className="size-4" aria-hidden />
        </button>
      )}
    </div>
  );
}

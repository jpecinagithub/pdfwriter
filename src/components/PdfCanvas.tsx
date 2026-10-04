/**
 * PdfCanvas — the scrollable document view.
 *
 * - Resolves the ZoomValue to a concrete scale (fit modes measured against
 *   the container).
 * - Renders one PdfPageView per page; rasterization is virtualized inside
 *   each page view (IntersectionObserver), so large documents stay smooth.
 * - Tracks the current page from scroll position; scrolls on navigation.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEditor } from "../editor/store";
import { displaySize } from "../types/pdf";
import { PdfCanvasContext } from "./canvasContext";
import { PdfPageView } from "./PdfPageView";

const PAGE_GAP = 24;
const PAGE_PAD = 32;

export const PdfCanvas = memo(function PdfCanvas(): React.ReactElement {
  const pages = useEditor((s) => s.pages);
  const zoom = useEditor((s) => s.zoom);
  const currentPageIndex = useEditor((s) => s.currentPageIndex);

  const scrollRef = useRef<HTMLDivElement>(null);
  const pageEls = useRef(new Map<number, HTMLDivElement>());
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const navScrolling = useRef(false);

  // Measure the scroll container for fit modes.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Resolve zoom -> scale using the current page's display size.
  const scale = useMemo(() => {
    const page = pages[currentPageIndex] ?? pages[0];
    if (!page || containerSize.w === 0) return 1;
    const { width, height } = displaySize(page);
    if (zoom.mode === "scale") return zoom.scale;
    if (zoom.mode === "fit-width") return Math.max(0.2, (containerSize.w - PAGE_PAD * 2) / width);
    const s = Math.min(
      (containerSize.w - PAGE_PAD * 2) / width,
      (containerSize.h - PAGE_PAD * 2) / height,
    );
    return Math.max(0.2, s);
  }, [zoom, pages, currentPageIndex, containerSize]);

  const scrollToPage = useCallback((index: number) => {
    const el = pageEls.current.get(index);
    if (!el) return;
    navScrolling.current = true;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => {
      navScrolling.current = false;
    }, 600);
  }, []);

  // Navigate (top bar / thumbnails) -> scroll the page into view.
  const prevNavIndex = useRef(currentPageIndex);
  useEffect(() => {
    if (prevNavIndex.current !== currentPageIndex) {
      prevNavIndex.current = currentPageIndex;
      const el = pageEls.current.get(currentPageIndex);
      if (el && scrollRef.current) {
        const c = scrollRef.current.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        const visible = r.top >= c.top - 40 && r.bottom <= c.bottom + 40;
        if (!visible) scrollToPage(currentPageIndex);
      }
    }
  }, [currentPageIndex, scrollToPage]);

  // Track current page from scroll (most-visible page wins).
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || pages.length === 0) return;
    const ratios = new Map<number, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          const idx = Number((en.target as HTMLElement).dataset.pageIndex);
          if (en.isIntersecting) ratios.set(idx, en.intersectionRatio);
          else ratios.delete(idx);
        }
        if (navScrolling.current) return;
        let best = -1;
        let bestRatio = 0;
        for (const [idx, ratio] of ratios) {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            best = idx;
          }
        }
        if (best >= 0) {
          const cur = useEditor.getState().currentPageIndex;
          if (cur !== best) useEditor.getState().setCurrentPageIndex(best);
        }
      },
      { root, threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    pageEls.current.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [pages.length]);

  const registerPageEl = useCallback(
    (index: number) => (el: HTMLDivElement | null) => {
      if (el) pageEls.current.set(index, el);
      else pageEls.current.delete(index);
    },
    [],
  );

  const ctx = useMemo(
    () => ({ scale, scrollEl: scrollRef.current, scrollToPage }),
    [scale, scrollToPage],
  );

  return (
    <PdfCanvasContext.Provider value={ctx}>
      <div
        ref={scrollRef}
        className="pw-scroll relative flex-1 overflow-auto bg-zinc-200/70"
        role="region"
        aria-label="PDF pages"
      >
        <div className="flex min-h-full flex-col items-center py-8" style={{ gap: PAGE_GAP }}>
          {pages.map((page, i) => (
            <div
              key={page.id}
              ref={registerPageEl(i)}
              data-page-index={i}
              style={{ scrollMarginTop: 16 }}
            >
              <PdfPageView page={page} index={i} />
            </div>
          ))}
          {pages.length === 0 && (
            <div className="mt-24 text-sm text-zinc-500">No pages in this document.</div>
          )}
        </div>
      </div>
    </PdfCanvasContext.Provider>
  );
});

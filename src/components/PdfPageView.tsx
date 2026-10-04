/**
 * PdfPageView — one page: pdf.js raster + editing overlay.
 *
 * Rasterization is virtualized: the canvas only renders when the page is near
 * the viewport (IntersectionObserver with a generous rootMargin). The wrapper
 * div always keeps its exact size so scroll position never jumps.
 */
import { memo, useEffect, useRef, useState } from "react";
import type { PageMeta } from "../types/pdf";
import { displaySize, totalRotation } from "../types/pdf";
import { session } from "../editor/session";
import { renderPageToCanvas } from "../pdf/pdfLoader";
import { usePdfCanvas } from "./canvasContext";
import { EditingLayer } from "./EditingLayer";

export const PdfPageView = memo(function PdfPageView({
  page,
  index,
}: {
  page: PageMeta;
  index: number;
}): React.ReactElement {
  const { scale, scrollEl } = usePdfCanvas();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nearViewport, setNearViewport] = useState(false);
  const [renderError, setRenderError] = useState(false);

  const { width: dispW, height: dispH } = displaySize(page);
  const cssW = Math.max(1, Math.round(dispW * scale));
  const cssH = Math.max(1, Math.round(dispH * scale));
  const rotation = totalRotation(page);

  // Virtualization: only rasterize near the viewport.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setNearViewport(true);
      },
      { root: scrollEl, rootMargin: "900px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [scrollEl]);

  // Rasterize when visible / scale / rotation changes.
  useEffect(() => {
    if (!nearViewport) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    setRenderError(false);
    (async () => {
      try {
        if (page.source === "blank") {
          const dpr = Math.min(2, window.devicePixelRatio || 1);
          canvas.width = Math.round(cssW * dpr);
          canvas.height = Math.round(cssH * dpr);
          canvas.style.width = `${cssW}px`;
          canvas.style.height = `${cssH}px`;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.scale(dpr, dpr);
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, cssW, cssH);
          }
          return;
        }
        const doc =
          page.source === "appended"
            ? session.appendedDocs.get(page.sourceDocId ?? "")?.doc
            : session.pdfDoc;
        if (!doc) return;
        await renderPageToCanvas(doc, page.sourcePageIndex, canvas, {
          scale,
          rotation,
          dpr: Math.min(2, window.devicePixelRatio || 1),
        });
        if (cancelled) return;
      } catch {
        if (!cancelled) setRenderError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nearViewport, scale, rotation, page.id, page.sourcePageIndex, page.source, index]);

  return (
    <div
      ref={wrapRef}
      className="pw-page-shadow relative bg-white"
      style={{ width: cssW, height: cssH }}
      data-page-id={page.id}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-label={`Page ${index + 1}`} />
      {!nearViewport && <div className="absolute inset-0 bg-white" aria-hidden="true" />}
      {renderError && (
        <div className="absolute inset-0 flex items-center justify-center bg-white">
          <p className="px-6 text-center text-xs text-zinc-500">
            This page could not be rendered, but it will still export.
          </p>
        </div>
      )}
      <EditingLayer page={page} scale={scale} />
    </div>
  );
});

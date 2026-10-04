/**
 * PageThumbnail — lazily rendered pdf.js thumbnail with a module-level
 * dataURL cache so sidebar re-renders don't re-rasterize pages.
 */
import { memo, useEffect, useRef } from "react";
import { useEditor } from "../editor/store";
import { session } from "../editor/session";
import { totalRotation } from "../types/pdf";

const thumbCache = new Map<string, string>();
const MAX_CACHE = 80;

function cacheKey(pageId: string, rotation: number): string {
  return `${pageId}:${rotation}`;
}

function putCache(key: string, url: string): void {
  if (thumbCache.size >= MAX_CACHE) {
    const first = thumbCache.keys().next().value;
    if (first) thumbCache.delete(first);
  }
  thumbCache.set(key, url);
}

export const PageThumbnail = memo(function PageThumbnail({
  pageId,
  className,
}: {
  pageId: string;
  className?: string;
}): React.ReactElement | null {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const page = useEditor((s) => s.pages.find((p) => p.id === pageId));
  const rotation = page ? totalRotation(page) : 0;

  useEffect(() => {
    if (!page) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const key = cacheKey(pageId, rotation);
    const hit = thumbCache.get(key);
    if (hit) {
      const img = new Image();
      img.onload = () => {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext("2d")?.drawImage(img, 0, 0);
      };
      img.src = hit;
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        if (page.source === "blank") {
          // Blank page: plain white tile.
          canvas.width = 120;
          canvas.height = Math.max(1, Math.round((120 * page.height) / Math.max(1, page.width)));
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }
          putCache(key, canvas.toDataURL("image/jpeg", 0.7));
          return;
        }
        const doc =
          page.source === "appended"
            ? session.appendedDocs.get(page.sourceDocId ?? "")?.doc
            : session.pdfDoc;
        if (!doc) return;
        const pg = await doc.getPage(page.sourcePageIndex + 1);
        if (cancelled) {
          pg.cleanup();
          return;
        }
        const base = pg.getViewport({ scale: 1, rotation });
        const scale = 150 / Math.max(base.width, base.height);
        const vp = pg.getViewport({ scale, rotation });
        canvas.width = Math.max(1, Math.floor(vp.width));
        canvas.height = Math.max(1, Math.floor(vp.height));
        await pg.render({ canvas, viewport: vp }).promise;
        pg.cleanup();
        if (!cancelled) putCache(key, canvas.toDataURL("image/jpeg", 0.7));
      } catch {
        /* thumbnails are best-effort */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pageId, page, rotation]);

  if (!page) return null;
  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
});

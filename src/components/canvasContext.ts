/**
 * Canvas context: resolved zoom scale + scroll container for the page views.
 */
import { createContext, useContext } from "react";

export interface CanvasCtx {
  /** CSS px per PDF point. */
  scale: number;
  /** Scroll container element (for IntersectionObserver roots). */
  scrollEl: HTMLElement | null;
  /** Scroll to a page index. */
  scrollToPage: (index: number) => void;
}

export const PdfCanvasContext = createContext<CanvasCtx>({
  scale: 1,
  scrollEl: null,
  scrollToPage: () => undefined,
});

export function usePdfCanvas(): CanvasCtx {
  return useContext(PdfCanvasContext);
}

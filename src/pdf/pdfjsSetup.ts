/**
 * pdf.js setup — worker source for Vite builds.
 *
 * The worker is bundled as a separate asset (?url) so the app works as a
 * purely static deployment (Vercel) with zero runtime CDN dependencies.
 */
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

let configured = false;

export function ensurePdfWorker(): void {
  if (configured) return;
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
  configured = true;
}

export { pdfjsLib };

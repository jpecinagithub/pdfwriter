/**
 * PDF loading + validation + page rasterization (pdf.js).
 *
 * All validation failures throw typed errors so the UI can show useful
 * messages instead of failing silently.
 */
import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { ensurePdfWorker, pdfjsLib } from "./pdfjsSetup";

export const MAX_PDF_BYTES = 250 * 1024 * 1024; // 250 MB

export class PdfLoadError extends Error {
  readonly code:
    | "not-pdf"
    | "too-large"
    | "password"
    | "corrupt"
    | "empty";
  constructor(code: PdfLoadError["code"], message: string) {
    super(message);
    this.name = "PdfLoadError";
    this.code = code;
  }
}

export interface ValidatedPdf {
  data: ArrayBuffer;
  fileName: string;
}

function sanitizeFileName(name: string): string {
  // Strip path components and control chars; keep it display-safe.
  const base = name.split(/[\\/]/).pop() ?? "document.pdf";
  return base.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 200) || "document.pdf";
}

/** Validate extension, MIME type, size and magic bytes. Returns a copy-safe buffer. */
export async function validatePdfFile(file: File): Promise<ValidatedPdf> {
  const fileName = sanitizeFileName(file.name);

  if (!/\.pdf$/i.test(fileName)) {
    throw new PdfLoadError("not-pdf", `"${fileName}" is not a PDF file. Please choose a file ending in .pdf.`);
  }
  // MIME check: browsers are inconsistent; accept application/pdf, octet-stream,
  // or empty type when the extension is right. Reject clearly wrong types.
  if (file.type && !/^(application\/pdf|application\/octet-stream|binary\/octet-stream)$/i.test(file.type)) {
    throw new PdfLoadError("not-pdf", `"${fileName}" does not look like a PDF (type: ${file.type}).`);
  }
  if (file.size === 0) {
    throw new PdfLoadError("empty", `"${fileName}" is empty (0 bytes).`);
  }
  if (file.size > MAX_PDF_BYTES) {
    throw new PdfLoadError(
      "too-large",
      `"${fileName}" is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 250 MB.`,
    );
  }

  const data = await file.arrayBuffer();
  // Magic bytes: %PDF-
  const header = new Uint8Array(data.slice(0, 5));
  const magic = String.fromCharCode(...header);
  if (magic !== "%PDF-") {
    throw new PdfLoadError("not-pdf", `"${fileName}" is not a valid PDF (missing %PDF header).`);
  }
  return { data, fileName };
}

export interface LoadedPdf {
  doc: PDFDocumentProxy;
  task: PDFDocumentLoadingTask;
  pageCount: number;
  title?: string;
  author?: string;
}

/**
 * Open a validated PDF with pdf.js. `data` is copied so the caller's buffer
 * stays intact for the exporter.
 */
export async function loadPdfDocument(data: ArrayBuffer): Promise<LoadedPdf> {
  ensurePdfWorker();
  const copy = data.slice(0);
  let doc: PDFDocumentProxy;
  let task: PDFDocumentLoadingTask;
  try {
    // Note: pdf.js never executes embedded JavaScript in this build;
    // PDFs are treated as untrusted input.
    task = pdfjsLib.getDocument({ data: copy });
    doc = await task.promise;
  } catch (err) {
    if (err instanceof Error && /password|encrypted/i.test(err.message + err.name)) {
      throw new PdfLoadError("password", "This PDF is password-protected. PDFWriter cannot open encrypted documents yet.");
    }
    throw new PdfLoadError(
      "corrupt",
      `We couldn't open this PDF. The document may be corrupted or use an unsupported PDF feature. (${err instanceof Error ? err.message : String(err)})`,
    );
  }

  let metadata: { info?: Record<string, unknown> } = {};
  try {
    metadata = (await doc.getMetadata()) as typeof metadata;
  } catch {
    // Metadata is best-effort.
  }
  const info = (metadata.info ?? {}) as Record<string, unknown>;
  return {
    doc,
    task,
    pageCount: doc.numPages,
    title: typeof info.Title === "string" ? info.Title : undefined,
    author: typeof info.Author === "string" ? info.Author : undefined,
  };
}

export interface PageGeometry {
  /** Unrotated size in PDF points. */
  width: number;
  height: number;
  /** Intrinsic /Rotate of the page (0|90|180|270). */
  intrinsicRotation: 0 | 90 | 180 | 270;
}

export async function getPageGeometry(
  doc: PDFDocumentProxy,
  pageIndex: number,
): Promise<PageGeometry> {
  const page = await doc.getPage(pageIndex + 1);
  try {
    // rotation: 0 REPLACES the intrinsic rotation (pdf.js default is page.rotate),
    // so this viewport gives the true unrotated size.
    const vp = page.getViewport({ scale: 1, rotation: 0 });
    const rot = (((page.rotate % 360) + 360) % 360) as PageGeometry["intrinsicRotation"];
    return { width: vp.width, height: vp.height, intrinsicRotation: rot };
  } finally {
    page.cleanup();
  }
}

export interface RenderOptions {
  scale: number;
  /** Total display rotation (intrinsic + user). Replaces intrinsic rotation. */
  rotation: 0 | 90 | 180 | 270;
  /** Device pixel ratio for crisp rendering. */
  dpr?: number;
}

/**
 * Render a page into a canvas. The caller owns the canvas; we size it.
 * Returns the CSS size so overlays can be aligned exactly.
 */
export async function renderPageToCanvas(
  doc: PDFDocumentProxy,
  pageIndex: number,
  canvas: HTMLCanvasElement,
  opts: RenderOptions,
): Promise<{ cssWidth: number; cssHeight: number }> {
  const { scale, rotation, dpr = 1 } = opts;
  const page: PDFPageProxy = await doc.getPage(pageIndex + 1);
  try {
    const viewport = page.getViewport({ scale: scale * dpr, rotation });
    const cssWidth = viewport.width / dpr;
    const cssHeight = viewport.height / dpr;

    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("2d canvas context unavailable");
    // pdf.js v6 takes the canvas element (it manages the context itself).
    await page.render({ canvas, viewport }).promise;
    return { cssWidth, cssHeight };
  } finally {
    page.cleanup();
  }
}

/**
 * Render a small thumbnail (JPEG blob) for history entries / sidebar.
 */
export async function renderPageThumbnail(
  doc: PDFDocumentProxy,
  pageIndex: number,
  maxDim = 240,
): Promise<Blob> {
  const page = await doc.getPage(pageIndex + 1);
  try {
    const base = page.getViewport({ scale: 1, rotation: page.rotate });
    const scale = Math.min(1, maxDim / Math.max(base.width, base.height));
    const viewport = page.getViewport({ scale, rotation: page.rotate });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("2d canvas context unavailable");
    await page.render({ canvas, viewport }).promise;
    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, "image/jpeg", 0.7),
    );
    if (!blob) throw new Error("thumbnail encode failed");
    return blob;
  } finally {
    page.cleanup();
  }
}

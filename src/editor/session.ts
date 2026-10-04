/**
 * Module-level, non-reactive session holders.
 *
 * Large binary objects (PDF bytes, pdf.js documents, image blobs) must NOT
 * live in zustand state — they would be cloned into every undo snapshot and
 * trigger wasteful re-renders. They live here instead.
 */
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import { nanoid } from "../utils/id";

export const session = {
  /** Original PDF bytes (kept for the exporter). */
  originalBytes: null as ArrayBuffer | null,
  /** pdf.js document for the original PDF (rendering + text search). */
  pdfDoc: null as PDFDocumentProxy | null,
  /** Loading task owning pdfDoc (destroy() lives here in pdf.js v6). */
  pdfTask: null as PDFDocumentLoadingTask | null,
  /** Appended documents: id -> bytes + pdf.js doc + task. */
  appendedDocs: new Map<string, { fileName: string; bytes: ArrayBuffer; doc: PDFDocumentProxy; task: PDFDocumentLoadingTask }>(),
  /** Image/signature blobs: imageId -> { blob, objectUrl }. */
  imageBlobs: new Map<string, { blob: Blob; url: string }>(),
  /** Clipboard for copy/paste (serialized edits, ids stripped on paste). */
  clipboard: null as import("../types/editor").PdfEdit[] | null,
  /** Autosave project id for the current session. */
  projectId: null as string | null,
  /**
   * Pending click-to-place payload for the image/signature tools.
   * Set by the image picker / signature dialog; consumed by the editing layer
   * on the next page click.
   */
  pendingPlacement: null as {
    kind: "image" | "signature";
    imageId: string;
    naturalWidth: number;
    naturalHeight: number;
  } | null,
};

export function registerImageBlob(blob: Blob): { id: string; url: string } {
  const id = `img_${nanoid()}`;
  const url = URL.createObjectURL(blob);
  session.imageBlobs.set(id, { blob, url });
  return { id, url };
}

export function registerImageBlobWithId(id: string, blob: Blob): string {
  const existing = session.imageBlobs.get(id);
  if (existing) URL.revokeObjectURL(existing.url);
  const url = URL.createObjectURL(blob);
  session.imageBlobs.set(id, { blob, url });
  return url;
}

export function getImageUrl(imageId: string): string | undefined {
  return session.imageBlobs.get(imageId)?.url;
}

export function getImageBlob(imageId: string): Blob | undefined {
  return session.imageBlobs.get(imageId)?.blob;
}

export function releaseSession(): void {
  if (session.pdfTask) {
    session.pdfTask.destroy().catch(() => undefined);
    session.pdfTask = null;
    session.pdfDoc = null;
  }
  for (const [, d] of session.appendedDocs) {
    d.task.destroy().catch(() => undefined);
  }
  session.appendedDocs.clear();
  for (const [, e] of session.imageBlobs) {
    URL.revokeObjectURL(e.url);
  }
  session.imageBlobs.clear();
  session.originalBytes = null;
  session.clipboard = null;
  session.projectId = null;
}

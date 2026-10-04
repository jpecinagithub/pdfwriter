/**
 * Document open flows: file -> validate -> pdf.js -> PageMeta[] -> session + store.
 * Also: append-PDF flow and open-from-history flow.
 */
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  getPageGeometry,
  loadPdfDocument,
  validatePdfFile,
  PdfLoadError,
} from "./pdfLoader";
import { releaseSession, session } from "../editor/session";
import { useEditor } from "../editor/store";
import type { PageMeta } from "../types/pdf";
import { nanoid } from "../utils/id";
import { saveProjectNow, deleteProjectById, setLastProjectId } from "../storage/autosave";

export { getLastProjectId } from "../storage/autosave";

async function buildPages(
  doc: PDFDocumentProxy,
  count: number,
  source: PageMeta["source"],
  sourceDocId: string | undefined,
  onProgress: (i: number) => void,
  prefix: string,
): Promise<PageMeta[]> {
  const pages: PageMeta[] = [];
  for (let i = 0; i < count; i++) {
    if (i % 5 === 0) onProgress(i);
    const g = await getPageGeometry(doc, i);
    pages.push({
      id: `${prefix}_${nanoid()}`,
      source,
      sourcePageIndex: i,
      sourceDocId,
      width: g.width,
      height: g.height,
      rotation: 0,
      intrinsicRotation: g.intrinsicRotation,
    });
  }
  return pages;
}

/**
 * Open a user-selected PDF file. The previous session is released only after
 * the new document loads successfully.
 */
export async function openPdfFile(file: File): Promise<void> {
  const store = useEditor.getState();
  const previousProjectId = session.projectId;
  store.setLoading("Checking file…");
  try {
    const { data, fileName } = await validatePdfFile(file);
    store.setLoading("Opening PDF…");
    const loaded = await loadPdfDocument(data);

    // Build page metadata before touching the current session.
    const pages = await buildPages(
      loaded.doc, loaded.pageCount, "original", undefined,
      (i) => store.setLoading(`Reading page ${i + 1} of ${loaded.pageCount}…`),
      "p",
    );

    releaseSession();
    if (previousProjectId) void deleteProjectById(previousProjectId).catch(() => undefined);
    session.originalBytes = data;
    session.pdfDoc = loaded.doc;
    session.pdfTask = loaded.task;
    session.projectId = `proj_${nanoid()}`;

    store.openDocument(fileName, pages);
    setLastProjectId(session.projectId);
    void saveProjectNow().catch(() => undefined);
  } catch (err) {
    if (err instanceof PdfLoadError) store.setLoadError(err.message);
    else store.setLoadError(`We couldn't open this PDF. The document may be corrupted or use an unsupported feature.`);
    throw err;
  }
}

/** Open a PDF from a history entry (Blob) back into the editor. */
export async function openPdfBlob(blob: Blob, fileName: string): Promise<void> {
  const asFile = new File([blob], fileName, { type: "application/pdf" });
  await openPdfFile(asFile);
}

export interface AppendSelection {
  file: File;
  pageIndices: number[];
}

/**
 * Import pages from another PDF and append them. Returns the number of pages added.
 */
export async function appendPdfPages(sel: AppendSelection): Promise<number> {
  const store = useEditor.getState();
  const { data, fileName } = await validatePdfFile(sel.file);
  const loaded = await loadPdfDocument(data);
  try {
    const docId = `doc_${nanoid()}`;
    const pages: PageMeta[] = [];
    for (const idx of sel.pageIndices) {
      const g = await getPageGeometry(loaded.doc, idx);
      pages.push({
        id: `p_${nanoid()}`,
        source: "appended",
        sourcePageIndex: idx,
        sourceDocId: docId,
        width: g.width,
        height: g.height,
        rotation: 0,
        intrinsicRotation: g.intrinsicRotation,
      });
    }
    session.appendedDocs.set(docId, { fileName, bytes: data, doc: loaded.doc, task: loaded.task });
    store.appendPages(pages);
    void saveProjectNow().catch(() => undefined);
    return pages.length;
  } catch (err) {
    loaded.task.destroy().catch(() => undefined);
    throw err;
  }
}

/** Discard the appended-doc pdf.js resources for docs no longer referenced. */
export function gcAppendedDocs(): void {
  const { pages } = useEditor.getState();
  const used = new Set(pages.map((p) => p.sourceDocId).filter(Boolean) as string[]);
  for (const [id, d] of session.appendedDocs) {
    if (!used.has(id)) {
      d.task.destroy().catch(() => undefined);
      session.appendedDocs.delete(id);
    }
  }
}

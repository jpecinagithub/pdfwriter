/**
 * Export flow: generate -> download -> save to history (quota-aware).
 * Never loses the generated PDF: download always happens, history is best-effort.
 */
import { downloadBytes, exportDocument } from "./exportService";
import type { ProgressFn } from "./exportCore";
import { renderPageThumbnail } from "./pdfLoader";
import { session } from "../editor/session";
import { useEditor } from "../editor/store";
import { saveHistoryEntryWithQuota, HistoryQuotaError } from "../storage/storageManager";
import type { PdfHistoryEntry } from "../storage/historyRepository";
import { nanoid } from "../utils/id";

export interface PerformExportOptions {
  fileName?: string;
  flattenNotes: boolean;
  saveToHistory: boolean;
  onProgress?: ProgressFn;
}

export interface PerformExportResult {
  fileName: string;
  historySaved: boolean;
  /** "quota" | "history-error" when the PDF downloaded but history failed */
  historyWarning?: "quota" | "history-error";
}

/** Exact ArrayBuffer copy (BlobPart-safe). */
function u8ToBuffer(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

export async function performExport(opts: PerformExportOptions): Promise<PerformExportResult> {
  const { bytes, fileName, pageCount } = await exportDocument({
    fileName: opts.fileName,
    flattenNotes: opts.flattenNotes,
    onProgress: opts.onProgress,
  });

  // The download must never be lost — trigger it before touching storage.
  downloadBytes(bytes, fileName);

  let historySaved = false;
  let historyWarning: PerformExportResult["historyWarning"];
  if (opts.saveToHistory) {
    try {
      let thumbnail: Blob | undefined;
      try {
        if (session.pdfDoc) thumbnail = await renderPageThumbnail(session.pdfDoc, 0);
      } catch {
        /* thumbnail is best-effort */
      }
      const entry: PdfHistoryEntry = {
        id: `h_${nanoid()}`,
        fileName,
        originalFileName: useEditor.getState().fileName,
        pdfBlob: new Blob([u8ToBuffer(bytes)], { type: "application/pdf" }),
        createdAt: Date.now(),
        fileSize: bytes.length,
        pageCount,
        thumbnail,
      };
      await saveHistoryEntryWithQuota(entry);
      historySaved = true;
    } catch (err) {
      historyWarning = err instanceof HistoryQuotaError ? "quota" : "history-error";
    }
  }
  return { fileName, historySaved, historyWarning };
}

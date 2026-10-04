/**
 * Main-thread export service.
 *
 * Gathers the export input (pages, edits, PDF bytes, image bytes, handwriting
 * fonts) and runs the pipeline in a Web Worker, falling back to the main
 * thread if workers are unavailable.
 */
import { runExport, type ExportInput, type ProgressFn } from "./exportCore";
import { session } from "../editor/session";
import { useEditor } from "../editor/store";
import type { HandStyle, PdfEdit } from "../types/editor";
import { buildExportFileName } from "../utils/filename";

export interface ExportRequestOptions {
  /** Desired output file name (sanitized, .pdf enforced). */
  fileName?: string;
  flattenNotes: boolean;
  onProgress?: ProgressFn;
}

export interface ExportResult {
  bytes: Uint8Array;
  fileName: string;
  pageCount: number;
}

const fontCache = new Map<HandStyle, ArrayBuffer>();

async function getHandwritingFont(style: HandStyle): Promise<ArrayBuffer | undefined> {
  const cached = fontCache.get(style);
  if (cached) return cached;
  const file = {
    casual: "Caveat-Regular.ttf",
    notebook: "ShadowsIntoLight-Regular.ttf",
    signature: "GreatVibes-Regular.ttf",
    marker: "PermanentMarker-Regular.ttf",
    elegant: "DancingScript-Regular.ttf",
  }[style];
  try {
    const res = await fetch(`/fonts/${file}`);
    if (!res.ok) return undefined;
    const buf = await res.arrayBuffer();
    fontCache.set(style, buf);
    return buf;
  } catch {
    return undefined;
  }
}

function collectImageIds(edits: PdfEdit[]): string[] {
  const ids = new Set<string>();
  for (const e of edits) {
    if ((e.type === "image" || e.type === "signature") && "imageId" in e) {
      ids.add(e.imageId);
    }
  }
  return [...ids];
}

async function buildInput(flattenNotes: boolean): Promise<ExportInput> {
  const { pages, edits } = useEditor.getState();
  if (!session.originalBytes) throw new Error("No document loaded.");
  // Copy buffers: the worker transfer must not neuter the session's copies.
  const originalBytes = session.originalBytes.slice(0);
  const appendedDocs = [...session.appendedDocs.entries()].map(([id, d]) => ({
    id,
    bytes: d.bytes.slice(0),
  }));
  const images: ExportInput["images"] = [];
  for (const id of collectImageIds(edits)) {
    const blob = session.imageBlobs.get(id)?.blob;
    if (blob) images.push({ id, bytes: await blob.arrayBuffer() });
  }
  const styles = new Set<HandStyle>();
  for (const e of edits) if (e.type === "handwritten") styles.add(e.handStyle);
  const fontFiles: ExportInput["fontFiles"] = {};
  for (const s of styles) {
    const buf = await getHandwritingFont(s);
    if (buf) fontFiles[s] = buf;
  }
  return {
    originalBytes,
    appendedDocs,
    pages: structuredClone(pages),
    edits: structuredClone(edits),
    images,
    fontFiles,
    flattenNotes,
  };
}

let workerSeq = 0;

function exportInWorker(input: ExportInput, onProgress?: ProgressFn): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("../workers/export.worker.ts", import.meta.url), {
        type: "module",
      });
    } catch (err) {
      reject(err);
      return;
    }
    const id = ++workerSeq;
    const transfer: Transferable[] = [input.originalBytes];
    for (const a of input.appendedDocs) transfer.push(a.bytes);
    for (const i of input.images) transfer.push(i.bytes);
    for (const k of Object.keys(input.fontFiles)) {
      const b = (input.fontFiles as Record<string, ArrayBuffer>)[k];
      if (b) transfer.push(b);
    }
    const cleanup = () => worker.terminate();
    worker.onmessage = (ev: MessageEvent) => {
      const msg = ev.data as { id: number; type: string; phase?: string; done?: number; total?: number; bytes?: ArrayBuffer; message?: string };
      if (msg.id !== id) return;
      if (msg.type === "progress") {
        onProgress?.(msg.phase ?? "", msg.done ?? 0, msg.total ?? 1);
      } else if (msg.type === "done" && msg.bytes) {
        cleanup();
        resolve(new Uint8Array(msg.bytes));
      } else if (msg.type === "error") {
        cleanup();
        reject(new Error(msg.message ?? "Export failed"));
      }
    };
    worker.onerror = (e) => {
      cleanup();
      reject(new Error(`Export worker error: ${e.message}`));
    };
    worker.postMessage({ id, input }, transfer);
  });
}

export async function exportDocument(opts: ExportRequestOptions): Promise<ExportResult> {
  const state = useEditor.getState();
  const input = await buildInput(opts.flattenNotes);
  let bytes: Uint8Array;
  try {
    bytes = await exportInWorker(input, opts.onProgress);
  } catch (err) {
    // Worker unavailable/blocked — fall back to the main thread rather than failing.
    // Rebuild the input: the buffers above were transferred (neutered) to the worker.
    console.warn("Export worker failed, falling back to main thread:", err);
    bytes = await runExport(await buildInput(opts.flattenNotes), opts.onProgress);
  }
  const fileName = buildExportFileName(opts.fileName || state.fileName || "document.pdf");
  return { bytes, fileName, pageCount: state.pages.length };
}

/** Trigger a browser download of the exported bytes. */
export function downloadBytes(bytes: Uint8Array, fileName: string): void {
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const blob = new Blob([buf], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}

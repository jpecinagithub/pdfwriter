/**
 * Export Web Worker — runs the pdf-lib pipeline off the main thread so the
 * UI stays responsive while large PDFs are generated.
 *
 * Protocol:
 *   main -> worker: { id, input: ExportInput }   (ArrayBuffers transferred)
 *   worker -> main: { id, type: "progress", phase, done, total }
 *                   { id, type: "done", bytes }   (bytes transferred back)
 *                   { id, type: "error", message }
 */
import { runExport, type ExportInput } from "../pdf/exportCore";

interface ExportRequest {
  id: number;
  input: ExportInput;
}

self.onmessage = async (ev: MessageEvent<ExportRequest>) => {
  const { id, input } = ev.data;
  const post = (msg: object) => self.postMessage({ id, ...msg });
  try {
    const bytes = await runExport(input, (phase, done, total) => {
      post({ type: "progress", phase, done, total });
    });
    // Transfer the result buffer back — zero copy.
    post({ type: "done", bytes: bytes.buffer });
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};

export {};

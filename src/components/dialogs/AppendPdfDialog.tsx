/**
 * AppendPdfDialog — pick another PDF, validate it without touching the
 * current session, choose a page range, and append the pages.
 */
import { useEffect, useRef, useState } from "react";
import { CircleAlert, LoaderCircle, X } from "lucide-react";
import { useEditor } from "../../editor/store";
import { appendPdfPages } from "../../pdf/openFlow";
import { loadPdfDocument, validatePdfFile } from "../../pdf/pdfLoader";

/** Parse "1-3, 5" into sorted, deduped, clamped 0-based page indices. */
function parsePageRange(input: string, pageCount: number): number[] {
  const trimmed = input.trim();
  if (!trimmed) return Array.from({ length: pageCount }, (_, i) => i);
  const picked = new Set<number>();
  for (const rawPart of trimmed.split(",")) {
    const part = rawPart.trim();
    if (!part) continue;
    const dash = part.indexOf("-");
    if (dash === -1) {
      const n = Number.parseInt(part, 10);
      if (Number.isInteger(n)) picked.add(n - 1);
    } else {
      const a = Number.parseInt(part.slice(0, dash), 10);
      const b = Number.parseInt(part.slice(dash + 1), 10);
      if (Number.isInteger(a) && Number.isInteger(b)) {
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        for (let n = lo; n <= hi; n++) picked.add(n - 1);
      }
    }
  }
  return [...picked].filter((i) => i >= 0 && i < pageCount).sort((a, b) => a - b);
}

export default function AppendPdfDialog(): React.ReactElement | null {
  const appendDialogOpen = useEditor((s) => s.appendDialogOpen);
  const setAppendDialogOpen = useEditor((s) => s.setAppendDialogOpen);

  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [range, setRange] = useState("");
  const [loading, setLoading] = useState(false);
  const [appending, setAppending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!appendDialogOpen) return;
    setFile(null);
    setFileName("");
    setPageCount(null);
    setRange("");
    setLoading(false);
    setAppending(false);
    setError(null);
  }, [appendDialogOpen]);

  if (!appendDialogOpen) return null;

  const close = (): void => {
    if (loading || appending) return;
    setAppendDialogOpen(false);
  };

  const chooseFile = (chosen: File | undefined): void => {
    if (!chosen) return;
    setError(null);
    setLoading(true);
    setFile(null);
    setPageCount(null);
    void validatePdfFile(chosen)
      .then(({ data, fileName: validName }) => loadPdfDocument(data).then((loaded) => ({ loaded, validName })))
      .then(({ loaded, validName }) => {
        setPageCount(loaded.pageCount);
        setFileName(validName);
        setFile(chosen);
        return loaded.task.destroy().catch(() => undefined);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Could not read this PDF.");
      })
      .finally(() => setLoading(false));
  };

  const append = (): void => {
    if (!file || pageCount === null) return;
    const indices = parsePageRange(range, pageCount);
    if (indices.length === 0) {
      setError("No valid pages selected. Try a range like “1-3, 5”.");
      return;
    }
    setError(null);
    setAppending(true);
    void appendPdfPages({ file, pageIndices: indices })
      .then(() => setAppendDialogOpen(false))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Could not append these pages.");
      })
      .finally(() => setAppending(false));
  };

  const busy = loading || appending;
  const selectedCount = pageCount === null ? 0 : parsePageRange(range, pageCount).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Append pages from another PDF"
        className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-zinc-200"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200">
          <h2 className="text-base font-semibold text-zinc-900">Append PDF pages</h2>
          <button
            type="button"
            aria-label="Close append dialog"
            onClick={close}
            disabled={busy}
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-zinc-500 hover:bg-zinc-100 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              aria-hidden="true"
              tabIndex={-1}
              onChange={(e) => {
                chooseFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              className="w-full rounded-xl border-2 border-dashed border-zinc-300 px-4 py-6 text-sm font-medium text-zinc-600 hover:border-blue-400 hover:text-blue-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <LoaderCircle className="w-4 h-4 animate-spin" aria-hidden="true" />
                  Reading PDF…
                </span>
              ) : file ? (
                <span>
                  {fileName} — {pageCount} pages
                </span>
              ) : (
                "Choose a PDF"
              )}
            </button>
          </div>

          {file && pageCount !== null && (
            <div>
              <label htmlFor="append-range" className="block text-sm font-medium text-zinc-700">
                Pages to append
              </label>
              <input
                id="append-range"
                type="text"
                value={range}
                onChange={(e) => setRange(e.target.value)}
                placeholder='All pages (e.g. "1-3, 5")'
                className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
              <p className="mt-1 text-xs text-zinc-500" aria-live="polite">
                {selectedCount > 0
                  ? `${selectedCount} of ${pageCount} pages will be appended.`
                  : "Enter 1-based page numbers or ranges."}
              </p>
            </div>
          )}

          {error && (
            <p role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <CircleAlert className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={close}
              disabled={busy}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={append}
              disabled={!file || busy}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
            >
              {appending && <LoaderCircle className="w-4 h-4 animate-spin" aria-hidden="true" />}
              Append pages
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

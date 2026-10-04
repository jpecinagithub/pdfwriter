/**
 * ExportDialog — filename + options, progress while exporting, and a
 * success/error summary. Quota failures surface a warning without losing
 * the downloaded PDF.
 */
import { useEffect, useState } from "react";
import { CircleAlert, CircleCheck, LoaderCircle, X } from "lucide-react";
import { useEditor } from "../../editor/store";
import { performExport, type PerformExportResult } from "../../pdf/exportFlow";
import { buildExportFileName } from "../../utils/filename";

type Phase = "form" | "exporting" | "success" | "error";

function ModalShell({
  onClose,
  children,
  label,
}: {
  onClose: () => void;
  children: React.ReactNode;
  label: string;
}): React.ReactElement {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-zinc-200"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export default function ExportDialog(): React.ReactElement | null {
  const exportDialogOpen = useEditor((s) => s.exportDialogOpen);
  const setExportDialogOpen = useEditor((s) => s.setExportDialogOpen);
  const setHistoryOpen = useEditor((s) => s.setHistoryOpen);
  const fileName = useEditor((s) => s.fileName);

  const [phase, setPhase] = useState<Phase>("form");
  const [name, setName] = useState("");
  const [flattenNotes, setFlattenNotes] = useState(true);
  const [saveToHistory, setSaveToHistory] = useState(true);
  const [progress, setProgress] = useState<{ phase: string; done: number; total: number } | null>(null);
  const [result, setResult] = useState<PerformExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (exportDialogOpen) {
      setPhase("form");
      setName(buildExportFileName(fileName));
      setFlattenNotes(true);
      setSaveToHistory(true);
      setProgress(null);
      setResult(null);
      setError(null);
    }
  }, [exportDialogOpen, fileName]);

  useEffect(() => {
    if (!exportDialogOpen) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape" && phase !== "exporting") setExportDialogOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [exportDialogOpen, phase, setExportDialogOpen]);

  if (!exportDialogOpen) return null;

  const close = (): void => {
    if (phase === "exporting") return;
    setExportDialogOpen(false);
  };

  const runExport = async (): Promise<void> => {
    setPhase("exporting");
    setError(null);
    setProgress(null);
    try {
      const res = await performExport({
        fileName: name.trim() || fileName,
        flattenNotes,
        saveToHistory,
        onProgress: (p, done, total) => setProgress({ phase: p, done, total }),
      });
      setResult(res);
      setPhase("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed. Please try again.");
      setPhase("error");
    }
  };

  return (
    <ModalShell onClose={close} label="Export PDF">
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200">
        <h2 className="text-base font-semibold text-zinc-900">Export PDF</h2>
        <button
          type="button"
          aria-label="Close export dialog"
          onClick={close}
          disabled={phase === "exporting"}
          className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-zinc-500 hover:bg-zinc-100 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      <div className="px-5 py-4">
        {phase === "form" && (
          <>
            <label htmlFor="export-filename" className="block text-sm font-medium text-zinc-700">
              Filename
            </label>
            <input
              id="export-filename"
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
            <fieldset className="mt-4 space-y-3">
              <legend className="sr-only">Export options</legend>
              <label className="flex items-start gap-2.5 text-sm text-zinc-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={flattenNotes}
                  onChange={(e) => setFlattenNotes(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                />
                <span>
                  Flatten notes into PDF
                  <span className="block text-xs text-zinc-500">
                    Sticky notes are rendered visibly instead of kept as annotations.
                  </span>
                </span>
              </label>
              <div>
                <label className="flex items-start gap-2.5 text-sm text-zinc-700 cursor-not-allowed opacity-70">
                  <input type="checkbox" checked disabled className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-blue-600" />
                  Preserve original PDF quality
                </label>
                <p className="ml-6.5 text-xs text-zinc-500">Always on — your PDF is never rasterized.</p>
              </div>
              <label className="flex items-start gap-2.5 text-sm text-zinc-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveToHistory}
                  onChange={(e) => setSaveToHistory(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                />
                Save to PDFWriter history
              </label>
            </fieldset>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={close}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void runExport()}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
              >
                Download PDF
              </button>
            </div>
          </>
        )}

        {phase === "exporting" && (
          <div className="py-6 text-center">
            <LoaderCircle className="w-8 h-8 text-blue-600 animate-spin mx-auto" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-zinc-800" aria-live="polite">
              {progress ? progress.phase : "Preparing export…"}
            </p>
            {progress && progress.total > 0 && (
              <progress
                value={progress.done}
                max={progress.total}
                className="mt-3 w-full h-2 [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-zinc-200 [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-blue-600"
              />
            )}
          </div>
        )}

        {phase === "success" && result && (
          <div className="py-4">
            <div className="flex items-center gap-2.5">
              <CircleCheck className="w-8 h-8 text-emerald-600 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-zinc-900">PDF generated successfully</p>
                <p className="text-xs text-zinc-500 truncate" title={result.fileName}>
                  {result.fileName}
                </p>
              </div>
            </div>
            {result.historyWarning === "quota" && (
              <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3">
                <p className="text-sm font-medium text-amber-800">Not enough local storage</p>
                <p className="mt-1 text-xs text-amber-700">
                  Your PDF was downloaded, but it could not be added to Recent PDFs.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setHistoryOpen(true);
                    setExportDialogOpen(false);
                  }}
                  className="mt-2 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                >
                  Manage history
                </button>
              </div>
            )}
            {result.historyWarning === "history-error" && (
              <p className="mt-3 text-xs text-zinc-500">
                The PDF was downloaded, but it couldn't be added to Recent PDFs.
              </p>
            )}
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={close}
                autoFocus
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {phase === "error" && (
          <div className="py-4">
            <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3">
              <CircleAlert className="w-5 h-5 text-red-500 shrink-0 mt-0.5" aria-hidden="true" />
              <p role="alert" className="text-sm text-red-700">
                {error ?? "Export failed. Please try again."}
              </p>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPhase("form")}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                Back
              </button>
              <button
                type="button"
                onClick={close}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
}

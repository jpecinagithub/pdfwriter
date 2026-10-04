/**
 * UploadScreen — full-screen landing with drop zone, validation states,
 * privacy copy and a short list of recently exported PDFs.
 */
import { useEffect, useRef, useState } from "react";
import { CircleAlert, Clock, Download, FileText, FolderOpen, LoaderCircle, Upload } from "lucide-react";
import { useEditor } from "../editor/store";
import { openPdfBlob, openPdfFile } from "../pdf/openFlow";
import {
  getHistoryEntry,
  listHistory,
  type PdfHistoryEntry,
} from "../storage/historyRepository";
import { formatBytes, formatDateTime } from "../utils/filename";

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export default function UploadScreen({ restoring }: { restoring?: boolean }): React.ReactElement {
  const docStatus = useEditor((s) => s.docStatus);
  const loadProgress = useEditor((s) => s.loadProgress);
  const loadError = useEditor((s) => s.loadError);
  const closeDocument = useEditor((s) => s.closeDocument);

  const [dragging, setDragging] = useState(false);
  const [recent, setRecent] = useState<PdfHistoryEntry[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    void listHistory()
      .then((all) => {
        if (alive) setRecent(all.slice(0, 6));
      })
      .catch(() => {
        /* history is best-effort */
      });
    return () => {
      alive = false;
    };
  }, []);

  const openFile = (file: File | undefined): void => {
    if (!file) return;
    setActionError(null);
    void openPdfFile(file).catch(() => {
      /* error is already reflected in store.loadError */
    });
  };

  const openFromHistory = (id: string): void => {
    setBusyId(id);
    setActionError(null);
    void getHistoryEntry(id)
      .then((entry) => {
        if (!entry) throw new Error("Entry not found.");
        return openPdfBlob(entry.pdfBlob, entry.fileName);
      })
      .catch((err: unknown) => {
        setActionError(err instanceof Error ? err.message : "Could not open this PDF.");
      })
      .finally(() => setBusyId(null));
  };

  // ---- loading / error states -------------------------------------------
  if (restoring) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 text-zinc-700">
        <LoaderCircle className="h-10 w-10 animate-spin text-blue-600" aria-hidden="true" />
        <p className="mt-4 text-sm font-medium">Restoring previous session…</p>
      </div>
    );
  }

  if (docStatus === "loading") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 text-zinc-700">
        <LoaderCircle className="w-10 h-10 text-blue-600 animate-spin" aria-hidden="true" />
        <p className="mt-4 text-sm font-medium">{loadProgress ?? "Opening PDF…"}</p>
      </div>
    );
  }

  if (docStatus === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-6">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg border border-zinc-200 p-8 text-center">
          <CircleAlert className="w-10 h-10 text-red-500 mx-auto" aria-hidden="true" />
          <h1 className="mt-4 text-lg font-semibold text-zinc-900">We couldn't open this PDF.</h1>
          <p className="mt-2 text-sm text-zinc-600">
            {loadError ?? "The document may be corrupted, encrypted or use an unsupported PDF feature."}
          </p>
          <button
            type="button"
            onClick={() => closeDocument()}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            <FileText className="w-4 h-4" aria-hidden="true" />
            Choose another PDF
          </button>
        </div>
      </div>
    );
  }

  // ---- main landing -------------------------------------------------------
  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 text-zinc-900">
      <header className="pt-12 pb-6 text-center px-6">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 shadow-md mb-5">
          <FileText className="w-7 h-7 text-white" aria-hidden="true" />
        </div>
        <h1 className="text-4xl font-bold tracking-tight">PDFWriter</h1>
        <p className="mt-2 text-lg text-zinc-600">Edit PDFs privately. Right in your browser.</p>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-6 pb-10">
        <div
          role="button"
          tabIndex={0}
          aria-label="Drop a PDF here or press Enter to choose a file"
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            openFile(e.dataTransfer.files?.[0]);
          }}
          className={`mt-4 rounded-2xl border-2 border-dashed p-12 text-center cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
            dragging ? "border-blue-500 bg-blue-50" : "border-zinc-300 bg-white hover:border-blue-400 hover:bg-blue-50/50"
          }`}
        >
          <Upload
            className={`w-10 h-10 mx-auto ${dragging ? "text-blue-600" : "text-zinc-400"}`}
            aria-hidden="true"
          />
          <p className="mt-4 text-xl font-semibold">Drop your PDF here</p>
          <p className="mt-1 text-sm text-zinc-500">or</p>
          <span className="mt-3 inline-flex items-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm">
            Select PDF
          </span>
          <p className="mt-4 text-xs text-zinc-500">Your document never leaves your device.</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            aria-hidden="true"
            tabIndex={-1}
            onChange={(e) => {
              openFile(e.target.files?.[0] ?? undefined);
              e.target.value = "";
            }}
          />
        </div>

        <p className="mt-6 text-center text-sm text-zinc-600">
          🔒 Your PDFs stay on your device. Files are processed locally in your browser.
        </p>

        {actionError && (
          <p role="alert" className="mt-4 text-center text-sm text-red-600">
            {actionError}
          </p>
        )}

        {recent.length > 0 && (
          <section aria-label="Recent PDFs" className="mt-10">
            <h2 className="text-base font-semibold text-zinc-800">Recent PDFs</h2>
            <ul className="mt-3 divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white shadow-sm">
              {recent.map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 px-4 py-3">
                  <FileText className="w-5 h-5 text-zinc-400 shrink-0" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-800" title={entry.fileName}>
                      {entry.fileName}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {formatDateTime(entry.createdAt)} • {entry.pageCount} pages • {formatBytes(entry.fileSize)}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Download ${entry.fileName}`}
                    title="Download"
                    disabled={busyId === entry.id}
                    onClick={() => downloadBlob(entry.pdfBlob, entry.fileName)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    Download
                  </button>
                  <button
                    type="button"
                    aria-label={`Open ${entry.fileName} in the editor`}
                    title="Open in editor"
                    disabled={busyId === entry.id}
                    onClick={() => openFromHistory(entry.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 disabled:opacity-50"
                  >
                    {busyId === entry.id ? (
                      <LoaderCircle className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <FolderOpen className="w-3.5 h-3.5" aria-hidden="true" />
                    )}
                    Open
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {recent.length === 0 && (
          <div className="mt-10 flex items-center justify-center gap-2 text-sm text-zinc-400">
            <Clock className="w-4 h-4" aria-hidden="true" />
            <span>Exported PDFs will appear here as recent files.</span>
          </div>
        )}
      </main>

      <footer className="border-t border-zinc-200 bg-white">
        <ul className="max-w-3xl mx-auto px-6 pt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-zinc-500">
          {["Local processing", "No document upload", "No account required", "Local editing history"].map((item) => (
            <li key={item} className="flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
        <p className="max-w-3xl mx-auto px-6 pb-4 pt-2 text-center text-xs text-zinc-500">
          Built by <span className="font-medium text-zinc-700">Jon Peciña</span>
          {" · "}
          <span className="font-medium text-zinc-700">jpecina@gmail.com</span>
        </p>
      </footer>
    </div>
  );
}

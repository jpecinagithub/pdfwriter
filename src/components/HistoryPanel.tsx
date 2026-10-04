/**
 * HistoryPanel — fixed right drawer listing the locally stored export
 * history (newest first). Each card offers Download, Open and Delete.
 */
import { useEffect, useState } from "react";
import { Clock, Download, FolderOpen, Trash, X } from "lucide-react";
import { useEditor } from "../editor/store";
import { openPdfBlob } from "../pdf/openFlow";
import {
  MAX_HISTORY_ITEMS,
  clearHistory,
  deleteHistoryEntry,
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

function HistoryCard({
  entry,
  onDeleted,
}: {
  entry: PdfHistoryEntry;
  onDeleted: () => void;
}): React.ReactElement {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!entry.thumbnail) {
      setThumbUrl(null);
      return;
    }
    const url = URL.createObjectURL(entry.thumbnail);
    setThumbUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [entry.thumbnail]);

  const open = (): void => {
    setBusy(true);
    void getHistoryEntry(entry.id)
      .then((fresh) => {
        if (fresh) return openPdfBlob(fresh.pdfBlob, fresh.fileName);
      })
      .finally(() => setBusy(false));
  };

  const remove = (): void => {
    void deleteHistoryEntry(entry.id).then(() => onDeleted());
  };

  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex gap-3">
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt=""
            className="w-14 h-18 shrink-0 rounded border border-zinc-200 object-cover bg-zinc-100"
          />
        ) : (
          <div className="w-14 h-18 shrink-0 rounded border border-zinc-200 bg-zinc-100 flex items-center justify-center">
            <Clock className="w-5 h-5 text-zinc-300" aria-hidden="true" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-zinc-800" title={entry.fileName}>
            {entry.fileName}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {formatDateTime(entry.createdAt)} • {entry.pageCount} pages • {formatBytes(entry.fileSize)}
          </p>
        </div>
      </div>
      <div className="mt-2.5 flex gap-1.5">
        <button
          type="button"
          aria-label={`Download ${entry.fileName}`}
          onClick={() => downloadBlob(entry.pdfBlob, entry.fileName)}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-zinc-200 px-2 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <Download className="w-3.5 h-3.5" aria-hidden="true" />
          Download
        </button>
        <button
          type="button"
          aria-label={`Open ${entry.fileName} in the editor`}
          disabled={busy}
          onClick={open}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
        >
          <FolderOpen className="w-3.5 h-3.5" aria-hidden="true" />
          Open
        </button>
        <button
          type="button"
          aria-label={`Delete ${entry.fileName} from history`}
          title="Delete"
          onClick={remove}
          className="inline-flex items-center justify-center rounded-lg border border-zinc-200 px-2 py-1.5 text-xs font-medium text-zinc-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
        >
          <Trash className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}

export default function HistoryPanel(): React.ReactElement | null {
  const historyOpen = useEditor((s) => s.historyOpen);
  const setHistoryOpen = useEditor((s) => s.setHistoryOpen);

  const [entries, setEntries] = useState<PdfHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = (): void => {
    setLoading(true);
    void listHistory()
      .then(setEntries)
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (historyOpen) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyOpen]);

  if (!historyOpen) return null;

  const clearAll = (): void => {
    const ok = window.confirm("Delete all recent PDFs? This cannot be undone.");
    if (!ok) return;
    void clearHistory().then(() => refresh());
  };

  return (
    <aside
      className="fixed right-0 top-0 h-full w-80 bg-white shadow-2xl z-40 flex flex-col border-l border-zinc-200"
      role="dialog"
      aria-label="Recent PDFs"
    >
      <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-b border-zinc-200">
        <h2 className="text-sm font-semibold text-zinc-900">Recent PDFs</h2>
        <span className="text-xs text-zinc-500">
          ({entries.length} of {MAX_HISTORY_ITEMS})
        </span>
        <div className="flex-1" />
        <button
          type="button"
          aria-label="Clear history"
          title="Clear history"
          onClick={clearAll}
          className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-zinc-500 hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
        >
          <Trash className="w-4 h-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Close history panel"
          onClick={() => setHistoryOpen(false)}
          className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {loading && entries.length === 0 && (
          <p className="text-center text-sm text-zinc-500 py-8">Loading history…</p>
        )}
        {!loading && entries.length === 0 && (
          <div className="flex flex-col items-center text-center py-12 px-6">
            <Clock className="w-10 h-10 text-zinc-300" aria-hidden="true" />
            <p className="mt-3 text-sm text-zinc-500">
              No recent PDFs yet. Exported PDFs will appear here.
            </p>
          </div>
        )}
        {entries.map((entry) => (
          <HistoryCard key={entry.id} entry={entry} onDeleted={refresh} />
        ))}
      </div>

      <p className="shrink-0 px-4 py-3 border-t border-zinc-200 text-[11px] leading-relaxed text-zinc-500">
        Stored locally in your browser only. Clearing site data removes this history.
      </p>
    </aside>
  );
}

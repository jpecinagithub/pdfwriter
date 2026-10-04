/**
 * StorageDialog — shows the approximate local-storage usage reported by the
 * browser and offers persistent-storage + history management actions.
 */
import { useEffect, useState } from "react";
import { Database, LoaderCircle, X } from "lucide-react";
import { useEditor } from "../../editor/store";
import { getStorageEstimate, requestPersistence, type StorageEstimate } from "../../storage/storageManager";
import { formatBytes } from "../../utils/filename";

export default function StorageDialog(): React.ReactElement | null {
  const storageDialogOpen = useEditor((s) => s.storageDialogOpen);
  const setStorageDialogOpen = useEditor((s) => s.setStorageDialogOpen);
  const setHistoryOpen = useEditor((s) => s.setHistoryOpen);

  const [estimate, setEstimate] = useState<StorageEstimate | null>(null);
  const [loading, setLoading] = useState(false);
  const [persistence, setPersistence] = useState<"unknown" | "enabled" | "denied">("unknown");
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    if (!storageDialogOpen) return;
    setLoading(true);
    setPersistence("unknown");
    void getStorageEstimate()
      .then(setEstimate)
      .finally(() => setLoading(false));
  }, [storageDialogOpen]);

  if (!storageDialogOpen) return null;

  const close = (): void => setStorageDialogOpen(false);

  const keepFiles = async (): Promise<void> => {
    setRequesting(true);
    try {
      const granted = await requestPersistence();
      setPersistence(granted ? "enabled" : "denied");
    } finally {
      setRequesting(false);
    }
  };

  const hasEstimate = estimate !== null && estimate.quotaBytes > 0;

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
        aria-label="Local storage"
        className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-zinc-200"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200">
          <h2 className="inline-flex items-center gap-2 text-base font-semibold text-zinc-900">
            <Database className="w-4.5 h-4.5 text-zinc-500" aria-hidden="true" />
            Local storage
          </h2>
          <button
            type="button"
            aria-label="Close storage dialog"
            onClick={close}
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-zinc-500 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {loading ? (
            <p className="flex items-center gap-2 text-sm text-zinc-500">
              <LoaderCircle className="w-4 h-4 animate-spin" aria-hidden="true" />
              Reading storage info…
            </p>
          ) : hasEstimate && estimate ? (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3.5 space-y-1.5">
              <p className="text-sm text-zinc-800">
                <span className="font-medium">Used:</span> {formatBytes(estimate.usedBytes)}
              </p>
              <p className="text-sm text-zinc-800">
                <span className="font-medium">Available:</span> approximately{" "}
                {formatBytes(Math.max(0, estimate.quotaBytes - estimate.usedBytes))}
              </p>
              <div className="pt-1">
                <div className="h-2 rounded-full bg-zinc-200 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-600"
                    style={{ width: `${estimate.usagePercent}%` }}
                    aria-hidden="true"
                  />
                </div>
                <p className="mt-1 text-xs text-zinc-500">{estimate.usagePercent.toFixed(1)}% of quota used</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-zinc-600">Storage info is not available in this browser.</p>
          )}

          <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 p-3.5">
            <div>
              <p className="text-sm font-medium text-zinc-800">Persistent storage</p>
              <p className="text-xs text-zinc-500" aria-live="polite">
                {persistence === "enabled" && "Persistence enabled — the browser will try to keep your files."}
                {persistence === "denied" && "Not granted — PDFWriter keeps working normally."}
                {persistence === "unknown" && "Ask the browser not to evict your local files under storage pressure."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void keepFiles()}
              disabled={requesting || persistence === "enabled"}
              className="shrink-0 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
            >
              {requesting ? "Requesting…" : "Keep my files"}
            </button>
          </div>

          <p className="text-xs leading-relaxed text-zinc-500">
            PDFWriter stores recent files locally in your browser. Browser data can be removed by your browser or
            manually by you.
          </p>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setHistoryOpen(true);
                setStorageDialogOpen(false);
              }}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              Manage history
            </button>
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
      </div>
    </div>
  );
}

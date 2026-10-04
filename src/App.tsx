/**
 * PDFWriter — App shell.
 *
 * - Initializes autosave + persistent-storage request.
 * - Restores the last editing session when possible.
 * - Global keyboard shortcuts.
 * - Switches between the upload screen and the editor.
 */
import { useCallback, useEffect, useState } from "react";
import { Analytics } from "@vercel/analytics/react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import UploadScreen from "./components/UploadScreen";
import { EditorShell } from "./components/EditorShell";
import { getEditById, useEditor } from "./editor/store";
import { displaySize } from "./types/pdf";
import { TOOLS } from "./editor/tools";
import {
  getLastProjectId,
  initAutosave,
  restoreSession,
  setLastProjectId,
} from "./storage/autosave";
import { requestPersistence } from "./storage/storageManager";

function pasteAtCenter(): void {
  const s = useEditor.getState();
  const page = s.pages[s.currentPageIndex] ?? s.pages[0];
  if (!page) return;
  const { width, height } = displaySize(page);
  s.pasteFromClipboard(page.id, { x: width / 2 - 60, y: height / 2 - 40 });
}

export default function App(): React.ReactElement {
  const docStatus = useEditor((s) => s.docStatus);
  const [restoring, setRestoring] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 4000);
  }, []);

  // Init: autosave subscription + persistent storage request.
  useEffect(() => {
    const unsub = initAutosave();
    void requestPersistence().catch(() => undefined);
    return unsub;
  }, []);

  // Restore the last session (once).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const lastId = getLastProjectId();
        if (lastId && useEditor.getState().docStatus === "empty") {
          const res = await restoreSession(lastId);
          if (cancelled) return;
          if (res === "restored") showToast("Previous editing session restored.");
          else if (res === "failed") setLastProjectId(null);
        }
      } catch {
        /* start fresh */
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showToast]);

  // Global keyboard shortcuts.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const s = useEditor.getState();
      if (s.docStatus !== "ready") return;
      const t = e.target as HTMLElement | null;
      const typing =
        !!t && (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t.isContentEditable);
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (e.key === "Escape") {
        if (s.exportDialogOpen) s.setExportDialogOpen(false);
        else if (s.signatureDialogOpen) s.setSignatureDialogOpen(false);
        else if (s.appendDialogOpen) s.setAppendDialogOpen(false);
        else if (s.storageDialogOpen) s.setStorageDialogOpen(false);
        else if (s.privacyOpen) s.setPrivacyOpen(false);
        else if (s.aboutOpen) s.setAboutOpen(false);
        else if (s.historyOpen) s.setHistoryOpen(false);
        else if (s.selectedIds.length > 0) s.clearSelection();
        else if (s.activeTool !== "select") s.setActiveTool("select");
        return;
      }

      // Native undo inside inputs must keep working.
      if (mod && key === "z" && !typing) {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (typing) return;

      if (mod && key === "s") {
        e.preventDefault();
        s.setExportDialogOpen(true);
        return;
      }
      if (mod && key === "c") {
        if (s.selectedIds.length > 0) s.copySelected();
        return;
      }
      if (mod && key === "x") {
        if (s.selectedIds.length > 0) s.cutSelected();
        return;
      }
      if (mod && key === "v") {
        pasteAtCenter();
        return;
      }
      if (mod && key === "d") {
        e.preventDefault();
        if (s.selectedIds.length > 0) s.duplicateEdits(s.selectedIds);
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (s.selectedIds.length > 0) {
          e.preventDefault();
          s.deleteEdits(s.selectedIds);
        }
        return;
      }
      if (e.key.startsWith("Arrow") && s.selectedIds.length > 0) {
        e.preventDefault();
        if (!e.repeat) s.checkpoint();
        const d = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -d : e.key === "ArrowRight" ? d : 0;
        const dy = e.key === "ArrowUp" ? -d : e.key === "ArrowDown" ? d : 0;
        for (const id of s.selectedIds) {
          const ed = getEditById(s.edits, id);
          if (!ed) continue;
          const nx = ed.x + dx;
          const ny = ed.y + dy;
          if (ed.type === "freehand") {
            s.patchEdit(id, { x: nx, y: ny, points: ed.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) });
          } else {
            s.patchEdit(id, { x: nx, y: ny });
          }
        }
        return;
      }
      if (!mod && e.key.length === 1) {
        const tool = TOOLS.find((x) => x.shortcut?.toLowerCase() === key);
        if (tool) s.setActiveTool(tool.id);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <ErrorBoundary>
      <div className="h-full">
        {docStatus === "ready" ? (
          <EditorShell />
        ) : (
          <UploadScreen restoring={restoring} />
        )}
        {toast && (
          <div
            className="fixed bottom-6 left-1/2 z-[100] -translate-x-1/2 rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white shadow-xl"
            role="status"
          >
            {toast}
          </div>
        )}
        <Analytics />
      </div>
    </ErrorBoundary>
  );
}

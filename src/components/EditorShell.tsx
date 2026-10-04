/**
 * EditorShell — the desktop-class editor layout:
 * top bar / left panel / canvas / inspector / bottom toolbar + dialogs.
 */
import { memo, useEffect, useState } from "react";
import { X } from "lucide-react";
import { useEditor } from "../editor/store";
import TopBar from "./TopBar";
import BottomToolbar from "./BottomToolbar";
import PageThumbnails from "./PageThumbnails";
import { SearchPanel } from "./SearchPanel";
import { PropertiesPanel } from "./PropertiesPanel";
import { PdfCanvas } from "./PdfCanvas";
import HistoryPanel from "./HistoryPanel";
import ExportDialog from "./dialogs/ExportDialog";
import StorageDialog from "./dialogs/StorageDialog";
import PrivacyDialog from "./dialogs/PrivacyDialog";
import AboutDialog from "./dialogs/AboutDialog";
import SignatureDialog from "./dialogs/SignatureDialog";
import AppendPdfDialog from "./dialogs/AppendPdfDialog";

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 1024,
  );
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 1024);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return narrow;
}

export const EditorShell = memo(function EditorShell(): React.ReactElement {
  const leftPanel = useEditor((s) => s.leftPanel);
  const setLeftPanel = useEditor((s) => s.setLeftPanel);
  const rightPanelOpen = useEditor((s) => s.rightPanelOpen);
  const setRightPanelOpen = useEditor((s) => s.setRightPanelOpen);
  const historyOpen = useEditor((s) => s.historyOpen);
  const setCurrentPageIndex = useEditor((s) => s.setCurrentPageIndex);

  const narrow = useNarrow();
  const [noticeDismissed, setNoticeDismissed] = useState(false);

  // On narrow screens, collapse the side panels by default.
  useEffect(() => {
    if (narrow) {
      setLeftPanel(null);
      setRightPanelOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [narrow]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-zinc-100">
      <TopBar />
      {narrow && !noticeDismissed && (
        <div className="flex items-center justify-between bg-amber-50 px-4 py-1.5 text-xs text-amber-900">
          <span>PDFWriter works best on a tablet or desktop.</span>
          <button
            type="button"
            onClick={() => setNoticeDismissed(true)}
            className="pw-focus rounded p-0.5 hover:bg-amber-100"
            aria-label="Dismiss notice"
          >
            <X size={14} />
          </button>
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        {leftPanel === "pages" && (
          <aside className="w-52 shrink-0 border-r border-zinc-200 bg-white" aria-label="Pages panel">
            <PageThumbnails onJumpToPage={(i) => setCurrentPageIndex(i)} />
          </aside>
        )}
        {leftPanel === "search" && (
          <aside className="w-72 shrink-0 border-r border-zinc-200" aria-label="Search panel">
            <SearchPanel />
          </aside>
        )}
        <main className="flex min-w-0 flex-1">
          <PdfCanvas />
        </main>
        {rightPanelOpen && (
          <aside className="w-72 shrink-0 border-l border-zinc-200" aria-label="Inspector panel">
            <PropertiesPanel />
          </aside>
        )}
      </div>
      <BottomToolbar />

      {/* dialogs & drawers */}
      <ExportDialog />
      <StorageDialog />
      <PrivacyDialog />
      <AboutDialog />
      <SignatureDialog />
      <AppendPdfDialog />
      {historyOpen && <HistoryPanel />}
    </div>
  );
});

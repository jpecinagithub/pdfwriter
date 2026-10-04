/**
 * EditorShell — the desktop-class editor layout:
 * top bar / left panel / canvas / inspector / bottom toolbar + dialogs.
 */
import { memo, useEffect, useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
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

function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 768,
  );
  useEffect(() => {
    const onResize = () => setMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return mobile;
}

export const EditorShell = memo(function EditorShell(): React.ReactElement {
  const leftPanel = useEditor((s) => s.leftPanel);
  const setLeftPanel = useEditor((s) => s.setLeftPanel);
  const rightPanelOpen = useEditor((s) => s.rightPanelOpen);
  const setRightPanelOpen = useEditor((s) => s.setRightPanelOpen);
  const historyOpen = useEditor((s) => s.historyOpen);
  const setCurrentPageIndex = useEditor((s) => s.setCurrentPageIndex);

  const narrow = useNarrow();
  const isMobile = useIsMobile();

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
      <div className="flex min-h-0 flex-1 relative">
        {leftPanel === "pages" && (
          <>
            {isMobile && (
              <div
                className="fixed inset-0 z-40 bg-zinc-950/40 md:hidden"
                onClick={() => setLeftPanel(null)}
                aria-hidden="true"
              />
            )}
            <aside
              className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] shrink-0 border-r border-zinc-200 bg-white shadow-2xl md:static md:z-auto md:w-52 md:max-w-none md:shadow-none"
              aria-label="Pages panel"
            >
              <PageThumbnails
                onJumpToPage={(i) => {
                  setCurrentPageIndex(i);
                  if (isMobile) setLeftPanel(null);
                }}
              />
            </aside>
          </>
        )}
        {leftPanel === "search" && (
          <>
            {isMobile && (
              <div
                className="fixed inset-0 z-40 bg-zinc-950/40 md:hidden"
                onClick={() => setLeftPanel(null)}
                aria-hidden="true"
              />
            )}
            <aside
              className="fixed inset-y-0 left-0 z-50 w-80 max-w-[85vw] shrink-0 border-r border-zinc-200 bg-white shadow-2xl md:static md:z-auto md:w-72 md:max-w-none md:shadow-none"
              aria-label="Search panel"
            >
              <SearchPanel />
            </aside>
          </>
        )}
        <main className="flex min-w-0 flex-1">
          <PdfCanvas />
        </main>
        {rightPanelOpen && (
          <>
            {isMobile && (
              <div
                className="fixed inset-0 z-40 bg-zinc-950/40 md:hidden"
                onClick={() => setRightPanelOpen(false)}
                aria-hidden="true"
              />
            )}
            <aside
              className="fixed inset-y-0 right-0 z-50 flex w-80 max-w-[90vw] shrink-0 flex-col border-l border-zinc-200 bg-white shadow-2xl md:static md:z-auto md:w-72 md:max-w-none md:shadow-none"
              aria-label="Inspector panel"
            >
              <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-2 md:hidden">
                <span className="text-sm font-semibold text-zinc-900">Inspector</span>
                <button
                  type="button"
                  aria-label="Close inspector"
                  onClick={() => setRightPanelOpen(false)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
              <div className="min-h-0 flex-1">
                <PropertiesPanel />
              </div>
            </aside>
          </>
        )}
        {isMobile && !rightPanelOpen && (
          <button
            type="button"
            aria-label="Open inspector"
            title="Inspector"
            onClick={() => setRightPanelOpen(true)}
            className="fixed bottom-24 right-3 z-30 inline-flex h-11 w-11 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 md:hidden"
          >
            <SlidersHorizontal className="w-5 h-5" aria-hidden="true" />
          </button>
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

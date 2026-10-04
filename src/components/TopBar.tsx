/**
 * TopBar — document header: brand + filename + autosave state, undo/redo +
 * zoom + page navigation, and document-level actions (search, history,
 * storage, privacy, download, close).
 */
import { useEffect, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Database,
  Download,
  FileText,
  Info,
  LoaderCircle,
  MoreVertical,
  PanelLeft,
  Redo2,
  Search,
  ShieldCheck,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEditor } from "../editor/store";
import { ZOOM_PRESETS, type ZoomValue } from "../types/pdf";
import { discardSession, getAutosaveState, onAutosaveState, type AutosaveState } from "../storage/autosave";

function zoomKey(z: ZoomValue): string {
  if (z.mode === "fit-width") return "fit-width";
  if (z.mode === "fit-page") return "fit-page";
  return `scale:${z.scale}`;
}

function AutosaveIndicator(): React.ReactElement | null {
  const [state, setState] = useState<AutosaveState>(() => getAutosaveState());
  useEffect(() => onAutosaveState(setState), []);
  if (state === "saving") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500" aria-live="polite">
        <LoaderCircle className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
        Saving…
      </span>
    );
  }
  if (state === "saved") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600" aria-live="polite">
        <Check className="w-3.5 h-3.5" aria-hidden="true" />
        Saved locally
      </span>
    );
  }
  if (state === "error") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-red-600" aria-live="polite">
        Save failed
      </span>
    );
  }
  return null;
}

function IconButton({
  label,
  onClick,
  disabled,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-zinc-600 hover:bg-zinc-200/70 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-40 disabled:pointer-events-none ${
        active ? "bg-blue-100 text-blue-700" : ""
      }`}
    >
      {children}
    </button>
  );
}

export default function TopBar(): React.ReactElement {
  const fileName = useEditor((s) => s.fileName);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const undoEmpty = useEditor((s) => s.undoStack.length === 0);
  const redoEmpty = useEditor((s) => s.redoStack.length === 0);
  const zoom = useEditor((s) => s.zoom);
  const setZoom = useEditor((s) => s.setZoom);
  const currentPageIndex = useEditor((s) => s.currentPageIndex);
  const setCurrentPageIndex = useEditor((s) => s.setCurrentPageIndex);
  const pageCount = useEditor((s) => s.pages.length);
  const edits = useEditor((s) => s.edits);
  const leftPanel = useEditor((s) => s.leftPanel);
  const setLeftPanel = useEditor((s) => s.setLeftPanel);
  const setHistoryOpen = useEditor((s) => s.setHistoryOpen);
  const setStorageDialogOpen = useEditor((s) => s.setStorageDialogOpen);
  const setPrivacyOpen = useEditor((s) => s.setPrivacyOpen);
  const setAboutOpen = useEditor((s) => s.setAboutOpen);
  const setExportDialogOpen = useEditor((s) => s.setExportDialogOpen);

  const currentScale = zoom.mode === "scale" ? zoom.scale : 1;
  const zoomIn = (): void => {
    const next = ZOOM_PRESETS.find((p) => p > currentScale + 1e-9) ?? 2;
    setZoom({ mode: "scale", scale: next });
  };
  const zoomOut = (): void => {
    const prev = [...ZOOM_PRESETS].reverse().find((p) => p < currentScale - 1e-9) ?? 0.5;
    setZoom({ mode: "scale", scale: prev });
  };

  const goPage = (delta: number): void => {
    if (pageCount === 0) return;
    setCurrentPageIndex(Math.max(0, Math.min(pageCount - 1, currentPageIndex + delta)));
  };

  const closeDocument = (): void => {
    if (edits.length > 0) {
      const ok = window.confirm("Close this document? Unsaved changes are autosaved locally.");
      if (!ok) return;
    }
    void discardSession();
  };

  const [moreOpen, setMoreOpen] = useState(false);
  const closeMore = (): void => setMoreOpen(false);

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setMoreOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  const MORE_ITEMS: Array<{ label: string; Icon: typeof Search; action: () => void }> = [
    { label: "Search in document", Icon: Search, action: () => setLeftPanel(leftPanel === "search" ? null : "search") },
    { label: "Recent PDFs", Icon: Clock, action: () => setHistoryOpen(true) },
    { label: "Local storage", Icon: Database, action: () => setStorageDialogOpen(true) },
    { label: "Privacy", Icon: ShieldCheck, action: () => setPrivacyOpen(true) },
    { label: "About PDFWriter", Icon: Info, action: () => setAboutOpen(true) },
    { label: "Close document", Icon: X, action: closeDocument },
  ];

  const zoomControls = (
    <>
      <IconButton label="Zoom out" onClick={zoomOut}>
        <ZoomOut className="w-4 h-4" aria-hidden="true" />
      </IconButton>
      <select
        aria-label="Zoom level"
        title="Zoom level"
        value={zoomKey(zoom)}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "fit-width") setZoom({ mode: "fit-width" });
          else if (v === "fit-page") setZoom({ mode: "fit-page" });
          else setZoom({ mode: "scale", scale: Number(v.replace("scale:", "")) });
        }}
        className="h-8 rounded-lg border border-zinc-200 bg-white px-1.5 text-xs font-medium text-zinc-700 hover:border-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        {ZOOM_PRESETS.map((p) => (
          <option key={p} value={`scale:${p}`}>
            {Math.round(p * 100)}%
          </option>
        ))}
        <option value="fit-width">Fit Width</option>
        <option value="fit-page">Fit Page</option>
      </select>
      <IconButton label="Zoom in" onClick={zoomIn}>
        <ZoomIn className="w-4 h-4" aria-hidden="true" />
      </IconButton>
    </>
  );

  const pageNav = (
    <>
      <IconButton label="Previous page" onClick={() => goPage(-1)} disabled={currentPageIndex <= 0}>
        <ChevronLeft className="w-4 h-4" aria-hidden="true" />
      </IconButton>
      <span className="text-xs text-zinc-600 tabular-nums min-w-14 text-center" aria-live="polite">
        {pageCount > 0 ? currentPageIndex + 1 : 0} / {pageCount}
      </span>
      <IconButton
        label="Next page"
        onClick={() => goPage(1)}
        disabled={currentPageIndex >= pageCount - 1}
      >
        <ChevronRight className="w-4 h-4" aria-hidden="true" />
      </IconButton>
    </>
  );

  return (
    <header className="shrink-0 bg-white border-b border-zinc-200 shadow-sm z-30">
      {/* Row 1 */}
      <div className="h-14 flex items-center gap-1.5 px-2 sm:gap-2 sm:px-3">
        {/* Left: brand + file */}
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
          <span className="md:hidden">
            <IconButton
              label="Toggle pages panel"
              active={leftPanel === "pages"}
              onClick={() => setLeftPanel(leftPanel === "pages" ? null : "pages")}
            >
              <PanelLeft className="w-4 h-4" aria-hidden="true" />
            </IconButton>
          </span>
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
            <FileText className="w-4.5 h-4.5 text-white" aria-hidden="true" />
          </div>
          <span className="text-sm font-bold tracking-tight hidden sm:inline">PDFWriter</span>
          <span
            className="text-sm text-zinc-500 truncate max-w-28 sm:max-w-48 md:max-w-64"
            title={fileName}
          >
            {fileName}
          </span>
          <span className="hidden sm:inline">
            <AutosaveIndicator />
          </span>
        </div>

        {/* Undo/redo — always visible */}
        <div className="flex items-center gap-1">
          <IconButton label="Undo (Ctrl+Z)" onClick={undo} disabled={undoEmpty}>
            <Undo2 className="w-4 h-4" aria-hidden="true" />
          </IconButton>
          <IconButton label="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={redoEmpty}>
            <Redo2 className="w-4 h-4" aria-hidden="true" />
          </IconButton>
        </div>

        {/* Center: desktop only */}
        <div className="hidden md:flex items-center gap-1">
          <span className="w-px h-6 bg-zinc-200 mx-1" aria-hidden="true" />
          {zoomControls}
          <span className="w-px h-6 bg-zinc-200 mx-1" aria-hidden="true" />
          {pageNav}
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-1 flex-1 justify-end">
          <div className="hidden md:flex items-center gap-1">
            <IconButton
              label="Search in document"
              onClick={() => setLeftPanel(leftPanel === "search" ? null : "search")}
              active={leftPanel === "search"}
            >
              <Search className="w-4 h-4" aria-hidden="true" />
            </IconButton>
            <IconButton label="Recent PDFs" onClick={() => setHistoryOpen(true)}>
              <Clock className="w-4 h-4" aria-hidden="true" />
            </IconButton>
            <IconButton label="Local storage" onClick={() => setStorageDialogOpen(true)}>
              <Database className="w-4 h-4" aria-hidden="true" />
            </IconButton>
            <IconButton label="Privacy" onClick={() => setPrivacyOpen(true)}>
              <ShieldCheck className="w-4 h-4" aria-hidden="true" />
            </IconButton>
            <IconButton label="About PDFWriter" onClick={() => setAboutOpen(true)}>
              <Info className="w-4 h-4" aria-hidden="true" />
            </IconButton>
          </div>
          <div className="relative md:hidden">
            <IconButton label="More actions" active={moreOpen} onClick={() => setMoreOpen((v) => !v)}>
              <MoreVertical className="w-4 h-4" aria-hidden="true" />
            </IconButton>
            {moreOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={closeMore} aria-hidden="true" />
                <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-xl border border-zinc-200 bg-white py-1 shadow-xl">
                  {MORE_ITEMS.map(({ label, Icon, action }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => {
                        action();
                        closeMore();
                      }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-zinc-700 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
                    >
                      <Icon className="w-4 h-4 text-zinc-500" aria-hidden="true" />
                      {label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={() => setExportDialogOpen(true)}
            aria-label="Download PDF"
            className="ml-1 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 h-8 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
            title="Export and download the PDF"
          >
            <Download className="w-4 h-4" aria-hidden="true" />
            <span className="hidden md:inline">Download PDF</span>
          </button>
          <IconButton label="Close document" onClick={closeDocument}>
            <X className="w-4 h-4" aria-hidden="true" />
          </IconButton>
        </div>
      </div>

      {/* Row 2: page nav + zoom — mobile only */}
      <div className="md:hidden flex items-center justify-between gap-2 px-2 pb-2">
        <div className="flex items-center gap-1">{pageNav}</div>
        <div className="flex items-center gap-1">{zoomControls}</div>
      </div>
    </header>
  );
}

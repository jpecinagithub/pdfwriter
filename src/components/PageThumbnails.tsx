/**
 * PageThumbnails — left panel: page list with thumbnails, drag-to-reorder
 * and per-page hover actions (rotate, duplicate, insert blank, delete).
 */
import { useState } from "react";
import {
  Copy,
  FilePlus,
  Plus,
  RotateCcw,
  RotateCw,
  Trash,
} from "lucide-react";
import { useEditor } from "../editor/store";
import { PageThumbnail } from "./PageThumbnail";

function ActionButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-white/95 text-zinc-600 shadow-sm border border-zinc-200 hover:bg-white hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-40 disabled:pointer-events-none"
    >
      {children}
    </button>
  );
}

export default function PageThumbnails({
  onJumpToPage,
}: {
  onJumpToPage: (index: number) => void;
}): React.ReactElement {
  const pages = useEditor((s) => s.pages);
  const currentPageIndex = useEditor((s) => s.currentPageIndex);
  const setCurrentPageIndex = useEditor((s) => s.setCurrentPageIndex);
  const movePage = useEditor((s) => s.movePage);
  const rotatePage = useEditor((s) => s.rotatePage);
  const duplicatePage = useEditor((s) => s.duplicatePage);
  const insertBlankPage = useEditor((s) => s.insertBlankPage);
  const deletePages = useEditor((s) => s.deletePages);
  const setAppendDialogOpen = useEditor((s) => s.setAppendDialogOpen);

  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const handleDrop = (index: number): void => {
    if (dragFrom !== null && dragFrom !== index) movePage(dragFrom, index);
    setDragFrom(null);
    setDragOver(null);
  };

  return (
    <div className="h-full flex flex-col bg-zinc-50 border-r border-zinc-200">
      <div className="shrink-0 flex items-center gap-2 px-3 py-2.5 border-b border-zinc-200">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Pages</h2>
        <span className="inline-flex items-center rounded-full bg-zinc-200 px-2 py-0.5 text-[11px] font-medium text-zinc-700">
          {pages.length}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          aria-label="Append PDF"
          title="Append PDF"
          onClick={() => setAppendDialogOpen(true)}
          className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2" role="list" aria-label="Document pages">
        {pages.map((page, index) => {
          const isCurrent = index === currentPageIndex;
          return (
            <div
              key={page.id}
              role="listitem"
              draggable
              onDragStart={(e) => {
                setDragFrom(index);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(index);
              }}
              onDragLeave={() => setDragOver((v) => (v === index ? null : v))}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(index);
              }}
              onDragEnd={() => {
                setDragFrom(null);
                setDragOver(null);
              }}
              onClick={() => {
                setCurrentPageIndex(index);
                onJumpToPage(index);
              }}
              className={`group relative rounded-lg border bg-white p-1.5 cursor-pointer transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                isCurrent ? "border-blue-500 ring-2 ring-blue-200" : "border-zinc-200"
              } ${dragOver === index && dragFrom !== index ? "ring-2 ring-blue-300 border-blue-400" : ""} ${
                dragFrom === index ? "opacity-50" : ""
              }`}
              tabIndex={0}
              aria-label={`Page ${index + 1}`}
              aria-current={isCurrent ? "true" : undefined}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setCurrentPageIndex(index);
                  onJumpToPage(index);
                }
              }}
            >
              <PageThumbnail pageId={page.id} className="w-full h-auto rounded" />
              <div className="flex items-center justify-center pt-1">
                <span className="text-[11px] font-medium text-zinc-500 tabular-nums">{index + 1}</span>
              </div>
              <div className="absolute top-1 right-1 hidden group-hover:flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <ActionButton label={`Rotate page ${index + 1} counter-clockwise`} onClick={() => rotatePage(page.id, -1)}>
                  <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                </ActionButton>
                <ActionButton label={`Rotate page ${index + 1} clockwise`} onClick={() => rotatePage(page.id, 1)}>
                  <RotateCw className="w-3.5 h-3.5" aria-hidden="true" />
                </ActionButton>
                <ActionButton label={`Duplicate page ${index + 1}`} onClick={() => duplicatePage(page.id)}>
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                </ActionButton>
                <ActionButton label={`Insert blank page after page ${index + 1}`} onClick={() => insertBlankPage(index)}>
                  <FilePlus className="w-3.5 h-3.5" aria-hidden="true" />
                </ActionButton>
                <ActionButton
                  label={`Delete page ${index + 1}`}
                  onClick={() => deletePages([page.id])}
                  disabled={pages.length === 1}
                >
                  <Trash className="w-3.5 h-3.5" aria-hidden="true" />
                </ActionButton>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

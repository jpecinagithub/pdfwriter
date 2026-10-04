/**
 * Global editor state (zustand).
 *
 * Separation (spec §35):
 * - document state: docStatus, fileName, pages
 * - editor state: edits, activeTool, toolOptions
 * - selection state: selectedIds
 * - UI state: zoom, panels, dialogs
 *
 * Binary data (PDF bytes, pdf.js docs, image blobs) lives in editor/session.ts,
 * never here. Undo snapshots therefore stay small and serializable.
 */
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { PageMeta, ZoomValue } from "../types/pdf";
import type { PdfEdit } from "../types/editor";
import { DEFAULT_TOOL_OPTIONS, type ToolId, type ToolOptions } from "./tools";
import { session } from "./session";
import { nanoid } from "../utils/id";

export interface HistorySnapshot {
  edits: PdfEdit[];
  pages: PageMeta[];
}

const MAX_UNDO = 50;

function snapshot(edits: PdfEdit[], pages: PageMeta[]): HistorySnapshot {
  return { edits: structuredClone(edits), pages: structuredClone(pages) };
}

function normalizeZ(edits: PdfEdit[]): PdfEdit[] {
  // Reassign z per page to a dense 0..n ordering preserving relative order.
  const byPage = new Map<string, PdfEdit[]>();
  for (const e of edits) {
    const arr = byPage.get(e.pageId) ?? [];
    arr.push(e);
    byPage.set(e.pageId, arr);
  }
  const zOf = new Map<string, number>();
  for (const [, arr] of byPage) {
    arr.sort((a, b) => a.z - b.z);
    arr.forEach((e) => zOf.set(e.id, arr.indexOf(e)));
  }
  return edits.map((e) => ({ ...e, z: zOf.get(e.id) ?? 0 }));
}

interface EditorState {
  // ---- document ----
  docStatus: "empty" | "loading" | "ready" | "error";
  loadError: string | null;
  loadProgress: string | null;
  fileName: string;
  pages: PageMeta[];

  // ---- edits ----
  edits: PdfEdit[];

  // ---- selection ----
  selectedIds: string[];

  // ---- tools ----
  activeTool: ToolId;
  toolOptions: ToolOptions;

  // ---- view ----
  zoom: ZoomValue;
  currentPageIndex: number;

  // ---- ui ----
  leftPanel: "pages" | "search" | null;
  rightPanelOpen: boolean;
  exportDialogOpen: boolean;
  historyOpen: boolean;
  storageDialogOpen: boolean;
  privacyOpen: boolean;
  aboutOpen: boolean;
  signatureDialogOpen: boolean;
  appendDialogOpen: boolean;

  // ---- undo ----
  undoStack: HistorySnapshot[];
  redoStack: HistorySnapshot[];

  // ---- actions: document ----
  setLoading: (progress: string | null) => void;
  openDocument: (fileName: string, pages: PageMeta[]) => void;
  setLoadError: (message: string) => void;
  closeDocument: () => void;

  // ---- actions: undo ----
  checkpoint: () => void;
  undo: () => void;
  redo: () => void;
  clearUndo: () => void;

  // ---- actions: edits ----
  addEdit: (edit: PdfEdit) => void;
  addEdits: (edits: PdfEdit[]) => void;
  /** Patch without touching undo history (transient drag state). */
  patchEdit: (id: string, patch: Partial<PdfEdit>) => void;
  /** Patch + push one undo step. */
  commitEdit: (id: string, patch: Partial<PdfEdit>) => void;
  /** Patch several edits with a single undo step. */
  commitEdits: (ids: string[], patch: Partial<PdfEdit>) => void;
  deleteEdits: (ids: string[]) => void;
  duplicateEdits: (ids: string[]) => void;
  reorderZ: (ids: string[], where: "front" | "back" | "forward" | "backward") => void;

  // ---- actions: selection ----
  select: (id: string | null, additive?: boolean) => void;
  selectMany: (ids: string[]) => void;
  clearSelection: () => void;

  // ---- actions: clipboard ----
  copySelected: () => void;
  cutSelected: () => void;
  pasteFromClipboard: (pageId: string, at?: { x: number; y: number }) => void;

  // ---- actions: pages ----
  rotatePage: (pageId: string, dir: 1 | -1) => void;
  deletePages: (pageIds: string[]) => void;
  duplicatePage: (pageId: string) => void;
  insertBlankPage: (atIndex: number) => void;
  movePage: (fromIndex: number, toIndex: number) => void;
  appendPages: (pages: PageMeta[]) => void;

  // ---- actions: tools/view/ui ----
  setActiveTool: (t: ToolId) => void;
  patchToolOptions: <K extends keyof ToolOptions>(key: K, patch: Partial<ToolOptions[K]>) => void;
  setZoom: (z: ZoomValue) => void;
  setCurrentPageIndex: (i: number) => void;
  setLeftPanel: (p: "pages" | "search" | null) => void;
  setRightPanelOpen: (v: boolean) => void;
  setExportDialogOpen: (v: boolean) => void;
  setHistoryOpen: (v: boolean) => void;
  setStorageDialogOpen: (v: boolean) => void;
  setPrivacyOpen: (v: boolean) => void;
  setAboutOpen: (v: boolean) => void;
  setSignatureDialogOpen: (v: boolean) => void;
  setAppendDialogOpen: (v: boolean) => void;

  /** Replace the whole document state (session restore) without history. */
  hydrate: (pages: PageMeta[], edits: PdfEdit[]) => void;
}

function pushHistory(state: EditorState): Pick<EditorState, "undoStack" | "redoStack"> {
  const undoStack = [...state.undoStack, snapshot(state.edits, state.pages)];
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  return { undoStack, redoStack: [] };
}

export const useEditor = create<EditorState>()(
  subscribeWithSelector((set, get) => ({
  docStatus: "empty",
  loadError: null,
  loadProgress: null,
  fileName: "",
  pages: [],
  edits: [],
  selectedIds: [],
  activeTool: "select",
  toolOptions: structuredClone(DEFAULT_TOOL_OPTIONS),
  zoom: { mode: "fit-width" },
  currentPageIndex: 0,
  leftPanel: "pages",
  rightPanelOpen: true,
  exportDialogOpen: false,
  historyOpen: false,
  storageDialogOpen: false,
  privacyOpen: false,
  aboutOpen: false,
  signatureDialogOpen: false,
  appendDialogOpen: false,
  undoStack: [],
  redoStack: [],

  setLoading: (progress) =>
    set({ docStatus: "loading", loadProgress: progress, loadError: null }),
  openDocument: (fileName, pages) =>
    set({
      docStatus: "ready",
      fileName,
      pages,
      edits: [],
      selectedIds: [],
      undoStack: [],
      redoStack: [],
      currentPageIndex: 0,
      loadError: null,
      loadProgress: null,
      activeTool: "select",
    }),
  setLoadError: (message) =>
    set({ docStatus: "error", loadError: message, loadProgress: null }),
  closeDocument: () =>
    set({
      docStatus: "empty",
      fileName: "",
      pages: [],
      edits: [],
      selectedIds: [],
      undoStack: [],
      redoStack: [],
      currentPageIndex: 0,
      activeTool: "select",
    }),

  checkpoint: () => set((s) => pushHistory(s)),
  undo: () =>
    set((s) => {
      if (s.undoStack.length === 0) return s;
      const prev = s.undoStack[s.undoStack.length - 1];
      const stillSelected = s.selectedIds.filter((id) => prev.edits.some((e) => e.id === id));
      return {
        edits: prev.edits,
        pages: prev.pages,
        selectedIds: stillSelected,
        undoStack: s.undoStack.slice(0, -1),
        redoStack: [...s.redoStack, snapshot(s.edits, s.pages)],
      };
    }),
  redo: () =>
    set((s) => {
      if (s.redoStack.length === 0) return s;
      const next = s.redoStack[s.redoStack.length - 1];
      const stillSelected = s.selectedIds.filter((id) => next.edits.some((e) => e.id === id));
      return {
        edits: next.edits,
        pages: next.pages,
        selectedIds: stillSelected,
        redoStack: s.redoStack.slice(0, -1),
        undoStack: [...s.undoStack, snapshot(s.edits, s.pages)],
      };
    }),
  clearUndo: () => set({ undoStack: [], redoStack: [] }),

  addEdit: (edit) =>
    set((s) => {
      const maxZ = s.edits.reduce((m, e) => (e.pageId === edit.pageId ? Math.max(m, e.z) : m), -1);
      return {
        ...pushHistory(s),
        edits: [...s.edits, { ...edit, z: maxZ + 1 }],
        selectedIds: [edit.id],
      };
    }),
  addEdits: (edits) =>
    set((s) => {
      const maxByPage = new Map<string, number>();
      for (const e of s.edits) maxByPage.set(e.pageId, Math.max(maxByPage.get(e.pageId) ?? -1, e.z));
      const stamped = edits.map((e) => {
        const z = (maxByPage.get(e.pageId) ?? -1) + 1;
        maxByPage.set(e.pageId, z);
        return { ...e, z };
      });
      return { ...pushHistory(s), edits: [...s.edits, ...stamped] };
    }),
  patchEdit: (id, patch) =>
    set((s) => ({ edits: s.edits.map((e) => (e.id === id ? ({ ...e, ...patch } as PdfEdit) : e)) })),
  commitEdit: (id, patch) =>
    set((s) => ({
      ...pushHistory(s),
      edits: s.edits.map((e) => (e.id === id ? ({ ...e, ...patch } as PdfEdit) : e)),
    })),
  commitEdits: (ids, patch) =>
    set((s) => {
      if (ids.length === 0) return s;
      const setIds = new Set(ids);
      return {
        ...pushHistory(s),
        edits: s.edits.map((e) => (setIds.has(e.id) ? ({ ...e, ...patch } as PdfEdit) : e)),
      };
    }),
  deleteEdits: (ids) =>
    set((s) => {
      if (ids.length === 0) return s;
      const gone = new Set(ids);
      return {
        ...pushHistory(s),
        edits: s.edits.filter((e) => !gone.has(e.id)),
        selectedIds: s.selectedIds.filter((id) => !gone.has(id)),
      };
    }),
  duplicateEdits: (ids) =>
    set((s) => {
      const src = s.edits.filter((e) => ids.includes(e.id));
      if (src.length === 0) return s;
      const maxByPage = new Map<string, number>();
      for (const e of s.edits) maxByPage.set(e.pageId, Math.max(maxByPage.get(e.pageId) ?? -1, e.z));
      const copies = src.map((e) => {
        const z = (maxByPage.get(e.pageId) ?? -1) + 1;
        maxByPage.set(e.pageId, z);
        return { ...structuredClone(e), id: `e_${nanoid()}`, x: e.x + 16, y: e.y + 16, z, createdAt: Date.now() } as PdfEdit;
      });
      return { ...pushHistory(s), edits: [...s.edits, ...copies], selectedIds: copies.map((c) => c.id) };
    }),
  reorderZ: (ids, where) =>
    set((s) => {
      if (ids.length === 0) return s;
      const order = new Map(ids.map((id, i) => [id, i]));
      const moved = s.edits.filter((e) => order.has(e.id));
      const rest = s.edits.filter((e) => !order.has(e.id));
      let next: PdfEdit[];
      if (where === "front") next = [...rest, ...moved];
      else if (where === "back") next = [...moved, ...rest];
      else {
        // forward/backward: swap with neighbor in z order (single selection typical)
        next = [...s.edits];
        const byPage = new Map<string, PdfEdit[]>();
        for (const e of next) {
          const a = byPage.get(e.pageId) ?? [];
          a.push(e);
          byPage.set(e.pageId, a);
        }
        for (const [, arr] of byPage) {
          arr.sort((a, b) => a.z - b.z);
          for (const m of moved.filter((e) => arr.includes(e))) {
            const i = arr.indexOf(m);
            const j = where === "forward" ? Math.min(arr.length - 1, i + 1) : Math.max(0, i - 1);
            if (i !== j) {
              const tmp = arr[i];
              arr[i] = arr[j];
              arr[j] = tmp;
            }
          }
        }
        next = [...byPage.values()].flat();
      }
      return { ...pushHistory(s), edits: normalizeZ(next) };
    }),

  select: (id, additive) =>
    set((s) => {
      if (id === null) return { selectedIds: [] };
      if (additive) {
        return s.selectedIds.includes(id)
          ? { selectedIds: s.selectedIds.filter((x) => x !== id) }
          : { selectedIds: [...s.selectedIds, id] };
      }
      return { selectedIds: [id] };
    }),
  selectMany: (ids) => set({ selectedIds: ids }),
  clearSelection: () => set({ selectedIds: [] }),

  copySelected: () => {
    const { edits, selectedIds } = get();
    session.clipboard = structuredClone(edits.filter((e) => selectedIds.includes(e.id)));
  },
  cutSelected: () => {
    const { selectedIds } = get();
    get().copySelected();
    get().deleteEdits(selectedIds);
  },
  pasteFromClipboard: (pageId, at) =>
    set((s) => {
      const clip = session.clipboard;
      if (!clip || clip.length === 0) return s;
      const now = Date.now();
      const copies = clip.map((e, i) => {
        const c = structuredClone(e) as PdfEdit;
        c.id = `e_${nanoid()}`;
        c.pageId = pageId;
        c.createdAt = now + i;
        if (at && i === 0) {
          // Place first item's top-left at the cursor, keep relative offsets.
          const dx = at.x - clip[0].x;
          const dy = at.y - clip[0].y;
          c.x += dx;
          c.y += dy;
          if (c.type === "freehand") c.points = c.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
        } else if (!at) {
          c.x += 24;
          c.y += 24;
          if (c.type === "freehand") c.points = c.points.map((p) => ({ x: p.x + 24, y: p.y + 24 }));
        } else {
          const dx = at.x - clip[0].x;
          const dy = at.y - clip[0].y;
          c.x += dx;
          c.y += dy;
          if (c.type === "freehand") c.points = c.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
        }
        return c;
      });
      const maxByPage = new Map<string, number>();
      for (const e of s.edits) maxByPage.set(e.pageId, Math.max(maxByPage.get(e.pageId) ?? -1, e.z));
      const stamped = copies.map((c) => {
        const z = (maxByPage.get(c.pageId) ?? -1) + 1;
        maxByPage.set(c.pageId, z);
        return { ...c, z };
      });
      return { ...pushHistory(s), edits: [...s.edits, ...stamped], selectedIds: stamped.map((c) => c.id) };
    }),

  rotatePage: (pageId, dir) =>
    set((s) => ({
      ...pushHistory(s),
      pages: s.pages.map((p) =>
        p.id === pageId ? { ...p, rotation: (((p.rotation + dir * 90) % 360 + 360) % 360) as PageMeta["rotation"] } : p,
      ),
    })),
  deletePages: (pageIds) =>
    set((s) => {
      if (s.pages.length - pageIds.length < 1) return s; // keep at least one page
      const gone = new Set(pageIds);
      return {
        ...pushHistory(s),
        pages: s.pages.filter((p) => !gone.has(p.id)),
        edits: s.edits.filter((e) => !gone.has(e.pageId)),
        selectedIds: [],
        currentPageIndex: 0,
      };
    }),
  duplicatePage: (pageId) =>
    set((s) => {
      const idx = s.pages.findIndex((p) => p.id === pageId);
      if (idx === -1) return s;
      const src = s.pages[idx];
      const now = Date.now();
      const copy: PageMeta = { ...structuredClone(src), id: `p_${nanoid()}` };
      const editCopies = s.edits
        .filter((e) => e.pageId === pageId)
        .map((e) => ({ ...structuredClone(e), id: `e_${nanoid()}`, pageId: copy.id, createdAt: now } as PdfEdit));
      const pages = [...s.pages];
      pages.splice(idx + 1, 0, copy);
      return { ...pushHistory(s), pages, edits: [...s.edits, ...editCopies] };
    }),
  insertBlankPage: (atIndex) =>
    set((s) => {
      const ref = s.pages[Math.min(atIndex, s.pages.length - 1)] ?? s.pages[0];
      const blank: PageMeta = {
        id: `p_${nanoid()}`,
        source: "blank",
        sourcePageIndex: -1,
        width: ref?.width ?? 595.28,
        height: ref?.height ?? 841.89,
        rotation: 0,
        intrinsicRotation: 0,
      };
      const pages = [...s.pages];
      pages.splice(Math.max(0, Math.min(atIndex + 1, pages.length)), 0, blank);
      return { ...pushHistory(s), pages };
    }),
  movePage: (fromIndex, toIndex) =>
    set((s) => {
      if (fromIndex === toIndex) return s;
      const pages = [...s.pages];
      const [moved] = pages.splice(fromIndex, 1);
      pages.splice(toIndex, 0, moved);
      return { ...pushHistory(s), pages };
    }),
  appendPages: (pages) =>
    set((s) => ({ ...pushHistory(s), pages: [...s.pages, ...pages] })),

  setActiveTool: (t) => set({ activeTool: t, selectedIds: t === "select" ? get().selectedIds : [] }),
  patchToolOptions: (key, patch) =>
    set((s) => ({ toolOptions: { ...s.toolOptions, [key]: { ...s.toolOptions[key], ...patch } } })),
  setZoom: (zoom) => set({ zoom }),
  setCurrentPageIndex: (i) => set({ currentPageIndex: i }),
  setLeftPanel: (p) => set({ leftPanel: p }),
  setRightPanelOpen: (v) => set({ rightPanelOpen: v }),
  setExportDialogOpen: (v) => set({ exportDialogOpen: v }),
  setHistoryOpen: (v) => set({ historyOpen: v }),
  setStorageDialogOpen: (v) => set({ storageDialogOpen: v }),
  setPrivacyOpen: (v) => set({ privacyOpen: v }),
  setAboutOpen: (v) => set({ aboutOpen: v }),
  setSignatureDialogOpen: (v) => set({ signatureDialogOpen: v }),
  setAppendDialogOpen: (v) => set({ appendDialogOpen: v }),

  /** Replace the whole document state (session restore) without history. */
  hydrate: (pages: PageMeta[], edits: PdfEdit[]) =>
    set({ pages, edits, selectedIds: [], undoStack: [], redoStack: [], currentPageIndex: 0 }),
})));

/** Selectors */
export function editsOnPage(edits: PdfEdit[], pageId: string): PdfEdit[] {
  return edits.filter((e) => e.pageId === pageId).sort((a, b) => a.z - b.z);
}

export function getEditById(edits: PdfEdit[], id: string): PdfEdit | undefined {
  return edits.find((e) => e.id === id);
}

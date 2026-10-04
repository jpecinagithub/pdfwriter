/**
 * EditingLayer — the interactive overlay on top of each rendered PDF page.
 *
 * - Renders this page's edits (memoized per edit; moving one object does not
 *   re-render the others, and never touches other pages).
 * - Single delegated pointer handler: tool creation, select/move, resize,
 *   rotate.
 * - Text editing overlay + sticky-note popover.
 *
 * All coordinates here are DISPLAY space (PDF points, top-left origin);
 * conversion to/from screen px is `* scale` / `/ scale` only.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PageMeta } from "../types/pdf";
import type {
  FreehandEdit,
  HandwrittenEdit,
  HighlightEdit,
  ImageEdit,
  NoteEdit,
  PdfEdit,
  ShapeEdit,
  SignatureEdit,
  StampEdit,
  TextEdit,
  WhiteoutEdit,
} from "../types/editor";
import { getEditById, useEditor } from "../editor/store";
import { session } from "../editor/session";
import { HAND_STYLE_FONTS, NOTE_COLORS, type ToolId } from "../editor/tools";
import { nanoid } from "../utils/id";
import { simplifyPoints, type Pt } from "../utils/pathSmoothing";
import { EditObject } from "./EditObject";
import { MultiSelectionBox, SelectionBox, type ResizeHandle } from "./SelectionBox";

interface DragRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type DragState =
  | {
      mode: "move";
      startPX: number;
      startPY: number;
      orig: Map<string, { x: number; y: number }>;
      origPoints: Map<string, Pt[]>;
      checkpointed: boolean;
    }
  | { mode: "create-rect"; tool: ToolId; startPX: number; startPY: number }
  | { mode: "draw"; tool: ToolId; points: Pt[] }
  | {
      mode: "handle";
      handle: ResizeHandle;
      editId: string;
      startPX: number;
      startPY: number;
      orig: DragRect;
      center: Pt;
      checkpointed: boolean;
    };

const CURSORS: Record<ToolId, string> = {
  select: "default",
  text: "text",
  handwritten: "text",
  replace: "crosshair",
  highlight: "crosshair",
  whiteout: "crosshair",
  pen: "crosshair",
  marker: "crosshair",
  note: "copy",
  shape: "crosshair",
  image: "copy",
  signature: "copy",
  stamp: "copy",
};

function normalizeRect(x1: number, y1: number, x2: number, y2: number): DragRect {
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}

function newBase(pageId: string, rect: DragRect): Omit<PdfEdit, "type"> & { id: string } {
  return {
    id: `e_${nanoid()}`,
    pageId,
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    rotation: 0,
    opacity: 1,
    createdAt: Date.now(),
    z: 0,
  } as Omit<PdfEdit, "type"> & { id: string };
}

// ---------------------------------------------------------------------------
// text editing overlay
// ---------------------------------------------------------------------------

const TextEditor = memo(function TextEditor({
  edit,
  scale,
  onCommit,
  onCancel,
}: {
  edit: TextEdit | HandwrittenEdit;
  scale: number;
  onCommit: (text: string, heightPt: number) => void;
  onCancel: () => void;
}): React.ReactElement {
  const [value, setValue] = useState(edit.text);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const ta = ref.current;
    if (ta) {
      ta.focus();
      ta.select();
    }
  }, []);

  const commit = useCallback(() => {
    const h = Math.max(edit.height, (ref.current?.scrollHeight ?? 0) / scale);
    onCommit(value, h);
  }, [value, edit.height, onCommit, scale]);

  const isHw = edit.type === "handwritten";
  const fontFamily = isHw ? HAND_STYLE_FONTS[edit.handStyle].family : (edit as TextEdit).fontFamily;

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") onCancel();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      aria-label="Edit text"
      rows={3}
      style={{
        position: "absolute",
        left: edit.x * scale,
        top: edit.y * scale,
        width: Math.max(60, edit.width * scale),
        fontFamily,
        fontSize: edit.fontSize * scale,
        lineHeight: isHw ? 1.15 : (edit as TextEdit).lineHeight,
        fontWeight: !isHw && (edit as TextEdit).bold ? 700 : 400,
        fontStyle: !isHw && (edit as TextEdit).italic ? "italic" : "normal",
        textDecoration: !isHw && (edit as TextEdit).underline ? "underline" : "none",
        color: edit.color,
        textAlign: isHw ? "left" : (edit as TextEdit).align,
        zIndex: 60,
        resize: "none",
        overflow: "hidden",
        background: "rgba(255,255,255,0.92)",
        outline: "1.5px solid #3b82f6",
        borderRadius: 2,
        padding: 2,
        whiteSpace: "pre-wrap",
      }}
    />
  );
});

// ---------------------------------------------------------------------------
// sticky note popover
// ---------------------------------------------------------------------------

const NotePopover = memo(function NotePopover({
  edit,
  scale,
  onClose,
}: {
  edit: NoteEdit;
  scale: number;
  onClose: () => void;
}): React.ReactElement {
  const [text, setText] = useState(edit.text);
  const [author, setAuthor] = useState(edit.author);
  const [color, setColor] = useState(edit.color);

  const commitAndClose = useCallback(() => {
    useEditor.getState().commitEdit(edit.id, { text, author, color });
    onClose();
  }, [edit.id, text, author, color, onClose]);

  return (
    <div
      className="absolute z-[70] w-64 rounded-lg bg-white p-3 shadow-2xl ring-1 ring-black/10"
      style={{ left: Math.max(4, edit.x * scale + 30), top: Math.max(4, edit.y * scale - 10) }}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-label="Sticky note"
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
        rows={4}
        autoFocus
        placeholder="Write a note…"
        className="pw-focus w-full rounded border border-zinc-300 p-1.5 text-sm"
      />
      <input
        value={author}
        onChange={(e) => setAuthor(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
        placeholder="Author (optional)"
        className="pw-focus mt-2 w-full rounded border border-zinc-300 p-1.5 text-xs"
        aria-label="Note author"
      />
      <div className="mt-2 flex items-center gap-1.5" role="radiogroup" aria-label="Note color">
        {NOTE_COLORS.map((c) => (
          <button
            key={c.key}
            type="button"
            title={c.label}
            aria-label={c.label}
            onClick={() => setColor(c.key)}
            className={`h-6 w-6 rounded-full ring-offset-1 ${color === c.key ? "ring-2 ring-blue-600" : "ring-1 ring-black/10"}`}
            style={{ backgroundColor: c.bg }}
          />
        ))}
      </div>
      <div className="mt-3 flex justify-between">
        <button
          type="button"
          onClick={() => {
            useEditor.getState().deleteEdits([edit.id]);
            onClose();
          }}
          className="pw-focus rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
        >
          Delete note
        </button>
        <button
          type="button"
          onClick={commitAndClose}
          className="pw-focus rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
        >
          Done
        </button>
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// the layer
// ---------------------------------------------------------------------------

export const EditingLayer = memo(function EditingLayer({
  page,
  scale,
}: {
  page: PageMeta;
  scale: number;
}): React.ReactElement {
  const edits = useEditor((s) => s.edits);
  const selectedIds = useEditor((s) => s.selectedIds);
  const activeTool = useEditor((s) => s.activeTool);

  const pageEdits = useMemo(
    () => edits.filter((e) => e.pageId === page.id).sort((a, b) => a.z - b.z),
    [edits, page.id],
  );
  const selectedEdits = useMemo(
    () => selectedIds.map((id) => getEditById(edits, id)).filter((e): e is PdfEdit => !!e && e.pageId === page.id),
    [edits, selectedIds, page.id],
  );

  const layerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [dragRect, setDragRect] = useState<DragRect | null>(null);
  const [drawPoints, setDrawPoints] = useState<Pt[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);

  const toDisplay = useCallback(
    (clientX: number, clientY: number): Pt => {
      const r = layerRef.current!.getBoundingClientRect();
      return { x: (clientX - r.left) / scale, y: (clientY - r.top) / scale };
    },
    [scale],
  );

  const cancelTemp = useCallback(() => {
    dragRef.current = null;
    setDragRect(null);
    setDrawPoints(null);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && (dragRect || drawPoints)) cancelTemp();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dragRect, drawPoints, cancelTemp]);

  // -- creation -------------------------------------------------------------

  const placeClickTool = useCallback(
    (tool: ToolId, pos: Pt) => {
      const st = useEditor.getState();
      const o = st.toolOptions;
      if (tool === "text") {
        const t = o.text;
        const edit: TextEdit = {
          ...(newBase(page.id, { x: pos.x, y: pos.y, width: 220, height: t.fontSize * t.lineHeight * 1.4 }) as object),
          type: "text",
          text: "",
          fontFamily: t.fontFamily,
          fontSize: t.fontSize,
          bold: t.bold,
          italic: t.italic,
          underline: t.underline,
          color: t.color,
          align: t.align,
          lineHeight: t.lineHeight,
        } as TextEdit;
        st.addEdit(edit);
        setEditingId(edit.id);
      } else if (tool === "handwritten") {
        const hw = o.handwritten;
        const edit: HandwrittenEdit = {
          ...(newBase(page.id, { x: pos.x, y: pos.y, width: 200, height: hw.fontSize * 1.4 }) as object),
          type: "handwritten",
          text: "",
          handStyle: hw.handStyle,
          fontSize: hw.fontSize,
          color: hw.color,
        } as HandwrittenEdit;
        st.addEdit(edit);
        setEditingId(edit.id);
      } else if (tool === "note") {
        const edit: NoteEdit = {
          ...(newBase(page.id, { x: pos.x - 13, y: pos.y - 13, width: 26, height: 26 }) as object),
          type: "note",
          text: "",
          author: o.note.author,
          color: o.note.color,
        } as NoteEdit;
        st.addEdit(edit);
        setOpenNoteId(edit.id);
      } else if (tool === "stamp") {
        const s = o.stamp;
        const edit: StampEdit = {
          ...(newBase(page.id, { x: pos.x - 85, y: pos.y - 29, width: 170, height: 58 }) as object),
          type: "stamp",
          label: s.label,
          variant: s.variant,
          color: s.color,
        } as StampEdit;
        st.addEdit(edit);
      }
    },
    [page.id],
  );

  const placePendingImage = useCallback(
    (pos: Pt) => {
      const pp = session.pendingPlacement;
      if (!pp) return;
      const st = useEditor.getState();
      const k = Math.min(1, 260 / pp.naturalWidth);
      const w = pp.naturalWidth * k;
      const h = pp.naturalHeight * k;
      const rect = { x: pos.x - w / 2, y: pos.y - h / 2, width: w, height: h };
      if (pp.kind === "image") {
        const edit: ImageEdit = {
          ...(newBase(page.id, rect) as object),
          type: "image",
          imageId: pp.imageId,
          naturalWidth: pp.naturalWidth,
          naturalHeight: pp.naturalHeight,
        } as ImageEdit;
        st.addEdit(edit);
      } else {
        const edit: SignatureEdit = {
          ...(newBase(page.id, rect) as object),
          type: "signature",
          imageId: pp.imageId,
          naturalWidth: pp.naturalWidth,
          naturalHeight: pp.naturalHeight,
        } as SignatureEdit;
        st.addEdit(edit);
      }
      session.pendingPlacement = null;
      st.setActiveTool("select");
    },
    [page.id],
  );

  const createFromRect = useCallback(
    (tool: ToolId, rect: DragRect) => {
      const st = useEditor.getState();
      const o = st.toolOptions;
      if (tool === "highlight") {
        const edit: HighlightEdit = {
          ...(newBase(page.id, rect) as object),
          type: "highlight",
          color: o.highlight.color,
          opacity: o.highlight.opacity,
        } as HighlightEdit;
        st.addEdit(edit);
      } else if (tool === "whiteout") {
        const edit: WhiteoutEdit = {
          ...(newBase(page.id, rect) as object),
          type: "whiteout",
          color: o.whiteout.color,
          opacity: o.whiteout.opacity,
        } as WhiteoutEdit;
        st.addEdit(edit);
      } else if (tool === "shape") {
        const s = o.shape;
        const edit: ShapeEdit = {
          ...(newBase(page.id, rect) as object),
          type: "shape",
          shape: s.kind,
          strokeColor: s.strokeColor,
          fillColor: s.fillColor,
          thickness: s.thickness,
          dashed: s.dashed,
        } as ShapeEdit;
        st.addEdit(edit);
      } else if (tool === "replace") {
        const t = o.text;
        const whiteout: WhiteoutEdit = {
          ...(newBase(page.id, rect) as object),
          type: "whiteout",
          color: o.whiteout.color,
          opacity: o.whiteout.opacity,
        } as WhiteoutEdit;
        const text: TextEdit = {
          ...(newBase(page.id, rect) as object),
          id: `e_${nanoid()}`,
          type: "text",
          text: "",
          fontFamily: t.fontFamily,
          fontSize: t.fontSize,
          bold: t.bold,
          italic: t.italic,
          underline: t.underline,
          color: t.color,
          align: t.align,
          lineHeight: t.lineHeight,
          createdAt: Date.now() + 1,
        } as TextEdit;
        st.addEdits([whiteout, text]);
        st.select(text.id);
        setEditingId(text.id);
      }
    },
    [page.id],
  );

  const createFreehand = useCallback(
    (tool: ToolId, raw: Pt[]) => {
      const pts = simplifyPoints(raw, 2.5);
      if (pts.length < 2) return;
      const st = useEditor.getState();
      const o = tool === "marker" ? st.toolOptions.marker : st.toolOptions.pen;
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      const edit: FreehandEdit = {
        ...(newBase(page.id, {
          x,
          y,
          width: Math.max(2, Math.max(...xs) - x),
          height: Math.max(2, Math.max(...ys) - y),
        }) as object),
        type: "freehand",
        points: pts,
        color: o.color,
        thickness: o.thickness,
        opacity: o.opacity,
        highlighter: tool === "marker",
      } as FreehandEdit;
      st.addEdit(edit);
    },
    [page.id],
  );

  // -- pointer handlers -------------------------------------------------------

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const st = useEditor.getState();
      const pos = toDisplay(e.clientX, e.clientY);
      const target = (e.target as HTMLElement).closest?.("[data-edit-id]") as HTMLElement | null;
      const hitId = target?.dataset.editId;
      layerRef.current?.setPointerCapture(e.pointerId);

      if (st.activeTool === "select") {
        if (hitId) {
          if (e.shiftKey) st.select(hitId, true);
          else if (!st.selectedIds.includes(hitId)) st.select(hitId);
          // Re-read: the selects above already updated the store.
          const ids = useEditor.getState().selectedIds;
          const fresh = useEditor.getState();
          const orig = new Map<string, { x: number; y: number }>();
          const origPoints = new Map<string, Pt[]>();
          for (const ed of fresh.edits) {
            if (!ids.includes(ed.id)) continue;
            orig.set(ed.id, { x: ed.x, y: ed.y });
            if (ed.type === "freehand") origPoints.set(ed.id, ed.points.map((p) => ({ ...p })));
          }
          dragRef.current = { mode: "move", startPX: pos.x, startPY: pos.y, orig, origPoints, checkpointed: false };
        } else {
          if (!e.shiftKey) st.clearSelection();
        }
        return;
      }

      // tool mode
      const tool = st.activeTool;
      if (tool === "text" || tool === "handwritten" || tool === "note" || tool === "stamp") {
        placeClickTool(tool, pos);
      } else if (tool === "image" || tool === "signature") {
        placePendingImage(pos);
      } else if (tool === "highlight" || tool === "whiteout" || tool === "shape" || tool === "replace") {
        dragRef.current = { mode: "create-rect", tool, startPX: pos.x, startPY: pos.y };
        setDragRect({ x: pos.x, y: pos.y, width: 0, height: 0 });
      } else if (tool === "pen" || tool === "marker") {
        dragRef.current = { mode: "draw", tool, points: [pos] };
        setDrawPoints([pos]);
      }
    },
    [toDisplay, placeClickTool, placePendingImage],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const st = useEditor.getState();
      const pos = toDisplay(e.clientX, e.clientY);

      if (d.mode === "move") {
        const dx = pos.x - d.startPX;
        const dy = pos.y - d.startPY;
        if (!d.checkpointed) {
          if (dx * dx + dy * dy < 9) return;
          st.checkpoint();
          d.checkpointed = true;
        }
        for (const [id, o] of d.orig) {
          const pts = d.origPoints.get(id);
          if (pts) {
            st.patchEdit(id, {
              x: o.x + dx,
              y: o.y + dy,
              points: pts.map((p) => ({ x: p.x + dx, y: p.y + dy })),
            });
          } else {
            st.patchEdit(id, { x: o.x + dx, y: o.y + dy });
          }
        }
      } else if (d.mode === "create-rect") {
        setDragRect(normalizeRect(d.startPX, d.startPY, pos.x, pos.y));
      } else if (d.mode === "draw") {
        const last = d.points[d.points.length - 1];
        const ddx = pos.x - last.x;
        const ddy = pos.y - last.y;
        if (ddx * ddx + ddy * ddy >= 2.5 * 2.5) {
          d.points.push(pos);
          setDrawPoints([...d.points]);
        }
      } else if (d.mode === "handle") {
        const edit = getEditById(st.edits, d.editId);
        if (!edit) return;
        if (d.handle === "rotate") {
          const r = layerRef.current!.getBoundingClientRect();
          const cx = r.left + d.center.x * scale;
          const cy = r.top + d.center.y * scale;
          let deg = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI + 90;
          deg = ((deg % 360) + 360) % 360;
          if (e.shiftKey) deg = Math.round(deg / 15) * 15;
          if (!d.checkpointed) {
            st.checkpoint();
            d.checkpointed = true;
          }
          st.patchEdit(d.editId, { rotation: Math.round(deg * 10) / 10 });
          return;
        }
        // resize: work in the object's local (unrotated) frame
        const dx = pos.x - d.startPX;
        const dy = pos.y - d.startPY;
        const t = ((-edit.rotation || 0) * Math.PI) / 180;
        const ldx = dx * Math.cos(t) - dy * Math.sin(t);
        const ldy = dx * Math.sin(t) + dy * Math.cos(t);
        if (!d.checkpointed) {
          if (ldx * ldx + ldy * ldy < 4) return;
          st.checkpoint();
          d.checkpointed = true;
        }
        const o = d.orig;
        const minW = edit.type === "text" || edit.type === "handwritten" ? 30 : 10;
        const minH = 10;
        let { x, y } = o;
        let w = o.width;
        let h = o.height;
        const hh = d.handle;
        if (hh.includes("e")) w = o.width + ldx;
        if (hh.includes("s")) h = o.height + ldy;
        if (hh.includes("w")) {
          w = o.width - ldx;
          x = o.x + ldx;
        }
        if (hh.includes("n")) {
          h = o.height - ldy;
          y = o.y + ldy;
        }
        if (w < minW) {
          if (hh.includes("w")) x = o.x + o.width - minW;
          w = minW;
        }
        if (h < minH) {
          if (hh.includes("n")) y = o.y + o.height - minH;
          h = minH;
        }
        st.patchEdit(d.editId, { x, y, width: w, height: h });
      }
    },
    [toDisplay, scale],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      dragRef.current = null;
      if (!d) return;
      const pos = toDisplay(e.clientX, e.clientY);
      if (d.mode === "create-rect") {
        const rect = normalizeRect(d.startPX, d.startPY, pos.x, pos.y);
        setDragRect(null);
        if (rect.width > 4 && rect.height > 4) createFromRect(d.tool, rect);
      } else if (d.mode === "draw") {
        setDrawPoints(null);
        createFreehand(d.tool, d.points);
      }
    },
    [toDisplay, createFromRect, createFreehand],
  );

  const onDoubleClick = useCallback((e: React.MouseEvent) => {
    const target = (e.target as HTMLElement).closest?.("[data-edit-id]") as HTMLElement | null;
    const hitId = target?.dataset.editId;
    if (!hitId) return;
    const edit = getEditById(useEditor.getState().edits, hitId);
    if (!edit) return;
    if (edit.type === "text" || edit.type === "handwritten") {
      useEditor.getState().select(hitId);
      setEditingId(hitId);
    } else if (edit.type === "note") {
      setOpenNoteId(hitId);
    }
  }, []);

  const onHandleDown = useCallback(
    (edit: PdfEdit) => (handle: ResizeHandle, ev: React.PointerEvent) => {
      ev.stopPropagation();
      ev.preventDefault();
      const pos = toDisplay(ev.clientX, ev.clientY);
      dragRef.current = {
        mode: "handle",
        handle,
        editId: edit.id,
        startPX: pos.x,
        startPY: pos.y,
        orig: { x: edit.x, y: edit.y, width: edit.width, height: edit.height },
        center: { x: edit.x + edit.width / 2, y: edit.y + edit.height / 2 },
        checkpointed: false,
      };
      layerRef.current?.setPointerCapture(ev.pointerId);
    },
    [toDisplay],
  );

  const commitText = useCallback(
    (id: string) => (text: string, heightPt: number) => {
      useEditor.getState().commitEdit(id, { text, height: heightPt });
      setEditingId(null);
    },
    [],
  );

  const cancelText = useCallback(() => setEditingId(null), []);

  // -- selection rendering ----------------------------------------------------

  const multiBox = useMemo(() => {
    if (selectedEdits.length < 2) return null;
    const xs = selectedEdits.map((e) => e.x);
    const ys = selectedEdits.map((e) => e.y);
    const xe = selectedEdits.map((e) => e.x + e.width);
    const ye = selectedEdits.map((e) => e.y + e.height);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, width: Math.max(...xe) - x, height: Math.max(...ye) - y };
  }, [selectedEdits]);

  const editingEdit = editingId ? getEditById(edits, editingId) : undefined;
  const openNoteEdit = openNoteId ? getEditById(edits, openNoteId) : undefined;

  return (
    <div
      ref={layerRef}
      className="pw-no-select absolute inset-0"
      style={{ cursor: CURSORS[activeTool], touchAction: "none", zIndex: 10 }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
      role="application"
      aria-label="Editing layer"
    >
      {pageEdits.map((e) => (
        <EditObject key={e.id} edit={e} scale={scale} />
      ))}

      {/* live creation previews */}
      {dragRect && dragRect.width > 0 && dragRect.height > 0 && (
        <div
          className="pointer-events-none absolute rounded-[2px] border-2 border-blue-500 bg-blue-500/10"
          style={{
            left: dragRect.x * scale,
            top: dragRect.y * scale,
            width: dragRect.width * scale,
            height: dragRect.height * scale,
          }}
          aria-hidden="true"
        />
      )}
      {drawPoints && drawPoints.length > 1 && (
        <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
          <polyline
            points={drawPoints.map((p) => `${p.x * scale},${p.y * scale}`).join(" ")}
            fill="none"
            stroke="#3b82f6"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.7}
          />
        </svg>
      )}

      {/* selection */}
      {selectedEdits.length === 1 && (
        <SelectionBox edit={selectedEdits[0]} scale={scale} onHandleDown={onHandleDown(selectedEdits[0])} />
      )}
      {multiBox && <MultiSelectionBox box={multiBox} scale={scale} />}

      {/* text editing */}
      {editingEdit && (editingEdit.type === "text" || editingEdit.type === "handwritten") && (
        <TextEditor
          edit={editingEdit}
          scale={scale}
          onCommit={commitText(editingEdit.id)}
          onCancel={cancelText}
        />
      )}

      {/* note popover */}
      {openNoteEdit && openNoteEdit.type === "note" && (
        <NotePopover edit={openNoteEdit} scale={scale} onClose={() => setOpenNoteId(null)} />
      )}
    </div>
  );
});

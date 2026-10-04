/**
 * SelectionBox — bounding box with resize + rotation handles for one edit.
 * The box uses the same unrotated-box + CSS-rotate model as EditObject.
 */
import { memo } from "react";
import type { PdfEdit } from "../types/editor";

export type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "rotate";

const HANDLE_CURSORS: Record<ResizeHandle, string> = {
  nw: "nwse-resize",
  se: "nwse-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
  rotate: "grab",
};

export function isResizable(edit: PdfEdit): boolean {
  return edit.type !== "freehand" && edit.type !== "note";
}

export const SelectionBox = memo(function SelectionBox({
  edit,
  scale,
  onHandleDown,
}: {
  edit: PdfEdit;
  scale: number;
  onHandleDown: (handle: ResizeHandle, ev: React.PointerEvent) => void;
}): React.ReactElement {
  const w = Math.max(1, edit.width * scale);
  const h = Math.max(1, edit.height * scale);
  const s = 10; // handle size
  const o = -s / 2;

  const pos: Record<Exclude<ResizeHandle, "rotate">, { left: number; top: number }> = {
    nw: { left: o, top: o },
    n: { left: w / 2 + o, top: o },
    ne: { left: w + o, top: o },
    e: { left: w + o, top: h / 2 + o },
    se: { left: w + o, top: h + o },
    s: { left: w / 2 + o, top: h + o },
    sw: { left: o, top: h + o },
    w: { left: o, top: h / 2 + o },
  };

  const resizable = isResizable(edit);

  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: edit.x * scale,
        top: edit.y * scale,
        width: w,
        height: h,
        transform: edit.rotation ? `rotate(${edit.rotation}deg)` : undefined,
        transformOrigin: "center",
        zIndex: 50,
      }}
      aria-hidden="true"
    >
      <div
        className="absolute inset-0 rounded-[1px]"
        style={{ outline: "1.5px solid #3b82f6", outlineOffset: 0 }}
      />
      {resizable &&
        (Object.keys(pos) as Array<Exclude<ResizeHandle, "rotate">>).map((k) => (
          <div
            key={k}
            data-handle={k}
            className="pointer-events-auto absolute rounded-[2px] border border-blue-600 bg-white shadow-sm"
            style={{
              width: s,
              height: s,
              left: pos[k].left,
              top: pos[k].top,
              cursor: HANDLE_CURSORS[k],
              touchAction: "none",
            }}
            onPointerDown={(ev) => onHandleDown(k, ev)}
          />
        ))}
      {resizable && (
        <>
          <div
            className="pointer-events-none absolute bg-blue-500"
            style={{ left: w / 2 - 0.75, top: -22, width: 1.5, height: 17 }}
          />
          <div
            data-handle="rotate"
            className="pointer-events-auto absolute rounded-full border border-blue-600 bg-white shadow-sm"
            style={{
              width: 14,
              height: 14,
              left: w / 2 - 7,
              top: -29,
              cursor: HANDLE_CURSORS.rotate,
              touchAction: "none",
            }}
            onPointerDown={(ev) => onHandleDown("rotate", ev)}
          />
        </>
      )}
    </div>
  );
});

/** Dashed union outline for multi-selection (no handles). */
export const MultiSelectionBox = memo(function MultiSelectionBox({
  box,
  scale,
}: {
  box: { x: number; y: number; width: number; height: number };
  scale: number;
}): React.ReactElement {
  return (
    <div
      className="pointer-events-none absolute z-40"
      aria-hidden="true"
      style={{
        left: box.x * scale,
        top: box.y * scale,
        width: Math.max(1, box.width * scale),
        height: Math.max(1, box.height * scale),
        border: "1.5px dashed #3b82f6",
        borderRadius: 2,
      }}
    />
  );
});

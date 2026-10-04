/**
 * Document generators — page numbers, watermarks, headers/footers.
 *
 * Implemented as REAL text edits (one undoable batch), so they flow through
 * the normal selection, move, and export pipeline with zero special cases.
 */
import { useEditor } from "./store";
import { displaySize } from "../types/pdf";
import type { TextEdit } from "../types/editor";
import { nanoid } from "../utils/id";

interface TextOpts {
  fontSize: number;
  color: string;
  opacity: number;
  rotation?: number;
  align?: TextEdit["align"];
  bold?: boolean;
}

function makeText(
  pageId: string,
  x: number,
  y: number,
  w: number,
  h: number,
  text: string,
  o: TextOpts,
): TextEdit {
  return {
    id: `e_${nanoid()}`,
    type: "text",
    pageId,
    x,
    y,
    width: w,
    height: h,
    rotation: o.rotation ?? 0,
    opacity: o.opacity,
    createdAt: Date.now(),
    z: 0,
    text,
    fontFamily: "Helvetica",
    fontSize: o.fontSize,
    bold: o.bold ?? false,
    italic: false,
    underline: false,
    color: o.color,
    align: o.align ?? "center",
    lineHeight: 1.25,
  };
}

export type PageNumberPosition = "bottom-center" | "bottom-left" | "bottom-right" | "top-center";

export function addPageNumbers(opts: {
  position: PageNumberPosition;
  startNumber: number;
  startPage: number; // 1-based
}): number {
  const { pages, addEdits } = useEditor.getState();
  const edits: TextEdit[] = [];
  const margin = 36;
  const w = 120;
  const h = 20;
  pages.forEach((p, i) => {
    if (i < opts.startPage - 1) return;
    const { width, height } = displaySize(p);
    const label = String(opts.startNumber + (i - (opts.startPage - 1)));
    let x = 0;
    let y = 0;
    switch (opts.position) {
      case "bottom-center":
        x = (width - w) / 2;
        y = height - margin - h;
        break;
      case "bottom-left":
        x = margin;
        y = height - margin - h;
        break;
      case "bottom-right":
        x = width - margin - w;
        y = height - margin - h;
        break;
      case "top-center":
        x = (width - w) / 2;
        y = margin;
        break;
    }
    edits.push(makeText(p.id, x, y, w, h, label, { fontSize: 10, color: "#6b7280", opacity: 1 }));
  });
  if (edits.length > 0) addEdits(edits);
  return edits.length;
}

export function addWatermark(opts: {
  text: string;
  opacity: number;
  rotation: number;
  fontSize: number;
  scope: "all" | "current";
}): number {
  const st = useEditor.getState();
  const { pages, addEdits, currentPageIndex } = st;
  const targets = opts.scope === "all" ? pages : pages.slice(currentPageIndex, currentPageIndex + 1);
  const edits: TextEdit[] = [];
  for (const p of targets) {
    const { width, height } = displaySize(p);
    const w = width - 80;
    edits.push(
      makeText(p.id, 40, height / 2 - opts.fontSize * 0.7, w, opts.fontSize * 1.4, opts.text || "DRAFT", {
        fontSize: opts.fontSize,
        color: "#9ca3af",
        opacity: opts.opacity,
        rotation: opts.rotation,
        bold: true,
      }),
    );
  }
  if (edits.length > 0) addEdits(edits);
  return edits.length;
}

export function addHeaderFooter(opts: {
  header: string;
  footer: string;
  pageNumbers: boolean;
}): number {
  const { pages, addEdits } = useEditor.getState();
  const edits: TextEdit[] = [];
  const n = pages.length;
  pages.forEach((p, i) => {
    const { width, height } = displaySize(p);
    const w = width - 96;
    if (opts.header.trim()) {
      edits.push(makeText(p.id, 48, 24, w, 18, opts.header.trim(), { fontSize: 9, color: "#6b7280", opacity: 1 }));
    }
    let footer = opts.footer.trim();
    if (opts.pageNumbers) footer = `${footer}${footer ? "  •  " : ""}Page ${i + 1} of ${n}`;
    if (footer) {
      edits.push(makeText(p.id, 48, height - 42, w, 18, footer, { fontSize: 9, color: "#6b7280", opacity: 1 }));
    }
  });
  if (edits.length > 0) addEdits(edits);
  return edits.length;
}

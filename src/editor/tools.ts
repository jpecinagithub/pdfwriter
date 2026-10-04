/**
 * Tool definitions + per-tool default options.
 */
import type { HandStyle, ShapeKind, StampVariant, TextAlign } from "../types/editor";

export type ToolId =
  | "select"
  | "text"
  | "handwritten"
  | "highlight"
  | "whiteout"
  | "pen"
  | "marker"
  | "note"
  | "shape"
  | "image"
  | "signature"
  | "stamp"
  | "replace";

export interface ToolDef {
  id: ToolId;
  label: string;
  shortcut?: string;
  hint: string;
}

export const TOOLS: ToolDef[] = [
  { id: "select", label: "Select", shortcut: "V", hint: "Click to select, drag to move. Shift+click for multi-select." },
  { id: "text", label: "Text", shortcut: "T", hint: "Click on the page to add text." },
  { id: "handwritten", label: "Handwritten", hint: "Click on the page to add a handwritten-style note." },
  { id: "replace", label: "Replace text", hint: "Drag a rectangle over text to cover it, then type the replacement." },
  { id: "highlight", label: "Highlight", shortcut: "H", hint: "Drag across text to highlight it." },
  { id: "whiteout", label: "Whiteout", hint: "Drag a rectangle to cover content." },
  { id: "pen", label: "Pen", shortcut: "P", hint: "Draw freehand on the page." },
  { id: "marker", label: "Marker", hint: "Draw with a translucent highlighter pen." },
  { id: "note", label: "Note", shortcut: "N", hint: "Click on the page to attach a sticky note." },
  { id: "shape", label: "Shape", hint: "Drag on the page to draw a shape." },
  { id: "image", label: "Image", hint: "Click on the page to place an image." },
  { id: "signature", label: "Signature", shortcut: "G", hint: "Click on the page to place your signature." },
  { id: "stamp", label: "Stamp", hint: "Click on the page to place a stamp." },
];

export interface TextToolOptions {
  fontFamily: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color: string;
  align: TextAlign;
  lineHeight: number;
}

export interface HandwrittenToolOptions {
  handStyle: HandStyle;
  fontSize: number;
  color: string;
}

export interface HighlightToolOptions {
  color: string;
  opacity: number;
}

export interface WhiteoutToolOptions {
  color: string;
  opacity: number;
}

export interface PenToolOptions {
  color: string;
  thickness: number;
  opacity: number;
}

export interface NoteToolOptions {
  color: string;
  author: string;
}

export interface ShapeToolOptions {
  kind: ShapeKind;
  strokeColor: string;
  fillColor: string;
  thickness: number;
  dashed: boolean;
}

export interface StampToolOptions {
  variant: StampVariant;
  label: string;
  color: string;
}

export interface ToolOptions {
  text: TextToolOptions;
  handwritten: HandwrittenToolOptions;
  highlight: HighlightToolOptions;
  whiteout: WhiteoutToolOptions;
  pen: PenToolOptions;
  marker: PenToolOptions;
  note: NoteToolOptions;
  shape: ShapeToolOptions;
  stamp: StampToolOptions;
}

export const DEFAULT_TOOL_OPTIONS: ToolOptions = {
  text: {
    fontFamily: "Helvetica",
    fontSize: 14,
    bold: false,
    italic: false,
    underline: false,
    color: "#1a1a1a",
    align: "left",
    lineHeight: 1.25,
  },
  handwritten: { handStyle: "casual", fontSize: 22, color: "#1d4ed8" },
  highlight: { color: "#ffeb3b", opacity: 0.45 },
  whiteout: { color: "#ffffff", opacity: 1 },
  pen: { color: "#111111", thickness: 2.5, opacity: 1 },
  marker: { color: "#ffeb3b", thickness: 14, opacity: 0.45 },
  note: { color: "yellow", author: "" },
  shape: {
    kind: "rect",
    strokeColor: "#111111",
    fillColor: "transparent",
    thickness: 2,
    dashed: false,
  },
  stamp: { variant: "approved", label: "APPROVED", color: "#15803d" },
};

export const TEXT_FONTS = [
  "Helvetica",
  "Arial",
  "Times New Roman",
  "Georgia",
  "Courier New",
  "Verdana",
];

/** Editor font family -> bundled/export font key for handwriting styles. */
export const HAND_STYLE_FONTS: Record<HandStyle, { label: string; family: string; file: string }> = {
  casual: { label: "Casual", family: "'PW-Caveat', cursive", file: "Caveat-Regular.ttf" },
  notebook: { label: "Notebook", family: "'PW-ShadowsIntoLight', cursive", file: "ShadowsIntoLight-Regular.ttf" },
  signature: { label: "Signature", family: "'PW-GreatVibes', cursive", file: "GreatVibes-Regular.ttf" },
  marker: { label: "Marker", family: "'PW-PermanentMarker', cursive", file: "PermanentMarker-Regular.ttf" },
  elegant: { label: "Elegant", family: "'PW-DancingScript', cursive", file: "DancingScript-Regular.ttf" },
};

export const HIGHLIGHT_COLORS = ["#ffeb3b", "#a3e635", "#7dd3fc", "#f9a8d4", "#fdba74"];
export const NOTE_COLORS: Array<{ key: string; label: string; bg: string }> = [
  { key: "yellow", label: "Yellow", bg: "#fef08a" },
  { key: "green", label: "Green", bg: "#bbf7d0" },
  { key: "blue", label: "Blue", bg: "#bfdbfe" },
  { key: "pink", label: "Pink", bg: "#fbcfe8" },
  { key: "orange", label: "Orange", bg: "#fed7aa" },
];

export const STAMP_PRESETS: Array<{ variant: StampVariant; label: string; color: string }> = [
  { variant: "approved", label: "APPROVED", color: "#15803d" },
  { variant: "rejected", label: "REJECTED", color: "#b91c1c" },
  { variant: "confidential", label: "CONFIDENTIAL", color: "#b91c1c" },
  { variant: "draft", label: "DRAFT", color: "#6b7280" },
  { variant: "reviewed", label: "REVIEWED", color: "#1d4ed8" },
  { variant: "signed", label: "SIGNED", color: "#0f766e" },
];

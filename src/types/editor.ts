/**
 * PDFWriter edit model — non-destructive overlay editing.
 *
 * Every user modification is an independent object positioned over a PDF page.
 * The original PDF is never mutated during editing; objects are merged only
 * at export time.
 *
 * COORDINATE SYSTEM (critical — see pdf/coordinateMapper.ts):
 * - Units: PDF points (1/72 inch)
 * - Origin: TOP-LEFT of the page as displayed (after page rotation applied)
 * - x grows right, y grows DOWN
 * - (x, y) is the top-left corner of the object's bounding box in this space
 * - Never store DOM/CSS pixels in this model
 */

export type EditType =
  | "text"
  | "highlight"
  | "whiteout"
  | "freehand"
  | "note"
  | "shape"
  | "image"
  | "signature"
  | "stamp"
  | "handwritten";

export interface EditBase {
  id: string;
  type: EditType;
  /** Stable page id (see types/pdf.ts). Survives reorder/delete of other pages. */
  pageId: string;
  /** Top-left corner in display-space PDF points. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Object-level rotation, degrees clockwise. */
  rotation: number;
  /** 0..1 */
  opacity: number;
  createdAt: number;
  /** Stacking order within the page (higher = on top). */
  z: number;
}

export type TextAlign = "left" | "center" | "right";

export interface TextEdit extends EditBase {
  type: "text";
  text: string;
  fontFamily: string;
  /** pt */
  fontSize: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  /** hex, e.g. "#1a1a1a" */
  color: string;
  align: TextAlign;
  /** line-height multiplier */
  lineHeight: number;
}

export interface HighlightEdit extends EditBase {
  type: "highlight";
  color: string;
}

export interface WhiteoutEdit extends EditBase {
  type: "whiteout";
  color: string;
}

export interface FreehandPoint {
  x: number;
  y: number;
}

export interface FreehandEdit extends EditBase {
  type: "freehand";
  /** Absolute page coordinates (display space, PDF points). */
  points: FreehandPoint[];
  color: string;
  /** pt */
  thickness: number;
  /** Highlighter-pen mode: wide translucent stroke */
  highlighter: boolean;
}

export interface NoteEdit extends EditBase {
  type: "note";
  text: string;
  author: string;
  /** sticky-note color key */
  color: string;
}

export type ShapeKind = "rect" | "roundRect" | "ellipse" | "line" | "arrow";

export interface ShapeEdit extends EditBase {
  type: "shape";
  shape: ShapeKind;
  strokeColor: string;
  /** hex or "transparent" */
  fillColor: string;
  /** pt */
  thickness: number;
  dashed: boolean;
}

export interface ImageEdit extends EditBase {
  type: "image";
  /** Key into the image blob store (projectRepository). */
  imageId: string;
  naturalWidth: number;
  naturalHeight: number;
}

export interface SignatureEdit extends EditBase {
  type: "signature";
  /** Key into the image blob store (saved signatures live here too). */
  imageId: string;
  naturalWidth: number;
  naturalHeight: number;
}

export type StampVariant =
  | "approved"
  | "rejected"
  | "confidential"
  | "draft"
  | "reviewed"
  | "signed"
  | "custom";

export interface StampEdit extends EditBase {
  type: "stamp";
  label: string;
  variant: StampVariant;
  color: string;
}

export type HandStyle = "casual" | "notebook" | "signature" | "marker" | "elegant";

export interface HandwrittenEdit extends EditBase {
  type: "handwritten";
  text: string;
  handStyle: HandStyle;
  fontSize: number;
  color: string;
}

export type PdfEdit =
  | TextEdit
  | HighlightEdit
  | WhiteoutEdit
  | FreehandEdit
  | NoteEdit
  | ShapeEdit
  | ImageEdit
  | SignatureEdit
  | StampEdit
  | HandwrittenEdit;

/** Serializable project payload (no binary data — images live in the blob store). */
export interface PdfProjectData {
  version: 1;
  id: string;
  originalFileName: string;
  edits: PdfEdit[];
  pages: import("./pdf").PageMeta[];
  createdAt: number;
  updatedAt: number;
}

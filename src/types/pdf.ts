/**
 * PDF document + page model.
 *
 * Pages carry STABLE ids. Edits reference pageId, never a positional index,
 * so reorder/delete/duplicate/insert operations cannot orphan annotations.
 */

export type PageSourceKind = "original" | "appended" | "blank";

export interface PageMeta {
  /** Stable id, e.g. "p_<uuid>". */
  id: string;
  /** Where the raster/content comes from. */
  source: PageSourceKind;
  /** For "original": index into the original PDF. For "appended": index into the appended doc. */
  sourcePageIndex: number;
  /** For "appended": id of the appended document (bytes kept in the project blob store). */
  sourceDocId?: string;
  /** Unrotated page size in PDF points. */
  width: number;
  height: number;
  /** User-applied rotation, one of 0 | 90 | 180 | 270 (clockwise). */
  rotation: 0 | 90 | 180 | 270;
  /** Intrinsic /Rotate of the source page (from the PDF itself). */
  intrinsicRotation: 0 | 90 | 180 | 270;
}

/** Total display rotation = intrinsic + user rotation (mod 360). */
export function totalRotation(page: PageMeta): 0 | 90 | 180 | 270 {
  return ((page.intrinsicRotation + page.rotation) % 360) as 0 | 90 | 180 | 270;
}

/** Displayed page dimensions (after rotation) in PDF points. */
export function displaySize(page: PageMeta): { width: number; height: number } {
  const r = totalRotation(page);
  if (r === 90 || r === 270) return { width: page.height, height: page.width };
  return { width: page.width, height: page.height };
}

export interface PdfDocumentInfo {
  fileName: string;
  pageCount: number;
  /** Bytes of the ORIGINAL pdf (kept outside React state — module-level ref). */
  byteLength: number;
  title?: string;
  author?: string;
}

export interface AppendedDoc {
  id: string;
  fileName: string;
  pageCount: number;
}

/** Zoom model: either a preset scale or a fit mode. */
export type ZoomValue =
  | { mode: "scale"; scale: number }
  | { mode: "fit-width" }
  | { mode: "fit-page" };

export const ZOOM_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2];

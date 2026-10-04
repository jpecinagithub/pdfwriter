/**
 * PDF export core — pure, DOM-free, worker-safe.
 *
 * Pipeline (spec §24):
 *   original bytes -> pdf-lib -> apply page operations -> draw overlays
 *   (whiteout, highlights, freehand, shapes, text, images, signatures,
 *   stamps, notes) -> serialize -> Uint8Array
 *
 * All editor (display-space) coordinates are converted to PDF-native space
 * via coordinateMapper. Object rotation (clockwise, display space) maps to
 * pdf-lib's counter-clockwise-positive `rotate` as degrees(-rotation).
 */
import {
  BlendMode,
  LineCapStyle,
  PDFDocument,
  StandardFonts,
  degrees,
  rgb,
  type Color,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { displayToPdfPoint } from "./coordinateMapper";
import { totalRotation, type PageMeta } from "../types/pdf";
import type {
  FreehandEdit,
  HandStyle,
  ImageEdit,
  NoteEdit,
  PdfEdit,
  ShapeEdit,
  SignatureEdit,
  StampEdit,
  TextEdit,
} from "../types/editor";

export class ExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExportError";
  }
}

export interface ExportImageInput {
  id: string;
  bytes: ArrayBuffer;
}

export interface ExportInput {
  originalBytes: ArrayBuffer;
  appendedDocs: Array<{ id: string; bytes: ArrayBuffer }>;
  pages: PageMeta[];
  edits: PdfEdit[];
  images: ExportImageInput[];
  /** handwriting style -> TTF bytes (fetched by the caller). */
  fontFiles: Partial<Record<HandStyle, ArrayBuffer>>;
  flattenNotes: boolean;
}

export type ProgressFn = (phase: string, done: number, total: number) => void;

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

function hexToColor(hex: string): Color {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  if (Number.isNaN(n) || h.length !== 6) return rgb(0, 0, 0);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** Rotate a point (CCW-positive, y-up space) about a center. */
function rotCcw(x: number, y: number, cx: number, cy: number, deg: number) {
  const t = (deg * Math.PI) / 180;
  const dx = x - cx;
  const dy = y - cy;
  const c = Math.cos(t);
  const s = Math.sin(t);
  return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c };
}

/** Rotate a point clockwise in display space (y-down) about a center. */
function rotCwDisplay(x: number, y: number, cx: number, cy: number, deg: number) {
  const t = (deg * Math.PI) / 180;
  const dx = x - cx;
  const dy = y - cy;
  const c = Math.cos(t);
  const s = Math.sin(t);
  return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c };
}

interface PageCtx {
  page: PDFPage;
  W: number;
  H: number;
  R: 0 | 90 | 180 | 270;
}

const toPdf = (ctx: PageCtx, dx: number, dy: number) =>
  displayToPdfPoint(dx, dy, ctx.W, ctx.H, ctx.R);

// ---------------------------------------------------------------------------
// fonts
// ---------------------------------------------------------------------------

const STD_BASE: Record<string, string> = {
  Helvetica: "Helvetica",
  Arial: "Helvetica",
  Verdana: "Helvetica",
  "Times New Roman": "Times-Roman",
  Georgia: "Times-Roman",
  "Courier New": "Courier",
};

function stdFontName(family: string, bold: boolean, italic: boolean): string {
  const base = STD_BASE[family] ?? "Helvetica";
  if (bold && italic) return `${base}-BoldOblique`;
  if (bold) return `${base}-Bold`;
  if (italic) return `${base}-Oblique`;
  return base;
}

class FontCache {
  private std = new Map<string, PDFFont>();
  private hand = new Map<HandStyle, PDFFont>();
  private doc: PDFDocument;
  constructor(doc: PDFDocument) {
    this.doc = doc;
  }
  async standard(family: string, bold: boolean, italic: boolean): Promise<PDFFont> {
    const key = `${family}|${bold}|${italic}`;
    let f = this.std.get(key);
    if (!f) {
      f = await this.doc.embedFont(stdFontName(family, bold, italic) as unknown as StandardFonts);
      this.std.set(key, f);
    }
    return f;
  }
  async handwritten(style: HandStyle, ttf: ArrayBuffer | undefined): Promise<PDFFont | null> {
    if (!ttf) return null;
    let f = this.hand.get(style);
    if (!f) {
      f = await this.doc.embedFont(ttf, { subset: true });
      this.hand.set(style, f);
    }
    return f;
  }
}

// ---------------------------------------------------------------------------
// text layout (greedy wrap, mirrors the editor's auto-sized text boxes)
// ---------------------------------------------------------------------------

function wrapParagraph(par: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = par.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  const fits = (s: string) => font.widthOfTextAtSize(s, size) <= maxWidth;
  for (const w of words) {
    const cand = cur ? `${cur} ${w}` : w;
    if (fits(cand)) {
      cur = cand;
    } else {
      if (cur) lines.push(cur);
      // hard-break overlong words
      let rest = w;
      cur = "";
      while (rest && !fits(rest)) {
        let i = rest.length - 1;
        while (i > 0 && !fits(rest.slice(0, i))) i--;
        if (i === 0) i = 1;
        lines.push(rest.slice(0, i));
        rest = rest.slice(i);
      }
      cur = rest;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const par of text.split("\n")) out.push(...wrapParagraph(par, font, size, maxWidth));
  return out;
}

// ---------------------------------------------------------------------------
// per-edit painters
// ---------------------------------------------------------------------------

interface PaintEnv {
  fonts: FontCache;
  fontFiles: Partial<Record<HandStyle, ArrayBuffer>>;
  images: Map<string, Uint8Array>;
  flattenNotes: boolean;
}

/** Center of an edit in PDF space. */
function editCenterPdf(ctx: PageCtx, e: PdfEdit) {
  return toPdf(ctx, e.x + e.width / 2, e.y + e.height / 2);
}

/**
 * For pdf-lib primitives that rotate about the given (x, y) origin
 * (drawRectangle, drawImage): compute the origin so the rotated primitive
 * lands exactly on the editor's rotated box.
 */
function rotatedOrigin(ctx: PageCtx, e: PdfEdit) {
  const pc = editCenterPdf(ctx, e);
  // local (0,0) of the primitive == bottom-left of the unrotated box
  const bl = { x: pc.x - e.width / 2, y: pc.y - e.height / 2 };
  const pivot = rotCcw(bl.x, bl.y, pc.x, pc.y, -(e.rotation || 0));
  return { x: pivot.x, y: pivot.y, rotate: degrees(-(e.rotation || 0)) };
}

/** Rotate a display-space point about the edit's center, then map to PDF. */
function editPointPdf(ctx: PageCtx, e: PdfEdit, dx: number, dy: number) {
  const cx = e.x + e.width / 2;
  const cy = e.y + e.height / 2;
  const r = rotCwDisplay(dx, dy, cx, cy, e.rotation || 0);
  return toPdf(ctx, r.x, r.y);
}

async function paintText(ctx: PageCtx, e: TextEdit, env: PaintEnv) {
  const font = await env.fonts.standard(e.fontFamily, e.bold, e.italic);
  const lines = wrapText(e.text, font, e.fontSize, Math.max(10, e.width));
  const lh = e.fontSize * e.lineHeight;
  const ascent = e.fontSize * 0.82;
  const color = hexToColor(e.color);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lw = font.widthOfTextAtSize(line, e.fontSize);
    let lx = e.x;
    if (e.align === "center") lx = e.x + (e.width - lw) / 2;
    else if (e.align === "right") lx = e.x + e.width - lw;
    const baselineDisplay = e.y + ascent + i * lh;
    const p = editPointPdf(ctx, e, lx, baselineDisplay);
    ctx.page.drawText(line, {
      x: p.x,
      y: p.y,
      size: e.fontSize,
      font,
      color,
      opacity: e.opacity,
      rotate: degrees(-(e.rotation || 0)),
    });
    if (e.underline && line.trim()) {
      const a = editPointPdf(ctx, e, lx, baselineDisplay + 2.5);
      const b = editPointPdf(ctx, e, lx + lw, baselineDisplay + 2.5);
      ctx.page.drawLine({
        start: a,
        end: b,
        thickness: Math.max(0.75, e.fontSize / 14),
        color,
        opacity: e.opacity,
      });
    }
  }
}

async function paintHandwritten(ctx: PageCtx, e: Extract<PdfEdit, { type: "handwritten" }>, env: PaintEnv) {
  const ttf = env.fontFiles[e.handStyle];
  const hw = await env.fonts.handwritten(e.handStyle, ttf);
  const textEdit: TextEdit = {
    ...e,
    type: "text",
    fontFamily: "Helvetica",
    bold: false,
    italic: false,
    underline: false,
    align: "left",
    lineHeight: 1.15,
  };
  if (hw) {
    // draw with the embedded handwriting font directly
    const lines = wrapText(e.text, hw, e.fontSize, Math.max(10, e.width));
    const lh = e.fontSize * 1.15;
    const ascent = e.fontSize * 0.8;
    for (let i = 0; i < lines.length; i++) {
      const p = editPointPdf(ctx, e, e.x, e.y + ascent + i * lh);
      ctx.page.drawText(lines[i], {
        x: p.x, y: p.y, size: e.fontSize, font: hw,
        color: hexToColor(e.color), opacity: e.opacity,
        rotate: degrees(-(e.rotation || 0)),
      });
    }
    return;
  }
  // fallback: oblique standard font (honest degradation when TTF missing)
  await paintText(ctx, { ...textEdit, italic: true }, env);
}

function paintRectLike(
  ctx: PageCtx,
  e: PdfEdit,
  opts: { fill?: Color; fillOpacity?: number; border?: Color; borderWidth?: number; dashed?: boolean; blend?: BlendMode },
) {
  const o = rotatedOrigin(ctx, e);
  ctx.page.drawRectangle({
    x: o.x, y: o.y, width: e.width, height: e.height,
    rotate: o.rotate,
    color: opts.fill,
    opacity: opts.fillOpacity ?? e.opacity,
    borderColor: opts.border,
    borderWidth: opts.borderWidth ?? 0,
    borderOpacity: e.opacity,
    borderDashArray: opts.dashed ? [6, 4] : undefined,
    blendMode: opts.blend,
  });
}

function paintShape(ctx: PageCtx, e: ShapeEdit) {
  const stroke = hexToColor(e.strokeColor);
  const fill = e.fillColor === "transparent" ? undefined : hexToColor(e.fillColor);
  const dash = e.dashed ? [6, 4] : undefined;
  switch (e.shape) {
    case "rect": {
      const o = rotatedOrigin(ctx, e);
      ctx.page.drawRectangle({
        x: o.x, y: o.y, width: e.width, height: e.height, rotate: o.rotate,
        color: fill, opacity: e.opacity,
        borderColor: stroke, borderWidth: e.thickness, borderOpacity: e.opacity,
        borderDashArray: dash,
      });
      break;
    }
    case "roundRect": {
      // Baked path: rotation applied to display-space points, then mapped.
      const r = Math.min(14, e.width / 4, e.height / 4);
      const segs: string[] = [];
      const P = (dx: number, dy: number) => editPointPdf(ctx, e, dx, dy);
      // Build rounded-rect as sequence of lines + quadratic corners in PDF space,
      // then negate y for drawSvgPath's internal flip.
      const pdf = (dx: number, dy: number) => {
        const p = P(dx, dy);
        return [p.x, -p.y] as [number, number];
      };
      const f = (n: number) => +n.toFixed(2);
      const [x0, y0] = [e.x, e.y];
      const [x1, y1] = [e.x + e.width, e.y + e.height];
      const c: Array<[number, number]> = [
        pdf(x0 + r, y0), pdf(x1 - r, y0),
      ];
      segs.push(`M ${f(c[0][0])} ${f(c[0][1])}`);
      segs.push(`L ${f(c[1][0])} ${f(c[1][1])}`);
      const q = (cx: number, cy: number, ex: number, ey: number) => {
        const [ccx, ccy] = pdf(cx, cy);
        const [eex, eey] = pdf(ex, ey);
        segs.push(`Q ${f(ccx)} ${f(ccy)} ${f(eex)} ${f(eey)}`);
      };
      const L = (dx: number, dy: number) => {
        const [lx, ly] = pdf(dx, dy);
        segs.push(`L ${f(lx)} ${f(ly)}`);
      };
      q(x1, y0, x1, y0 + r); L(x1, y1 - r); q(x1, y1, x1 - r, y1);
      L(x0 + r, y1); q(x0, y1, x0, y1 - r); L(x0, y0 + r); q(x0, y0, x0 + r, y0);
      segs.push("Z");
      ctx.page.drawSvgPath(segs.join(" "), {
        x: 0, y: 0,
        color: fill, opacity: e.opacity,
        borderColor: stroke, borderWidth: e.thickness, borderOpacity: e.opacity,
        borderDashArray: dash,
      });
      break;
    }
    case "ellipse": {
      const pc = editCenterPdf(ctx, e);
      ctx.page.drawEllipse({
        x: pc.x, y: pc.y, xScale: e.width / 2, yScale: e.height / 2,
        rotate: degrees(-(e.rotation || 0)),
        color: fill, opacity: e.opacity,
        borderColor: stroke, borderWidth: e.thickness, borderOpacity: e.opacity,
        borderDashArray: dash,
      });
      break;
    }
    case "line":
    case "arrow": {
      const a = editPointPdf(ctx, e, e.x, e.y + e.height / 2);
      const b = editPointPdf(ctx, e, e.x + e.width, e.y + e.height / 2);
      const dashArr = e.dashed ? [6, 4] : undefined;
      ctx.page.drawLine({ start: a, end: b, thickness: e.thickness, color: stroke, opacity: e.opacity, dashArray: dashArr });
      if (e.shape === "arrow") {
        // arrowhead at b, computed in display space then mapped
        const cx = e.x + e.width / 2, cy = e.y + e.height / 2;
        const len = Math.min(14, Math.max(8, e.width * 0.2));
        const ang = Math.atan2(0, 1); // pointing +x in unrotated display space
        for (const s of [1, -1]) {
          const ha = ang + s * (Math.PI - Math.PI / 7);
          const tip = { x: e.x + e.width, y: e.y + e.height / 2 };
          const p2 = { x: tip.x + len * Math.cos(ha), y: tip.y + len * Math.sin(ha) };
          const r1 = rotCwDisplay(tip.x, tip.y, cx, cy, e.rotation || 0);
          const r2 = rotCwDisplay(p2.x, p2.y, cx, cy, e.rotation || 0);
          ctx.page.drawLine({
            start: toPdf(ctx, r1.x, r1.y), end: toPdf(ctx, r2.x, r2.y),
            thickness: e.thickness, color: stroke, opacity: e.opacity,
          });
        }
      }
      break;
    }
  }
}

/** Catmull-Rom -> cubic Bezier SVG path through points (already in PDF space). */
function smoothSvgPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return "";
  if (points.length === 1) {
    const p = points[0];
    return `M ${p.x.toFixed(2)} ${(-p.y).toFixed(2)} l 0.01 0`;
  }
  const f = (n: number) => +n.toFixed(2);
  let d = `M ${f(points[0].x)} ${f(-points[0].y)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C ${f(c1.x)} ${f(-c1.y)} ${f(c2.x)} ${f(-c2.y)} ${f(p2.x)} ${f(-p2.y)}`;
  }
  return d;
}

function paintFreehand(ctx: PageCtx, e: FreehandEdit) {
  if (e.points.length === 0) return;
  const pdfPts = e.points.map((p) => toPdf(ctx, p.x, p.y));
  const d = smoothSvgPath(pdfPts);
  ctx.page.drawSvgPath(d, {
    x: 0, y: 0,
    borderColor: hexToColor(e.color),
    borderWidth: e.thickness,
    borderOpacity: e.opacity,
    borderLineCap: LineCapStyle.Round,
    blendMode: e.highlighter ? BlendMode.Multiply : undefined,
  });
}

function sniffImage(bytes: Uint8Array): "png" | "jpg" {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  return "jpg"; // JPEG magic FF D8; default to jpg for anything else
}

async function paintImageLike(
  doc: PDFDocument,
  ctx: PageCtx,
  e: ImageEdit | SignatureEdit,
  env: PaintEnv,
) {
  const raw = env.images.get(e.imageId);
  if (!raw) return; // image blob missing — skip rather than fail the export
  const kind = sniffImage(raw);
  const img = kind === "png" ? await doc.embedPng(raw) : await doc.embedJpg(raw);
  const o = rotatedOrigin(ctx, e);
  ctx.page.drawImage(img, {
    x: o.x, y: o.y, width: e.width, height: e.height,
    rotate: o.rotate, opacity: e.opacity,
  });
}

async function paintStamp(ctx: PageCtx, e: StampEdit, env: PaintEnv) {
  // Border rect + centered bold label.
  const o = rotatedOrigin(ctx, e);
  const color = hexToColor(e.color);
  ctx.page.drawRectangle({
    x: o.x, y: o.y, width: e.width, height: e.height, rotate: o.rotate,
    borderColor: color, borderWidth: Math.max(2, Math.min(6, e.height * 0.12)), borderOpacity: e.opacity,
    opacity: 0,
  });
  const font = await env.fonts.standard("Helvetica", true, false);
  const wAt1 = font.widthOfTextAtSize(e.label, 1) || 1;
  const size = Math.min(e.height * 0.42, (e.width * 0.82) / wAt1, 48);
  const tw = font.widthOfTextAtSize(e.label, size);
  // unrotated origin (display): horizontally centered, vertically centered baseline
  const ox = e.x + (e.width - tw) / 2;
  const oy = e.y + e.height / 2 + size * 0.34;
  const p = editPointPdf(ctx, e, ox, oy);
  ctx.page.drawText(e.label, {
    x: p.x, y: p.y, size, font, color, opacity: e.opacity,
    rotate: degrees(-(e.rotation || 0)),
  });
}

async function paintNote(ctx: PageCtx, e: NoteEdit, env: PaintEnv) {
  if (!env.flattenNotes) return; // kept in the PDFWriter project only
  const o = rotatedOrigin(ctx, e);
  const fill = hexToColor(e.color.startsWith("#") ? e.color : "#fef08a");
  const s = Math.min(e.width, e.height, 22);
  ctx.page.drawRectangle({
    x: o.x, y: o.y, width: s, height: s, rotate: o.rotate,
    color: fill, opacity: 1, borderColor: rgb(0, 0, 0), borderWidth: 0.75, borderOpacity: 0.6,
  });
  const text = (e.text || "").trim();
  if (!text) return;
  const font = await env.fonts.standard("Helvetica", false, false);
  const size = 8;
  const maxW = 180;
  const lines = wrapText(text, font, size, maxW).slice(0, 4);
  const lh = size * 1.3;
  for (let i = 0; i < lines.length; i++) {
    const p = editPointPdf(ctx, e, e.x, e.y + s + 4 + size * 0.8 + i * lh);
    ctx.page.drawText(lines[i], {
      x: p.x, y: p.y, size, font, color: rgb(0.15, 0.15, 0.15),
      rotate: degrees(-(e.rotation || 0)),
    });
  }
}

async function paintEdit(
  doc: PDFDocument,
  ctx: PageCtx,
  e: PdfEdit,
  env: PaintEnv,
) {
  switch (e.type) {
    case "text":
      return paintText(ctx, e as TextEdit, env);
    case "handwritten":
      return paintHandwritten(ctx, e as Extract<PdfEdit, { type: "handwritten" }>, env);
    case "highlight":
      return paintRectLike(ctx, e, { fill: hexToColor((e as Extract<PdfEdit, { type: "highlight" }>).color), fillOpacity: e.opacity, blend: BlendMode.Multiply });
    case "whiteout":
      return paintRectLike(ctx, e, { fill: hexToColor((e as Extract<PdfEdit, { type: "whiteout" }>).color), fillOpacity: e.opacity });
    case "freehand":
      return paintFreehand(ctx, e as FreehandEdit);
    case "shape":
      return paintShape(ctx, e as ShapeEdit);
    case "image":
      return paintImageLike(doc, ctx, e as ImageEdit, env);
    case "signature":
      return paintImageLike(doc, ctx, e as SignatureEdit, env);
    case "stamp":
      return paintStamp(ctx, e as StampEdit, env);
    case "note":
      return paintNote(ctx, e as NoteEdit, env);
  }
}

// ---------------------------------------------------------------------------
// main pipeline
// ---------------------------------------------------------------------------

export async function runExport(input: ExportInput, onProgress?: ProgressFn): Promise<Uint8Array> {
  const report = (phase: string, done: number, total: number) => {
    try {
      onProgress?.(phase, done, total);
    } catch {
      /* progress must never break the export */
    }
  };
  try {
    report("Loading document", 0, 1);
    const out = await PDFDocument.create();
    out.registerFontkit(fontkit);

    const srcDoc = await PDFDocument.load(input.originalBytes, { ignoreEncryption: true });
    const appended = new Map<string, PDFDocument>();
    for (const a of input.appendedDocs) {
      appended.set(a.id, await PDFDocument.load(a.bytes, { ignoreEncryption: true }));
    }
    report("Loading document", 1, 1);

    const fonts = new FontCache(out);
    const images = new Map<string, Uint8Array>(input.images.map((i) => [i.id, new Uint8Array(i.bytes)]));
    const env: PaintEnv = { fonts, fontFiles: input.fontFiles, images, flattenNotes: input.flattenNotes };

    // --- page operations ---
    report("Applying page operations", 0, input.pages.length);
    const pageCtx = new Map<string, PageCtx>();
    for (let i = 0; i < input.pages.length; i++) {
      const meta = input.pages[i];
      let pdfPage: PDFPage;
      if (meta.source === "blank") {
        pdfPage = out.addPage([meta.width, meta.height]);
      } else {
        const src = meta.source === "appended" ? appended.get(meta.sourceDocId ?? "") : srcDoc;
        if (!src) throw new ExportError(`Source document missing for page ${i + 1}.`);
        const [copied] = await out.copyPages(src, [meta.sourcePageIndex]);
        pdfPage = out.addPage(copied);
        const total = totalRotation(meta);
        // Always set explicitly: the copied page retains the source /Rotate,
        // which must be cleared when the total rotation is 0 (e.g. an
        // intrinsically-rotated page the user rotated back to upright).
        pdfPage.setRotation(degrees(total));
      }
      pageCtx.set(meta.id, { page: pdfPage, W: meta.width, H: meta.height, R: totalRotation(meta) });
      if (i % 5 === 0 || i === input.pages.length - 1) {
        report("Applying page operations", i + 1, input.pages.length);
        await yieldToEventLoop();
      }
    }

    // --- overlays, in page order then z order ---
    const order = new Map(input.pages.map((p, i) => [p.id, i]));
    const sorted = [...input.edits].sort((a, b) => {
      const pa = order.get(a.pageId) ?? 0;
      const pb = order.get(b.pageId) ?? 0;
      return pa - pb || a.z - b.z;
    });
    report("Drawing annotations", 0, sorted.length);
    for (let i = 0; i < sorted.length; i++) {
      const e = sorted[i];
      const ctx = pageCtx.get(e.pageId);
      if (!ctx) continue; // edit on a deleted page — skip
      await paintEdit(out, ctx, e, env);
      if (i % 10 === 0 || i === sorted.length - 1) {
        report("Drawing annotations", i + 1, sorted.length);
        await yieldToEventLoop();
      }
    }

    report("Saving PDF", 0, 1);
    const bytes = await out.save({ useObjectStreams: true });
    report("Saving PDF", 1, 1);
    return bytes;
  } catch (err) {
    if (err instanceof ExportError) throw err;
    throw new ExportError(err instanceof Error ? err.message : String(err));
  }
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((res) => setTimeout(res, 0));
}

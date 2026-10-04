/**
 * Export fidelity tests (spec §44): end-to-end coordinate verification.
 *
 * Builds a real PDF with pdf-lib, runs it through the real export pipeline
 * (runExport — the same function the Web Worker calls), then re-opens the
 * output with pdf.js and checks that every text edit landed at the exact
 * native PDF coordinates the coordinate mapper predicts — across page
 * rotations, including the intrinsic-rotation-cancellation case.
 */
import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
// pdf.js: use the legacy build in Node.js environments.
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { runExport, type ExportInput } from "./exportCore";
import { displayToPdfPoint } from "./coordinateMapper";
import { type PageMeta } from "../types/pdf";
import type { PdfEdit } from "../types/editor";

// 1x1 red PNG.
const RED_PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function b64ToBytes(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8.buffer as ArrayBuffer;
}

const W = 595;
const H = 842;

let editSeq = 0;
function base(pageId: string, x: number, y: number, width: number, height: number): Omit<PdfEdit, "type"> & { id: string } {
  return {
    id: `e${++editSeq}`,
    pageId,
    x,
    y,
    width,
    height,
    rotation: 0,
    opacity: 1,
    createdAt: 1,
    z: editSeq,
  };
}

function textEdit(
  pageId: string,
  text: string,
  x: number,
  y: number,
): Extract<PdfEdit, { type: "text" }> {
  return {
    ...base(pageId, x, y, 300, 40),
    type: "text",
    text,
    fontFamily: "Helvetica",
    fontSize: 20,
    bold: false,
    italic: false,
    underline: false,
    color: "#000000",
    align: "left",
    lineHeight: 1.2,
  };
}

async function buildSource(): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const a = doc.addPage([W, H]);
  a.drawText("ORIGINAL-A", { x: 100, y: 742, size: 14, font, color: rgb(0, 0, 0) });
  const b = doc.addPage([W, H]);
  b.drawText("ORIGINAL-B", { x: 100, y: 742, size: 14, font, color: rgb(0, 0, 0) });
  const c = doc.addPage([W, H]);
  c.setRotation(degrees(90)); // intrinsic /Rotate 90
  c.drawText("ORIGINAL-C", { x: 100, y: 742, size: 14, font, color: rgb(0, 0, 0) });
  const bytes = await doc.save();
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return copy.buffer as ArrayBuffer;
}

function meta(
  id: string,
  sourcePageIndex: number,
  rotation: PageMeta["rotation"],
  intrinsicRotation: PageMeta["intrinsicRotation"],
): PageMeta {
  return { id, source: "original", sourcePageIndex, width: W, height: H, rotation, intrinsicRotation };
}

interface TextItem {
  str: string;
  tx: number;
  ty: number;
}

async function extractText(data: ArrayBuffer, pageNum: number): Promise<TextItem[]> {
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(data) });
  const doc = (await loadingTask.promise) as {
    getPage(n: number): Promise<{ getTextContent(): Promise<{ items: unknown[] }> }>;
    destroy?: () => Promise<void>;
  };
  try {
    const page = await doc.getPage(pageNum);
    const tc = await page.getTextContent();
    return tc.items
      .filter((it): it is { str: string; transform: number[] } => typeof it === "object" && it !== null && "str" in it)
      .map((it) => ({ str: it.str, tx: it.transform[4], ty: it.transform[5] }));
  } finally {
    await doc.destroy?.();
  }
}

function find(items: TextItem[], str: string): TextItem {
  const it = items.find((i) => i.str.includes(str));
  if (!it) throw new Error(`text "${str}" not found in extracted content`);
  return it;
}

describe("export coordinate fidelity", () => {
  it("places text at the mapper-predicted native coordinates across rotations", async () => {
    const originalBytes = await buildSource();
    const pages: PageMeta[] = [
      meta("pA", 0, 90, 0), // total R=90
      meta("pB", 1, 0, 0), // total R=0
      meta("pC", 2, 270, 90), // intrinsic 90 + user 270 -> total 0 (cancellation)
    ];

    const edits: PdfEdit[] = [
      textEdit("pA", "FID-ROT90", 50, 60),
      textEdit("pB", "FID-PLAIN", 100, 700),
      textEdit("pC", "FID-CANCEL", 100, 100),
      // Non-text overlays must survive the pipeline without corrupting output.
      { ...base("pB", 100, 650, 150, 40), type: "whiteout", color: "#ffffff" },
      { ...base("pB", 100, 600, 200, 18), type: "highlight", color: "#ffff00" },
      {
        ...base("pB", 300, 300, 60, 40),
        type: "freehand",
        points: [
          { x: 300, y: 300 },
          { x: 330, y: 340 },
          { x: 360, y: 300 },
        ],
        color: "#ff0000",
        thickness: 2,
        highlighter: false,
      },
      {
        ...base("pB", 400, 400, 100, 60),
        type: "shape",
        shape: "rect",
        strokeColor: "#0000ff",
        fillColor: "transparent",
        thickness: 2,
        dashed: false,
      },
      { ...base("pB", 500, 100, 24, 24), type: "note", text: "hello note", author: "", color: "#fef08a" },
      {
        ...base("pB", 100, 400, 50, 50),
        type: "image",
        imageId: "img1",
        naturalWidth: 1,
        naturalHeight: 1,
      },
    ];

    const input: ExportInput = {
      originalBytes,
      appendedDocs: [],
      pages,
      edits,
      images: [{ id: "img1", bytes: b64ToBytes(RED_PX) }],
      fontFiles: {},
      flattenNotes: true,
    };

    const out = await runExport(input);
    expect(out.length).toBeGreaterThan(1000);

    // Output is a valid PDF with 3 pages and correct /Rotate values.
    const check = await PDFDocument.load(out);
    expect(check.getPageCount()).toBe(3);
    expect(check.getPage(0).getRotation().angle).toBe(90);
    const rotB = check.getPage(1).getRotation().angle;
    expect(rotB === 0 || rotB === 360).toBe(true);
    const rotC = check.getPage(2).getRotation().angle;
    expect(rotC === 0 || rotC === 360).toBe(true); // cancellation: source /Rotate 90 cleared

    // Text positions: baseline = y + fontSize * 0.82 (see paintText).
    const ascent = 20 * 0.82;

    // Page A: R=90. display (50, 60+ascent) -> native {x: dy, y: dx}.
    const aItems = await extractText((out.buffer as ArrayBuffer).slice(out.byteOffset, out.byteOffset + out.byteLength), 1);
    const rot90 = find(aItems, "FID-ROT90");
    const expA = displayToPdfPoint(50, 60 + ascent, W, H, 90);
    expect(Math.abs(rot90.tx - expA.x)).toBeLessThan(3);
    expect(Math.abs(rot90.ty - expA.y)).toBeLessThan(3);
    // Original content survived.
    expect(aItems.some((i) => i.str.includes("ORIGINAL-A"))).toBe(true);

    // Page B: R=0. display (100, 700+ascent) -> native {x: dx, y: H - dy}.
    const bItems = await extractText((out.buffer as ArrayBuffer).slice(out.byteOffset, out.byteOffset + out.byteLength), 2);
    const plain = find(bItems, "FID-PLAIN");
    const expB = displayToPdfPoint(100, 700 + ascent, W, H, 0);
    expect(Math.abs(plain.tx - expB.x)).toBeLessThan(3);
    expect(Math.abs(plain.ty - expB.y)).toBeLessThan(3);
    // Flattened note text present.
    expect(bItems.some((i) => i.str.includes("hello note"))).toBe(true);

    // Page C: total R=0 after cancellation. display (100, 100+ascent).
    const cItems = await extractText((out.buffer as ArrayBuffer).slice(out.byteOffset, out.byteOffset + out.byteLength), 3);
    const cancel = find(cItems, "FID-CANCEL");
    const expC = displayToPdfPoint(100, 100 + ascent, W, H, 0);
    expect(Math.abs(cancel.tx - expC.x)).toBeLessThan(3);
    expect(Math.abs(cancel.ty - expC.y)).toBeLessThan(3);
  }, 60000);
});

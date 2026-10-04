/**
 * Coordinate fidelity tests (spec §44).
 *
 * These tests pin the contract: an annotation placed at any corner of the
 * page, at any zoom, under any page rotation, must map to the exact same
 * physical location on the exported PDF.
 */
import { describe, expect, it } from "vitest";
import {
  displayRectToPdfRect,
  displayToPdfPoint,
  displayToScreen,
  pdfPointToDisplay,
  rotatedDisplaySize,
  screenToDisplay,
} from "./coordinateMapper";

const W = 595.28; // A4 width, pt
const H = 841.89; // A4 height, pt
const ROTATIONS = [0, 90, 180, 270] as const;
const EPS = 1e-9;

function close(a: number, b: number) {
  return Math.abs(a - b) < EPS;
}

describe("point round-trips", () => {
  it.each(ROTATIONS)("display -> pdf -> display is identity (R=%i)", (R) => {
    const pts = [
      [0, 0],
      [10.5, 20.25],
      [W / 2, H / 3],
      [W - 1, H - 1],
      [W, H],
    ];
    for (const [dx, dy] of pts) {
      const pdf = displayToPdfPoint(dx, dy, W, H, R);
      const back = pdfPointToDisplay(pdf.x, pdf.y, W, H, R);
      expect(close(back.x, dx)).toBe(true);
      expect(close(back.y, dy)).toBe(true);
    }
  });
});

describe("corner pinning (§44)", () => {
  it("top-left annotation maps to the physical top-left corner for every rotation", () => {
    // Display-space top-left corner of the *displayed* page.
    for (const R of ROTATIONS) {
      const { width: DW, height: DH } = rotatedDisplaySize(W, H, R);
      void DW;
      const pdf = displayToPdfPoint(0, 0, W, H, R);
      const back = pdfPointToDisplay(pdf.x, pdf.y, W, H, R);
      expect(close(back.x, 0)).toBe(true);
      expect(close(back.y, 0)).toBe(true);
      // And the physical location is on the page:
      expect(pdf.x).toBeGreaterThanOrEqual(0);
      expect(pdf.y).toBeGreaterThanOrEqual(0);
      expect(pdf.x).toBeLessThanOrEqual(W);
      expect(pdf.y).toBeLessThanOrEqual(H);
      void DH;
    }
    // Spot-check exact physical corners:
    // R=0: display TL -> unrotated TL = (0, H)
    expect(displayToPdfPoint(0, 0, W, H, 0)).toEqual({ x: 0, y: H });
    // R=90: display TL -> unrotated BL = (0, 0)
    expect(displayToPdfPoint(0, 0, W, H, 90)).toEqual({ x: 0, y: 0 });
    // R=180: display TL -> unrotated BR = (W, 0)
    expect(displayToPdfPoint(0, 0, W, H, 180)).toEqual({ x: W, y: 0 });
    // R=270: display TL -> unrotated TR = (W, H)
    expect(displayToPdfPoint(0, 0, W, H, 270)).toEqual({ x: W, y: H });
  });

  it("all four display corners stay on the physical page for every rotation", () => {
    for (const R of ROTATIONS) {
      const { width: DW, height: DH } = rotatedDisplaySize(W, H, R);
      const corners: Array<[number, number]> = [
        [0, 0],
        [DW, 0],
        [0, DH],
        [DW, DH],
      ];
      const mapped = corners.map(([dx, dy]) => displayToPdfPoint(dx, dy, W, H, R));
      // The four mapped corners must be exactly the four physical corners.
      const key = (p: { x: number; y: number }) =>
        `${Math.round(p.x * 100)},${Math.round(p.y * 100)}`;
      const got = new Set(mapped.map(key));
      const want = new Set(
        [
          [0, 0],
          [W, 0],
          [0, H],
          [W, H],
        ].map(([x, y]) => `${Math.round(x * 100)},${Math.round(y * 100)}`),
      );
      expect(got).toEqual(want);
    }
  });
});

describe("rect transform", () => {
  it("R=0 rect maps with y-flip only", () => {
    const r = displayRectToPdfRect({ x: 10, y: 20, width: 100, height: 50 }, W, H, 0);
    expect(close(r.x, 10)).toBe(true);
    expect(close(r.y, H - 20 - 50)).toBe(true);
    expect(close(r.width, 100)).toBe(true);
    expect(close(r.height, 50)).toBe(true);
  });

  it("R=90 swaps width/height and stays inside the page", () => {
    const r = displayRectToPdfRect({ x: 10, y: 20, width: 100, height: 50 }, W, H, 90);
    expect(close(r.x, 20)).toBe(true);
    expect(close(r.y, 10)).toBe(true);
    expect(close(r.width, 50)).toBe(true);
    expect(close(r.height, 100)).toBe(true);
  });

  it("R=180 rect maps correctly", () => {
    const r = displayRectToPdfRect({ x: 10, y: 20, width: 100, height: 50 }, W, H, 180);
    expect(close(r.x, W - 10 - 100)).toBe(true);
    expect(close(r.y, 20)).toBe(true);
    expect(close(r.width, 100)).toBe(true);
    expect(close(r.height, 50)).toBe(true);
  });

  it("R=270 rect maps correctly", () => {
    const r = displayRectToPdfRect({ x: 10, y: 20, width: 100, height: 50 }, W, H, 270);
    // corners: (10,20)->(W-20,H-10); (110,20)->(W-20,H-110); (10,70)->(W-70,H-10)
    expect(close(r.x, W - 70)).toBe(true);
    expect(close(r.y, H - 110)).toBe(true);
    expect(close(r.width, 50)).toBe(true);
    expect(close(r.height, 100)).toBe(true);
  });

  it("rect round-trips through pdf space for every rotation", () => {
    const rect = { x: 42.5, y: 77.25, width: 120, height: 60 };
    for (const R of ROTATIONS) {
      const pdf = displayRectToPdfRect(rect, W, H, R);
      // Map the pdf rect back corner by corner and rebuild the display rect.
      const tl = pdfPointToDisplay(pdf.x, pdf.y + pdf.height, W, H, R);
      const br = pdfPointToDisplay(pdf.x + pdf.width, pdf.y, W, H, R);
      const xs = [tl.x, br.x];
      const ys = [tl.y, br.y];
      const back = {
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.abs(br.x - tl.x),
        height: Math.abs(br.y - tl.y),
      };
      // For 90/270 the corners swap roles; compare as sets instead:
      const origCorners = [
        [rect.x, rect.y],
        [rect.x + rect.width, rect.y + rect.height],
      ];
      const backCorners = [
        [back.x, back.y],
        [back.x + back.width, back.y + back.height],
      ];
      for (let i = 0; i < 2; i++) {
        expect(close(backCorners[i][0], origCorners[i][0])).toBe(true);
        expect(close(backCorners[i][1], origCorners[i][1])).toBe(true);
      }
    }
  });
});

describe("zoom invariance", () => {
  it("model coordinates do not depend on zoom scale", () => {
    // The same annotation at different zooms must produce identical PDF output.
    const annotation = { x: 100, y: 150 };
    for (const scale of [0.5, 0.75, 1, 1.25, 1.5, 2]) {
      const screen = displayToScreen(annotation.x, annotation.y, scale);
      const back = screenToDisplay(screen.x, screen.y, scale);
      expect(close(back.x, annotation.x)).toBe(true);
      expect(close(back.y, annotation.y)).toBe(true);
      // And the export mapping is scale-independent:
      const pdf = displayToPdfPoint(back.x, back.y, W, H, 0);
      expect(close(pdf.x, 100)).toBe(true);
      expect(close(pdf.y, H - 150)).toBe(true);
    }
  });
});

describe("rotation validation", () => {
  it("rejects non-right-angle rotations", () => {
    expect(() => displayToPdfPoint(0, 0, W, H, 45)).toThrow();
    expect(() => displayToPdfPoint(0, 0, W, H, -30)).toThrow();
  });
});

/**
 * Coordinate mapper — the single source of truth for all coordinate math.
 *
 * Three spaces:
 *
 * 1. DISPLAY space (the edit model): PDF points, origin TOP-LEFT of the page
 *    *as displayed* (intrinsic /Rotate + user rotation already applied),
 *    x grows right, y grows DOWN. This is what PdfEdit stores.
 *
 * 2. PDF space (pdf-lib / PDF native): PDF points, origin BOTTOM-LEFT of the
 *    *unrotated* page, x grows right, y grows UP. This is what export uses.
 *
 * 3. SCREEN space: CSS pixels. screen = display * scale, where scale is the
 *    current zoom scale (fit modes resolve to a scale first).
 *    devicePixelRatio affects ONLY the canvas backing store, never the math.
 *
 * All conversions go through these functions. Nothing else may invent its own
 * mapping — that is how annotations stay put across zoom and export.
 */

export type PageRotation = 0 | 90 | 180 | 270;

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function normRot(r: number): PageRotation {
  const n = ((Math.round(r) % 360) + 360) % 360;
  if (n !== 0 && n !== 90 && n !== 180 && n !== 270) {
    throw new Error(`Invalid page rotation: ${r}`);
  }
  return n as PageRotation;
}

/**
 * Display (top-left, y-down, rotated page) -> PDF native
 * (bottom-left, y-up, unrotated page).
 * W/H are the UNROTATED page dimensions in PDF points.
 */
export function displayToPdfPoint(
  dx: number,
  dy: number,
  W: number,
  H: number,
  rotation: number,
): Point {
  const R = normRot(rotation);
  switch (R) {
    case 0:
      return { x: dx, y: H - dy };
    case 90:
      return { x: dy, y: dx };
    case 180:
      return { x: W - dx, y: dy };
    case 270:
      return { x: W - dy, y: H - dx };
  }
}

/**
 * PDF native (bottom-left, y-up, unrotated) -> display
 * (top-left, y-down, rotated page).
 */
export function pdfPointToDisplay(
  px: number,
  py: number,
  W: number,
  H: number,
  rotation: number,
): Point {
  const R = normRot(rotation);
  switch (R) {
    case 0:
      return { x: px, y: H - py };
    case 90:
      return { x: py, y: px };
    case 180:
      return { x: W - px, y: py };
    case 270:
      return { x: H - py, y: W - px };
  }
}

/**
 * Transform an axis-aligned display-space rect into PDF-native space.
 * Returns the axis-aligned bounding box of the four transformed corners.
 * (Object-level rotation is handled separately at export via pdf-lib
 * `rotate` options — this function only accounts for PAGE rotation.)
 */
export function displayRectToPdfRect(
  rect: Rect,
  W: number,
  H: number,
  rotation: number,
): Rect {
  const corners = [
    displayToPdfPoint(rect.x, rect.y, W, H, rotation),
    displayToPdfPoint(rect.x + rect.width, rect.y, W, H, rotation),
    displayToPdfPoint(rect.x, rect.y + rect.height, W, H, rotation),
    displayToPdfPoint(rect.x + rect.width, rect.y + rect.height, W, H, rotation),
  ];
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    x: minX,
    y: minY,
    width: Math.max(...xs) - minX,
    height: Math.max(...ys) - minY,
  };
}

/** Display PDF points -> CSS pixels at the given zoom scale. */
export function displayToScreen(dx: number, dy: number, scale: number): Point {
  return { x: dx * scale, y: dy * scale };
}

/** CSS pixels -> display PDF points at the given zoom scale. */
export function screenToDisplay(sx: number, sy: number, scale: number): Point {
  return { x: sx / scale, y: sy / scale };
}

/**
 * Display-space dimensions of a page after rotation.
 * W/H are unrotated dimensions.
 */
export function rotatedDisplaySize(
  W: number,
  H: number,
  rotation: number,
): { width: number; height: number } {
  const R = normRot(rotation);
  return R === 90 || R === 270 ? { width: H, height: W } : { width: W, height: H };
}

/** Clamp a display-space point inside the page bounds (with optional margin). */
export function clampToPage(
  p: Point,
  W: number,
  H: number,
  rotation: number,
  margin = 0,
): Point {
  const { width, height } = rotatedDisplaySize(W, H, rotation);
  return {
    x: Math.min(Math.max(p.x, margin), Math.max(margin, width - margin)),
    y: Math.min(Math.max(p.y, margin), Math.max(margin, height - margin)),
  };
}

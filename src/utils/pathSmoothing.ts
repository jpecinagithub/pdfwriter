/**
 * SVG path smoothing shared by the editor renderer.
 * (Export has its own equivalent in exportCore.ts.)
 */
export interface Pt {
  x: number;
  y: number;
}

/** Catmull-Rom -> cubic Bezier path through display-space points. */
export function pointsToSvgPath(points: Pt[], scale: number): string {
  if (points.length === 0) return "";
  const f = (n: number) => +(n * scale).toFixed(2);
  if (points.length === 1) {
    const p = points[0];
    return `M ${f(p.x)} ${f(p.y)} l 0.01 0`;
  }
  let d = `M ${f(points[0].x)} ${f(points[0].y)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(p2.x)} ${f(p2.y)}`;
  }
  return d;
}

/** Distance-based simplification (keeps points at least minDist apart). */
export function simplifyPoints(points: Pt[], minDist: number): Pt[] {
  if (points.length < 3) return points;
  const out: Pt[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const last = out[out.length - 1];
    const dx = points[i].x - last.x;
    const dy = points[i].y - last.y;
    if (dx * dx + dy * dy >= minDist * minDist) out.push(points[i]);
  }
  const lastIn = points[points.length - 1];
  const lastOut = out[out.length - 1];
  if (lastOut !== lastIn) out.push(lastIn);
  return out;
}

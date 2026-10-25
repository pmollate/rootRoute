/**
 * Paints flat HTML onto a surface in the turntable frames: the box side's four corners
 * (TL, TR, BR, BL, in px of the 1600×900 frames) are keyed every 30 frames and interpolated,
 * and the element is warped onto them with a CSS matrix3d.
 */
import { lerp } from './math';

type Pt = [number, number];
type Quad = [Pt, Pt, Pt, Pt];

export const FRAME_W = 1600;
export const FRAME_H = 900;

/** /media/inspect box side, measured on frames 1, 30, 60 … 240 */
const KEYS: Quad[] = [
  [[848, 160], [1275, 258], [1278, 524], [850, 553]],
  [[845, 157], [1290, 248], [1290, 520], [845, 553]],
  [[795, 158], [1332, 243], [1335, 530], [795, 555]],
  [[712, 158], [1380, 228], [1380, 535], [712, 550]],
  [[628, 170], [1405, 208], [1405, 543], [625, 555]],
  [[540, 175], [1420, 185], [1420, 548], [545, 552]],
  [[500, 185], [1375, 160], [1375, 548], [500, 550]],
  [[485, 198], [1300, 130], [1300, 545], [485, 548]],
  [[490, 210], [1165, 100], [1165, 545], [495, 545]],
];

/** the box side at scene progress p (0–1) */
export function panelAt(p: number): Quad {
  const t = Math.min(Math.max(p, 0), 1) * (KEYS.length - 1);
  const i = Math.min(Math.floor(t), KEYS.length - 2);
  const f = t - i;
  return KEYS[i].map((pt, k) => [lerp(pt[0], KEYS[i + 1][k][0], f), lerp(pt[1], KEYS[i + 1][k][1], f)]) as Quad;
}

/** matrix3d that maps a w×h element (origin top-left) onto the quad */
export function quadMatrix(w: number, h: number, [[x0, y0], [x1, y1], [x2, y2], [x3, y3]]: Quad): string {
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = (dx3 * dy2 - dx2 * dy3) / den;
  const k = (dx1 * dy3 - dx3 * dy1) / den;
  const a = x1 - x0 + g * x1, b = x3 - x0 + k * x3;
  const d = y1 - y0 + g * y1, e = y3 - y0 + k * y3;
  const m = [a / w, d / w, 0, g / w, b / h, e / h, 0, k / h, 0, 0, 1, 0, x0, y0, 0, 1];
  return `matrix3d(${m.map((v) => +v.toFixed(8)).join(',')})`;
}

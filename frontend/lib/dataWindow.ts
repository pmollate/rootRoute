/**
 * Labels for the data window, read from `GET /api/overview` (written by analytics/core/window.py). No date, count or
 * period is fixed in the dashboard (REQ-DATA-12, AC-DATA-21): another dataset gives other labels.
 */
import { int } from './metrics';

/** The data-line fields of `GET /api/overview`; null when the analysis tables predate them. Days are `YYYY-MM-DD`. */
export interface DataWindow {
  deliveries?: number | null; warehouses?: number | null; carriers?: number | null;
  windowFrom?: string | null; windowTo?: string | null; recentFrom?: string | null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const parts = (day: string) => ({ y: Number(day.slice(0, 4)), m: MONTHS[Number(day.slice(5, 7)) - 1] });

/** "Apr–Sep 2026", "Nov 2026–Feb 2027", "Aug 2026"; without the year when `year` is false and both are in one year. */
export function monthSpan(from?: string | null, to?: string | null, year = true): string | null {
  if (!from || !to) return null;
  const a = parts(from);
  const b = parts(to);
  if (a.y !== b.y) return `${a.m} ${a.y}–${b.m} ${b.y}`;
  const months = a.m === b.m ? a.m : `${a.m}–${b.m}`;
  return year ? `${months} ${a.y}` : months;
}

/** The shell's data line: "48,340 deliveries" and "Apr–Sep 2026 · 5 sites · 6 carriers"; null until it is known. */
export function dataLine(w?: DataWindow | null): { count: string; detail: string } | null {
  const span = monthSpan(w?.windowFrom, w?.windowTo);
  if (!w || !span || w.deliveries == null || w.warehouses == null || w.carriers == null) return null;
  return { count: `${int(w.deliveries)} deliveries`, detail: `${span} · ${int(w.warehouses)} sites · ${int(w.carriers)} carriers` };
}

/** The day before `day` (UTC), `YYYY-MM-DD`. */
const dayBefore = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

/**
 * The backtest's periods and the replay's recent segment: train = window start to the day before `recentFrom`, test =
 * `recentFrom` to the window end. The year is left out when the whole window is in one year ("Apr–Jul", "Aug–Sep").
 */
export function periods(w?: DataWindow | null): { train: string; test: string } | null {
  if (!w?.windowFrom || !w.windowTo || !w.recentFrom) return null;
  const oneYear = w.windowFrom.slice(0, 4) === w.windowTo.slice(0, 4);
  const train = monthSpan(w.windowFrom, dayBefore(w.recentFrom), !oneYear);
  const test = monthSpan(w.recentFrom, w.windowTo, !oneYear);
  return train && test ? { train, test } : null;
}

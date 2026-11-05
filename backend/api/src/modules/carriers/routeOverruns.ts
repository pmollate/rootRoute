/** Route overrun diagnostics (C9a, SPEC §5.18). Python writes `route_overruns`; this only reshapes it (CONTRACTS §6). */

export interface RouteOverrunDbRow {
  slice: string; value: string; n: number; n_measured: number; n_overrun: number; overrun_rate: number | null;
  late_rate_overrun: number | null; late_rate_other: number | null; n_blank: number; penalty_usd: number;
  handling_usd: number; points_lost: number | null; ratio_to_all: number | null; min_rate: number | null;
  max_rate: number | null; spread_pts: number; stands_out: boolean;
}

export interface RouteOverrunRow {
  value: string; n: number; nMeasured: number; nOverrun: number; overrunRate: number | null;
  lateRateOverrun: number | null; lateRateOther: number | null; nBlank: number; penaltyUsd: number;
  handlingUsd: number; pointsLost: number | null; ratioToAll: number | null; standsOut: boolean;
}

/** minRate / maxRate / spreadPts count only values with at least `min_n` measured deliveries (SPEC §5.18). */
export interface RouteOverrunSlice {
  slice: string; minRate: number | null; maxRate: number | null; spreadPts: number; standsOut: boolean; rows: RouteOverrunRow[];
}
export interface RouteOverruns { all: RouteOverrunRow; slices: RouteOverrunSlice[] }

const toRow = (r: RouteOverrunDbRow): RouteOverrunRow => ({
  value: r.value, n: r.n, nMeasured: r.n_measured, nOverrun: r.n_overrun, overrunRate: r.overrun_rate,
  lateRateOverrun: r.late_rate_overrun, lateRateOther: r.late_rate_other, nBlank: r.n_blank, penaltyUsd: r.penalty_usd,
  handlingUsd: r.handling_usd, pointsLost: r.points_lost, ratioToAll: r.ratio_to_all, standsOut: r.stands_out,
});

const SLICE_ORDER = ['all', 'carrier', 'region', 'warehouse', 'stops_band', 'weekday', 'month'];
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const STOPS_BANDS = ['up to 10', '11-20', '21-30', '31+', 'unknown']; // analytics/routes/overruns.py
const rank = (xs: string[], x: string) => (xs.includes(x) ? xs.indexOf(x) : xs.length);

/** Values in reading order: weekdays Monday first, stops bands by size, the rest A–Z. */
function byValue(slice: string, a: string, b: string): number {
  if (slice === 'weekday') return rank(WEEKDAYS, a) - rank(WEEKDAYS, b);
  if (slice === 'stops_band') return rank(STOPS_BANDS, a) - rank(STOPS_BANDS, b);
  return a.localeCompare(b);
}

/** Slices in §5.18 order. Null when there is no `all` row: not data (the route answers 503). */
export function shapeRouteOverruns(rows: RouteOverrunDbRow[]): RouteOverruns | null {
  const all = rows.find((r) => r.slice === 'all');
  if (!all) return null;
  const sorted = [...rows].sort((a, b) =>
    rank(SLICE_ORDER, a.slice) - rank(SLICE_ORDER, b.slice) || a.slice.localeCompare(b.slice) || byValue(a.slice, a.value, b.value));
  const slices = new Map<string, RouteOverrunSlice>();
  for (const r of sorted) {
    if (r.slice === 'all') continue;
    const s = slices.get(r.slice)
      ?? { slice: r.slice, minRate: r.min_rate, maxRate: r.max_rate, spreadPts: r.spread_pts, standsOut: false, rows: [] };
    s.rows.push(toRow(r));
    s.standsOut ||= r.stands_out;
    slices.set(r.slice, s);
  }
  return { all: toRow(all), slices: [...slices.values()] };
}

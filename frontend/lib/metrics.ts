/** Number formats for the dashboard. Rates arrive as 0..1 from the API. */
export const pct = (x: number | null | undefined, digits = 1) => (x == null ? '—' : `${(x * 100).toFixed(digits)}%`);
export const int = (x: number | null | undefined) => (x == null ? '—' : Math.round(x).toLocaleString('en-US'));
export const usd = (x: number | null | undefined) =>
  x == null ? '—' : x.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
/** 1349106 → "$1.35M": headline money */
export const usdShort = (x: number) =>
  x.toLocaleString('en-US', { style: 'currency', currency: 'USD', notation: 'compact', minimumFractionDigits: 0, maximumFractionDigits: 2 });
/** 872460 → "$872k" */
export const usdK = (x: number) => `$${Math.round(x / 1000).toLocaleString('en-US')}k`;
export const usd2 =(x: number | null | undefined) => (x == null ? '—' : x.toLocaleString('en-US', { style: 'currency', currency: 'USD' }));
/** 0.0763 → "7.6": points of on-time delivery */
export const points = (x: number) => (x * 100).toFixed(1);

/**
 * Points lost per cause, rounded to one decimal so the parts add up to their rounded total (largest remainder; SPEC
 * §2.2, v0.20). Plain rounding gives 7.6 + 7.0 + 5.6 + 5.6 + 3.1 = 28.9 next to a 29.0 total; this gives
 * 7.6 / 7.0 / 5.6 / 5.6 / 3.2. Keyed by cause, values as `points()` strings.
 */
export function pointsToTotal(rows: readonly { cause: string; pointsLost: number }[]): Map<string, string> {
  const tenths = rows.map((r) => r.pointsLost * 1000); // points × 10: one decimal of a point
  const floors = tenths.map(Math.floor);
  let left = Math.round(tenths.reduce((a, b) => a + b, 0)) - floors.reduce((a, b) => a + b, 0);
  const order = tenths.map((t, i) => [t - floors[i], i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) { if (left <= 0) break; floors[i] += 1; left -= 1; }
  return new Map(rows.map((r, i) => [r.cause, (floors[i] / 10).toFixed(1)]));
}

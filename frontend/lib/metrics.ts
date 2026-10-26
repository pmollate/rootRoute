/** Number formats for the dashboard. Rates arrive as 0..1 from the API. */
export const pct = (x: number | null | undefined, digits = 1) => (x == null ? '—' : `${(x * 100).toFixed(digits)}%`);
export const int = (x: number | null | undefined) => (x == null ? '—' : Math.round(x).toLocaleString('en-US'));
export const usd = (x: number | null | undefined) =>
  x == null ? '—' : x.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
export const usd2 = (x: number) => x.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
/** 0.0763 → "7.6": points of on-time delivery */
export const points = (x: number) => (x * 100).toFixed(1);

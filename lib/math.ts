export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** where p sits inside [a, b], clamped to 0–1 */
export const local = (p: number, [a, b]: [number, number]) => clamp((p - a) / (b - a));
/** 1840 → "1,840" */
export const group = (s: string) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export const RAD = Math.PI / 180;
export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const rand = (a: number, b: number) => a + Math.random() * (b - a);
/** where p sits inside [a, b], clamped to 0–1 */
export const local = (p: number, [a, b]: [number, number]) => clamp((p - a) / (b - a));

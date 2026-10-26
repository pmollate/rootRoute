/**
 * The film chapter on screen (1–5), set by the pinned scenes as they scroll. Subscribers (the
 * chapter rail) hear about changes only, not every scroll frame.
 */
let current = 1;
const subs = new Set<(c: number) => void>();

export const chapter = {
  get: () => current,
  set: (c: number) => {
    if (c === current) return;
    current = c;
    subs.forEach((f) => f(c));
  },
  sub: (f: (c: number) => void) => {
    subs.add(f);
    return () => void subs.delete(f);
  },
};

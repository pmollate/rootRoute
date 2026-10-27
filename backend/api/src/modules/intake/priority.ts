// REQ-PRI-01/02: Tier 1 and at-risk clients are served first (7 of the 9 accounts threatening to leave are Tier 1).
export function isPriority(accountTier: string | null | undefined, atRisk: boolean): boolean {
  return accountTier === 'Tier 1' || atRisk;
}

/** Stable sort: priority clients first, otherwise keep the given order. */
export function byPriority<T>(items: T[], priority: (item: T) => boolean): T[] {
  return items.map((item, i) => ({ item, i, p: priority(item) }))
    .sort((a, b) => Number(b.p) - Number(a.p) || a.i - b.i)
    .map((x) => x.item);
}

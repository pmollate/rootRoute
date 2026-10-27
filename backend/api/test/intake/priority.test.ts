import { describe, expect, it } from 'vitest';
import { byPriority, isPriority } from '../../src/modules/intake/priority.js';

describe('Tier 1 prioritisation', () => {
  it('AC-PRI-01: Tier 1 and at-risk clients are priority; others are not', () => {
    expect(isPriority('Tier 1', false)).toBe(true);
    expect(isPriority('Tier 2', true)).toBe(true);
    expect(isPriority('Tier 3', false)).toBe(false);
  });

  it('AC-PRI-02: priority items come first and keep their order', () => {
    const items = [{ id: 1, p: false }, { id: 2, p: true }, { id: 3, p: false }, { id: 4, p: true }];
    expect(byPriority(items, (x) => x.p).map((x) => x.id)).toEqual([2, 4, 1, 3]);
  });
});

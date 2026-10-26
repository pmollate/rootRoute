import { describe, expect, it } from 'vitest';
import { allocateBatch, isFriday, rankLane, recommendFromLane } from '../../src/modules/carriers/domain.js';
import { NE_NEXT_DAY } from './lane.fixture.js';

describe('carrier recommendation', () => {
  it('AC-CAR-03: Northeast next-day recommends E with a backup and a reason', () => {
    const rec = recommendFromLane(NE_NEXT_DAY, false);
    expect(rec.carrier).toBe('E');
    expect(rec.backup).not.toBe('E');
    expect(rec.backup).not.toBe('F');
    expect(rec.reason).toBe('Carrier E for Northeast next-day: 97% on time vs 55% for F; $1.62 more per shipment');
    expect(rec.blocked).toEqual(['F']);
  });

  it('uses SLA weights for clients with a penalty clause', () => {
    expect(rankLane(NE_NEXT_DAY, true).map((r) => r.carrier_id).slice(0, 3)).toEqual(['E', 'A', 'C']);
  });

  it('AC-CAR-04: with a 40% share no carrier takes more than 40 of 100 orders', () => {
    const ranked = rankLane(NE_NEXT_DAY, false);
    const limits = { A: 40, B: 40, C: 40, D: 40, E: 40 };
    const used = allocateBatch(100, ranked, limits);
    expect(Math.max(...Object.values(used).map(Number))).toBeLessThanOrEqual(40);
    expect(Object.values(used).reduce((a, b) => a + (b ?? 0), 0)).toBe(100);
  });

  it('AC-CAR-08: on a Friday, D at its Friday limit is skipped and the order overflows to the next carrier', () => {
    expect(isFriday('2026-09-18')).toBe(true);
    expect(isFriday('2026-09-17')).toBe(false);
    const dFirst = NE_NEXT_DAY.map((r) => (r.carrier_id === 'D' ? { ...r, score_default: 99 } : r));
    const rec = recommendFromLane(dFirst, false, { D: 19 }, { D: 19 });
    expect(rec.carrier).toBe('E');
    expect(rec.options.find((o) => o.carrier === 'D')?.reason).toBe('at daily capacity');
  });

  it('AC-CAR-07: contract capacity N caps the favoured carrier at N', () => {
    const used = allocateBatch(35, rankLane(NE_NEXT_DAY, false), { E: 25 });
    expect(used.E).toBe(25);
    expect(used.A).toBe(10);
  });
});

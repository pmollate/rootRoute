import { describe, expect, it } from 'vitest';
import { SCREENS } from '@/config/dashboard';
import { int, pct, points, pointsToTotal, usd } from './metrics';

describe('dashboard basics', () => {
  it('formats numbers', () => {
    expect(pct(0.71)).toBe('71.0%');
    expect(usd(872460)).toBe('$872,460');
    expect(int(14019)).toBe('14,019');
    expect(points(0.0763)).toBe('7.6');
  });

  it('lists the six screens under /dashboard (Replay is Labs, in the bar)', () => {
    expect(SCREENS.map((s) => s.href)).toEqual([
      '/dashboard/overview', '/dashboard/intake', '/dashboard/complaints', '/dashboard/warehouses', '/dashboard/carriers', '/dashboard/journey',
    ]);
  });
});

describe('points lost that add up (SPEC §2.2, v0.20)', () => {
  // The supplied data's cause_attribution values (analytics/core/scenarios.py).
  const CAUSES = [
    { cause: 'f_lane', pointsLost: 0.076260 }, { cause: 'f_addr', pointsLost: 0.070473 },
    { cause: 'f_stock', pointsLost: 0.056097 }, { cause: 'f_cutoff', pointsLost: 0.055689 },
    { cause: 'f_route', pointsLost: 0.031489 },
  ];

  it('rounds the five causes to 7.6 / 7.0 / 5.6 / 5.6 / 3.2, which add to the 29.0 total', () => {
    const shown = pointsToTotal(CAUSES);
    expect([...shown.values()]).toEqual(['7.6', '7.0', '5.6', '5.6', '3.2']);
    expect([...shown.values()].reduce((t, v) => t + Number(v), 0).toFixed(1)).toBe(points(CAUSES.reduce((t, c) => t + c.pointsLost, 0)));
    expect(CAUSES.map((c) => points(c.pointsLost))).toEqual(['7.6', '7.0', '5.6', '5.6', '3.1']); // plain rounding: 28.9
  });

  it('leaves values that already add up alone, and handles one or no cause', () => {
    expect([...pointsToTotal([{ cause: 'a', pointsLost: 0.012 }, { cause: 'b', pointsLost: 0.021 }]).values()]).toEqual(['1.2', '2.1']);
    expect(pointsToTotal([{ cause: 'a', pointsLost: 0.03149 }]).get('a')).toBe('3.1');
    expect(pointsToTotal([]).size).toBe(0);
  });
});

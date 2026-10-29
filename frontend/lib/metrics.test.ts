import { describe, expect, it } from 'vitest';
import { SCREENS } from '@/config/dashboard';
import { int, pct, points, usd } from './metrics';

describe('dashboard basics', () => {
  it('formats numbers', () => {
    expect(pct(0.71)).toBe('71.0%');
    expect(usd(872460)).toBe('$872,460');
    expect(int(14019)).toBe('14,019');
    expect(points(0.0763)).toBe('7.6');
  });

  it('lists the seven screens under /dashboard', () => {
    expect(SCREENS.map((s) => s.href)).toEqual([
      '/dashboard/overview', '/dashboard/intake', '/dashboard/complaints', '/dashboard/warehouses', '/dashboard/carriers', '/dashboard/journey',
      '/dashboard/replay',
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import { dataLine, monthSpan, periods } from './dataWindow';

const FULL = { deliveries: 48340, warehouses: 5, carriers: 6, windowFrom: '2026-04-01', windowTo: '2026-09-25', recentFrom: '2026-08-01' };

describe('data window labels (AC-DATA-21: from the API, never fixed)', () => {
  it('AC-DATA-21: month spans in one year, across a year end, and within a month', () => {
    expect(monthSpan('2026-04-01', '2026-09-25')).toBe('Apr–Sep 2026');
    expect(monthSpan('2026-11-03', '2027-02-02')).toBe('Nov 2026–Feb 2027');
    expect(monthSpan('2026-08-01', '2026-08-31')).toBe('Aug 2026');
    expect(monthSpan(null, '2026-09-25')).toBeNull();
  });

  it('AC-DATA-21: the data line reads the counts and the window', () => {
    expect(dataLine(FULL)).toEqual({ count: '48,340 deliveries', detail: 'Apr–Sep 2026 · 5 sites · 6 carriers' });
    expect(dataLine(undefined)).toBeNull();
    expect(dataLine({ ...FULL, windowFrom: null })).toBeNull();
  });

  it('REQ-DATA-14: train and test periods of the backtest come from the window', () => {
    expect(periods(FULL)).toEqual({ train: 'Apr–Jul', test: 'Aug–Sep' });
    expect(periods({ ...FULL, windowFrom: '2026-11-03', recentFrom: '2027-01-01', windowTo: '2027-02-02' }))
      .toEqual({ train: 'Nov–Dec 2026', test: 'Jan–Feb 2027' });
    expect(periods({ ...FULL, recentFrom: null })).toBeNull();
  });
});

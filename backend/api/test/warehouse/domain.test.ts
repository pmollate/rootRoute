import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { addDays, checkPromise, chooseWarehouse, CUTOFF_HOUR, linkExpiry } from '../../src/modules/warehouse/domain.js';

const MILES_MIDWEST = { W1: 150, W2: 200, W3: 700, W4: 800, W5: 1700 };

describe('promise rules', () => {
  it('the order-time cut-off matches the analytics rules config', () => {
    const rules = JSON.parse(readFileSync(new URL('../../../analytics/rules.json', import.meta.url), 'utf8'));
    expect(CUTOFF_HOUR).toBe(rules.cutoff_hour);
  });

  it('AC-PRO-01: same-day at 08:00 becomes next day with a reason; 07:59 keeps same day', () => {
    const late = checkPromise('same_day', '2026-10-26 08:00');
    expect(late).toMatchObject({ commitment: 'next_day', promiseDate: '2026-10-28', downgraded: true });
    expect(late.reason).toContain('08:00');
    expect(checkPromise('same_day', '2026-10-26 07:59')).toEqual({
      commitment: 'same_day', promiseDate: '2026-10-27', downgraded: false, reason: null,
    });
  });

  it('uses the data lead times for next day and standard', () => {
    expect(checkPromise('next_day', '2026-10-26 15:00').promiseDate).toBe('2026-10-28');
    expect(checkPromise('standard', '2026-10-30 09:00').promiseDate).toBe('2026-11-03');
  });

  it('adds days across month ends', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
  });
});

describe('warehouse choice', () => {
  it('AC-PRO-02: ships from the nearest warehouse when it has stock', () => {
    const c = chooseWarehouse({ destinationRegion: 'Southeast', nearestWarehouseId: 'W3', stock: {} }, MILES_MIDWEST);
    expect(c).toMatchObject({ warehouseId: 'W3', warnClient: false });
  });

  it('AC-PRO-03: Midwest order nearest W1 with W1 short goes to partner W2 first', () => {
    const c = chooseWarehouse({ destinationRegion: 'Midwest', nearestWarehouseId: 'W1', stock: { W1: false } }, MILES_MIDWEST);
    expect(c).toMatchObject({ warehouseId: 'W2', warnClient: false });
  });

  it('falls back to the closest warehouse with stock and warns the client', () => {
    const c = chooseWarehouse(
      { destinationRegion: 'Midwest', nearestWarehouseId: 'W1', stock: { W1: false, W2: false } }, MILES_MIDWEST,
    );
    expect(c).toMatchObject({ warehouseId: 'W3', warnClient: true });
  });
});

describe('confirm-address link expiry', () => {
  it('AC-PRO-04: link created 10:00 with an 08:00 cut-off expires 06:00 next day', () => {
    expect(linkExpiry('2026-10-26 10:00')).toBe('2026-10-27 06:00');
  });

  it('before the cut-off: expires 2 h before today\'s cut-off', () => {
    expect(linkExpiry('2026-10-26 05:00')).toBe('2026-10-26 06:00');
  });
});

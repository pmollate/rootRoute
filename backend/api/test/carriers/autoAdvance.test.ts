import { describe, expect, it } from 'vitest';
import { autoAdvancePlan, type AutoAdvanceInput } from '../../src/modules/carriers/autoAdvance.js';

const plan = (o: Partial<AutoAdvanceInput> = {}) => autoAdvancePlan({ receivedAt: '2026-10-28 07:15', promiseDate: '2026-10-29',
  approvedAt: '2026-10-28 09:40', wmsOrderId: 'WMS-000007', ...o });

describe('auto-advance plan (design 2026-10-30-order-journey-auto-advance §6)', () => {
  it('AC-JRN-15: six steps in order, at realistic times, shown 5 seconds apart, delivered on the promise date', () => {
    expect(plan().map((e) => [e.event, e.ts, e.showAfterSec])).toEqual([
      ['wms_entered', '2026-10-28 09:40', 0], ['picked', '2026-10-28 10:00', 5], ['picked_up', '2026-10-28 15:00', 10],
      ['in_transit', '2026-10-28 16:00', 15], ['out_for_delivery', '2026-10-29 08:00', 20], ['delivered', '2026-10-29 12:00', 25]]);
    expect(plan()[0].detail).toEqual({ wmsOrderId: 'WMS-000007', auto: true });
    expect(plan()[5].detail).toEqual({ auto: true });
  });

  it('an order received at or after the 08:00 cut-off is picked the next day', () => {
    expect(plan({ receivedAt: '2026-10-28 08:00', promiseDate: '2026-10-30' })[1].ts).toBe('2026-10-29 10:00');
  });

  it('REQ-JRN-15: an approval after the pick time moves the later steps to it, never earlier than the step before', () => {
    expect(plan({ approvedAt: '2026-10-28 17:30' }).map((e) => e.ts)).toEqual(
      ['2026-10-28 17:30', '2026-10-28 17:30', '2026-10-28 17:30', '2026-10-28 17:30', '2026-10-29 08:00', '2026-10-29 12:00']);
  });

  it('AC-JRN-18: an approval after the promise date delivers an hour after it goes out; the data is not bent to look on time', () => {
    expect(plan({ approvedAt: '2026-10-30 09:00' }).map((e) => e.ts)).toEqual(
      ['2026-10-30 09:00', '2026-10-30 09:00', '2026-10-30 15:00', '2026-10-30 16:00', '2026-10-30 16:00', '2026-10-30 17:00']);
  });
});

import { describe, expect, it } from 'vitest';
import { bearerAuth } from '../../src/core/bearer.js';
import { checkEvent, localNow, type OrderEventRow } from '../../src/modules/carriers/orderEvents.js';

const row = (event: OrderEventRow['event'], ts: string): OrderEventRow => ({ event, ts, detail: {} });
const ENTERED = [row('wms_entered', '2026-10-30 09:00')];

describe('order event rules (design §6)', () => {
  it('AC-JRN-13: the first event is wms_entered; nothing else comes before it', () => {
    expect(checkEvent([], 'wms_entered', '2026-10-30 09:00')).toEqual({ code: 201 });
    expect(checkEvent([], 'picked', '2026-10-30 09:00')).toEqual({ code: 409, error: 'order is not in the WMS' });
  });

  it('AC-JRN-13: each event needs the one before it', () => {
    expect(checkEvent(ENTERED, 'picked', '2026-10-30 10:00')).toEqual({ code: 201 });
    expect(checkEvent(ENTERED, 'picked_up', '2026-10-30 10:00')).toEqual({ code: 409, error: 'picked_up needs picked first' });
    const upToTransit = [...ENTERED, row('picked', '2026-10-30 10:00'), row('picked_up', '2026-10-30 14:00'),
      row('in_transit', '2026-10-30 18:00')];
    expect(checkEvent(upToTransit, 'delivered', '2026-10-31 12:00'))
      .toEqual({ code: 409, error: 'delivered needs out_for_delivery first' });
    expect(checkEvent(upToTransit, 'out_for_delivery', '2026-10-31 08:00')).toEqual({ code: 201 });
  });

  it('AC-JRN-13: a ts earlier than the previous event is refused; the same ts is allowed', () => {
    expect(checkEvent(ENTERED, 'picked', '2026-10-30 08:59')).toEqual({ code: 409, error: 'ts before wms_entered' });
    expect(checkEvent(ENTERED, 'picked', '2026-10-30 09:00')).toEqual({ code: 201 });
  });

  it('AC-JRN-13: a repeat with the same ts changes nothing (200); with another ts it is refused', () => {
    const picked = [...ENTERED, row('picked', '2026-10-30 10:00')];
    expect(checkEvent(picked, 'picked', '2026-10-30 10:00')).toEqual({ code: 200 });
    expect(checkEvent(picked, 'picked', '2026-10-30 11:00')).toEqual({ code: 409, error: 'already recorded' });
    expect(checkEvent(ENTERED, 'wms_entered', '2026-10-30 09:30')).toEqual({ code: 409, error: 'already recorded' });
  });

  it('localNow gives local YYYY-MM-DD HH:mm', () => {
    expect(localNow(new Date(2026, 9, 30, 7, 5))).toBe('2026-10-30 07:05');
  });
});

describe('events API token (design §6)', () => {
  it('AC-SEC-JRN-04: no token configured is 503 (off, never open); a wrong or missing token is 401', () => {
    const token = 'test-wms-events-0123456789';
    expect(bearerAuth(`Bearer ${token}`, undefined)).toBe(503);
    expect(bearerAuth(undefined, token)).toBe(401);
    expect(bearerAuth('Bearer wrong', token)).toBe(401);
    expect(bearerAuth(`Bearer ${token}`, token)).toBe(200);
  });
});

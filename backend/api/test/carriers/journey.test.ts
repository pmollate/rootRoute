import { describe, expect, it } from 'vitest';
import {
  buildDeliveryJourney, buildEmailJourney, type CauseFlags, type DeliveryFacts, type EmailFacts,
} from '../../src/modules/carriers/journey.js';
import { autoAdvancePlan } from '../../src/modules/carriers/autoAdvance.js';

/** D000213 as it is in deliveries.csv: C190, email, incomplete address, carrier F to the Northeast, 4 days late. */
const D000213: DeliveryFacts = {
  deliveryId: 'D000213', orderId: 'ORD-1', clientId: 'C190', tier: 'Tier 1', channel: 'Email', emailFormat: '6',
  receivedAt: '2026-04-01 11:04', commitment: 'standard', promisedDate: '2026-04-05', addressStatus: 'incomplete',
  pickDate: '2026-04-02', shippedAt: '2026-04-02 09:56', region: 'Northeast', nearest: 'W4', fulfilment: 'W4',
  nearestHadStock: true, carrier: 'F', deliveredDate: '2026-04-09', daysLate: 4, onTime: false,
  plannedKm: 70, actualKm: 72,
};
const NO_FLAGS: CauseFlags = {
  f_addr: false, f_cutoff: false, f_stock: false, f_stock_out: false, f_skip_nearest: false,
  f_lane: false, f_bad_lane: false, f_d_friday: false, f_route: false,
};
const EVENTS = [
  { event: 'picked_up', at: '2026-04-02 09:56', source: 'batch' },
  { event: 'in_transit', at: '2026-04-02 15:56', source: 'batch' },
  { event: 'delivered', at: '2026-04-09 14:00', source: 'batch' },
];
const ADVICE = {
  promise: { promiseDate: '2026-04-05', commitment: 'standard' as const, downgraded: false, reason: null },
  warehouse: { warehouseId: 'W4' as const, reason: 'Nearest warehouse W4 has stock.', warnClient: false },
  carrier: 'Carrier E for Northeast standard: 96% on time vs 57% for F; $1.63 more per shipment',
};
const byKey = (j: { stages: { key: string }[] }, key: string) => j.stages.find((s) => s.key === key)!;

describe('past delivery journey', () => {
  it('AC-JRN-01: returns the 14 stages in order', () => {
    const j = buildDeliveryJourney(D000213, { ...NO_FLAGS, f_addr: true, f_lane: true, f_bad_lane: true }, EVENTS, ADVICE);
    expect(j.ref).toBe('delivery:D000213');
    expect(j.stages.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    expect(j.stages.map((s) => s.key)).toEqual(['received', 'read', 'address', 'promise', 'warehouse', 'carrier',
      'approved', 'told', 'wms', 'picked', 'handed', 'transit', 'delivered', 'notice']);
  });

  it('AC-JRN-07: marks only the stages named by its cause flags as failed, with the rule output beside them', () => {
    const j = buildDeliveryJourney(D000213, { ...NO_FLAGS, f_addr: true, f_lane: true, f_bad_lane: true }, EVENTS, ADVICE);
    const failed = j.stages.filter((s) => s.status === 'failed').map((s) => s.key);
    expect(failed).toEqual(['address', 'carrier', 'delivered']);
    expect(byKey(j, 'address').withLateLens).toMatch(/CONFIRM_ADDRESS/);
    expect(byKey(j, 'carrier').withLateLens).toBe(ADVICE.carrier);
    expect(byKey(j, 'delivered').detail).toMatch(/4 days late/);
    expect(byKey(j, 'promise').status).toBe('done');
  });

  it('AC-JRN-07: a cut-off miss shows the promise rule moving the order to next day, with its reason', () => {
    const cut = { ...D000213, commitment: 'same_day', receivedAt: '2026-04-02 13:08', addressStatus: 'complete' };
    const promise = { promiseDate: '2026-04-03', commitment: 'next_day' as const, downgraded: true,
      reason: "Received at 13:08, after the 08:00 pick-list cut-off, so it goes on the next day's pick list." };
    const j = buildDeliveryJourney(cut, { ...NO_FLAGS, f_cutoff: true }, EVENTS, { ...ADVICE, promise });
    expect(j.stages.filter((s) => s.status === 'failed').map((s) => s.key)).toEqual(['promise', 'delivered']);
    expect(byKey(j, 'promise').withLateLens).toMatch(/after the 08:00 pick-list cut-off/);
    expect(byKey(j, 'promise').withLateLens).toMatch(/2026-04-03/);
  });

  it('marks Friday overload on D as a capacity problem, not a blocked lane', () => {
    const j = buildDeliveryJourney({ ...D000213, carrier: 'D', addressStatus: 'complete' },
      { ...NO_FLAGS, f_lane: true, f_d_friday: true }, EVENTS, ADVICE);
    expect(byKey(j, 'carrier').detail).toMatch(/Friday/);
    expect(byKey(j, 'carrier').withLateLens).toMatch(/capped on Fridays/);
  });

  it('marks a route detour at the transit stage with no LateLens fix', () => {
    const j = buildDeliveryJourney({ ...D000213, actualKm: 90 }, { ...NO_FLAGS, f_route: true }, EVENTS, ADVICE);
    expect(byKey(j, 'transit').status).toBe('failed');
    expect(byKey(j, 'transit').withLateLens).toMatch(/routing pilot/);
  });

  it('REQ-JRN-08: tracking stages are synthetic, an on-time delivery is done, and Halcyon-only steps are skipped', () => {
    const j = buildDeliveryJourney({ ...D000213, onTime: true, daysLate: 0, addressStatus: 'complete' }, NO_FLAGS, EVENTS, ADVICE);
    expect(byKey(j, 'transit').source).toBe('synthetic');
    expect(j.synthetic).toBe(true);
    expect(byKey(j, 'delivered').status).toBe('done');
    expect(['approved', 'told', 'notice'].map((k) => byKey(j, k).status)).toEqual(['skipped', 'skipped', 'skipped']);
    expect(j.stages.some((s) => s.status === 'failed')).toBe(false);
  });
});

const EMAIL: EmailFacts = {
  id: 8, clientId: 'C003', tier: 'Tier 2', status: 'AWAITING_APPROVAL', receivedAt: '2026-10-28 07:20',
  rounds: [{ id: 8, receivedAt: '2026-10-28 07:20', decision: 'ALL_CLEAR' }],
  destination: { city: 'Detroit', state: 'MI', zip: '48226' }, commitment: 'same_day', decision: 'ALL_CLEAR',
  checks: {
    promise: { promiseDate: '2026-10-29', commitment: 'same_day', downgraded: false, reason: null },
    warehouse: { warehouseId: 'W1', reason: 'Nearest warehouse W1 has stock.', warnClient: false },
    carrier: { carrier: 'A', backup: 'B', reason: 'Carrier A for Midwest same-day' },
  },
  approvals: [], outbound: [], overrides: [], events: [],
};

describe('new order journey', () => {
  const ENTERED_EMAIL: EmailFacts = { ...EMAIL, status: 'ENTERED',
    approvals: [{ action: 'approve', actor: 'sup', at: '2026-10-28 07:50', reason: null },
      { action: 'send_to_wms', actor: 'sup', at: '2026-10-28 07:55', reason: null }],
    events: [{ event: 'wms_entered', ts: '2026-10-28 07:55', detail: { wmsOrderId: 'WMS-000008' } }] };
  const ev = (event: EmailFacts['events'][number]['event'], ts: string) => ({ event, ts, detail: {} });

  it('AC-JRN-18: an auto-advanced order says so at step 9, and a delivery after the promise date shows late', () => {
    const auto: EmailFacts = { ...EMAIL, status: 'ENTERED',
      approvals: [{ action: 'approve', actor: 'desk', at: '2026-10-30 09:00', reason: null },
        { action: 'send_to_wms', actor: 'system:auto-advance', at: '2026-10-30 09:00', reason: null }],
      events: autoAdvancePlan({ receivedAt: EMAIL.receivedAt, promiseDate: '2026-10-29', approvedAt: '2026-10-30 09:00',
        wmsOrderId: 'WMS-000008' }).map(({ event, ts, detail }) => ({ event, ts, detail })) };
    const j = buildEmailJourney(auto, '2026-10-30 18:00');
    expect(byKey(j, 'wms')).toMatchObject({ status: 'done', actor: 'Auto-advance (simulated)', source: 'synthetic',
      detail: 'Entered in the simulated WMS as WMS-000008 automatically.' });
    expect(byKey(j, 'delivered')).toMatchObject({ status: 'failed', detail: 'Delivered 1 day late (promised 2026-10-29).' });
  });

  it('AC-JRN-14: entered in the simulated WMS: stage 9 synthetic with the WMS number, picking is current', () => {
    const j = buildEmailJourney(ENTERED_EMAIL, '2026-10-28 08:00');
    expect(byKey(j, 'wms')).toMatchObject({ status: 'done', at: '2026-10-28 07:55', source: 'synthetic' });
    expect(byKey(j, 'wms').detail).toMatch(/WMS-000008/);
    expect(byKey(j, 'picked').status).toBe('current');
    expect(['handed', 'transit', 'delivered'].map((k) => byKey(j, k).status)).toEqual(['not_reached', 'not_reached', 'not_reached']);
  });

  it('AC-JRN-14: events up to in_transit: stages 9-12 done and synthetic, delivery current', () => {
    const j = buildEmailJourney({ ...ENTERED_EMAIL, events: [...ENTERED_EMAIL.events, ev('picked', '2026-10-28 09:00'),
      ev('picked_up', '2026-10-28 14:00'), ev('in_transit', '2026-10-28 18:00')] }, '2026-10-28 19:00');
    expect(j.stages.slice(8, 12).map((s) => [s.status, s.source])).toEqual([['done', 'synthetic'], ['done', 'synthetic'],
      ['done', 'synthetic'], ['done', 'synthetic']]);
    expect(byKey(j, 'handed').actor).toMatch(/Carrier A/);
    expect(byKey(j, 'transit').at).toBe('2026-10-28 18:00');
    expect(byKey(j, 'delivered').status).toBe('current');
  });

  it('AC-JRN-14: delivered two days after the promise date fails stage 13 with "2 days late"; on time is done', () => {
    const all = [...ENTERED_EMAIL.events, ev('picked', '2026-10-28 09:00'), ev('picked_up', '2026-10-28 14:00'),
      ev('in_transit', '2026-10-28 18:00'), ev('out_for_delivery', '2026-10-29 08:00')];
    const late = buildEmailJourney({ ...ENTERED_EMAIL, events: [...all, ev('delivered', '2026-10-31 14:00')] }, '2026-11-01 09:00');
    expect(byKey(late, 'delivered')).toMatchObject({ status: 'failed', at: '2026-10-31 14:00', source: 'synthetic' });
    expect(byKey(late, 'delivered').detail).toMatch(/2 days late/);
    expect(late.summary.outcome).toBe('2 days late');
    const onTime = buildEmailJourney({ ...ENTERED_EMAIL, events: [...all, ev('delivered', '2026-10-29 12:00')] }, '2026-10-29 13:00');
    expect(byKey(onTime, 'delivered').status).toBe('done');
    expect(onTime.summary.outcome).toBe('delivered');
    expect(byKey(onTime, 'notice').status).toBe('not_reached');
  });

  it('AC-JRN-14: not delivered by the end of the promise date is at risk', () => {
    const j = buildEmailJourney({ ...ENTERED_EMAIL, events: [...ENTERED_EMAIL.events, ev('picked', '2026-10-28 09:00')] },
      '2026-10-30 08:00');
    expect(byKey(j, 'delivered').status).toBe('at_risk');
    expect(byKey(j, 'handed').status).toBe('current');
    expect(buildEmailJourney(ENTERED_EMAIL, '2026-10-29 23:59').stages.find((s) => s.key === 'delivered')!.status)
      .toBe('not_reached');
  });

  it('AC-JRN-01: an ALL_CLEAR email awaiting approval has stages 1-6 done and approval current', () => {
    const j = buildEmailJourney(EMAIL);
    expect(j.ref).toBe('email:8');
    expect(j.stages).toHaveLength(14);
    expect(j.stages.slice(0, 6).map((s) => s.status)).toEqual(['done', 'done', 'done', 'done', 'done', 'done']);
    expect(byKey(j, 'approved').status).toBe('current');
    expect(byKey(j, 'carrier').detail).toMatch(/Carrier A for Midwest same-day/);
    expect(j.summary.promisedDate).toBe('2026-10-29');
  });

  it('approved, confirmed and entered: stages 1-9 done, tracking not reached yet', () => {
    const j = buildEmailJourney({ ...EMAIL, status: 'ENTERED',
      approvals: [{ action: 'approve', actor: 'sup', at: '2026-10-28 09:50', reason: null },
        { action: 'send_reply', actor: 'op', at: '2026-10-28 09:52', reason: null },
        { action: 'send_to_wms', actor: 'op', at: '2026-10-28 09:52', reason: null }],
      outbound: [{ status: 'sent', at: '2026-10-28 09:52' }] });
    expect(j.stages.slice(0, 9).every((s) => s.status === 'done')).toBe(true);
    expect(byKey(j, 'approved').actor).toBe('sup');
    expect(byKey(j, 'picked').status).toBe('not_reached');
  });

  it('AC-JRN-03: a CONFIRM_ADDRESS email waits on the client and shows each round', () => {
    const j = buildEmailJourney({ ...EMAIL, decision: 'CONFIRM_ADDRESS', checks: null,
      rounds: [{ id: 2, receivedAt: '2026-10-28 07:00', decision: 'CONFIRM_ADDRESS' }] });
    expect(byKey(j, 'address').status).toBe('current');
    expect(byKey(j, 'approved').status).toBe('skipped');
    expect(byKey(j, 'promise').status).toBe('not_reached');
    const answered = buildEmailJourney({ ...EMAIL, rounds: [
      { id: 2, receivedAt: '2026-10-28 07:00', decision: 'CONFIRM_ADDRESS' },
      { id: 9, receivedAt: '2026-10-28 08:30', decision: 'ALL_CLEAR' }] });
    expect(answered.rounds.map((r) => r.decision)).toEqual(['CONFIRM_ADDRESS', 'ALL_CLEAR']);
    expect(byKey(answered, 'address').detail).toMatch(/2 rounds/);
  });

  it('AC-JRN-04: a rejected order shows the reason and user, and nothing after approval is reached', () => {
    const j = buildEmailJourney({ ...EMAIL, status: 'REJECTED',
      approvals: [{ action: 'reject', actor: 'sup', at: '2026-10-28 09:50', reason: 'wrong SKU' }] });
    expect(byKey(j, 'approved').status).toBe('failed');
    expect(byKey(j, 'approved').detail).toMatch(/wrong SKU/);
    expect(byKey(j, 'approved').actor).toBe('sup');
    expect(j.stages.slice(7).every((s) => s.status === 'not_reached')).toBe(true);
  });

  it('shows a supervisor carrier change from the override log', () => {
    const j = buildEmailJourney({ ...EMAIL,
      overrides: [{ from: 'A', to: 'B', reason: 'client asked', user: 'sup', at: '2026-10-28 09:49' }] });
    expect(byKey(j, 'carrier').detail).toMatch(/changed A → B by sup: client asked/);
  });

  it('an unknown sender stops after the email is received; a waiting email shows as waiting', () => {
    const unknown = buildEmailJourney({ ...EMAIL, clientId: null, tier: null, decision: 'MISSING_INFO', checks: null,
      destination: null, commitment: null });
    expect(byKey(unknown, 'read').status).toBe('skipped');
    expect(unknown.stages.slice(2).every((s) => s.status === 'not_reached')).toBe(true);
    const waiting = buildEmailJourney({ ...EMAIL, status: 'WAITING', decision: null, checks: null });
    expect(byKey(waiting, 'read').status).toBe('waiting');
  });

  it('SEC-JRN-01: carries no sender address, names or email text', () => {
    const text = JSON.stringify(buildEmailJourney(EMAIL));
    expect(text).not.toMatch(/@/);
    expect(Object.keys(buildEmailJourney(EMAIL).summary)).not.toContain('from');
  });
});

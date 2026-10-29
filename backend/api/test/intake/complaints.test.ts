import { describe, expect, it } from 'vitest';
import type { DeliveryCauses } from '../../src/core/contracts.js';
import { complaintQueue, isPrePickup, onlyKnownNumbers, templateResponse } from '../../src/modules/intake/complaints.js';

describe('complaint triage (E12)', () => {
  const row = { complaint_id: 'CMP001', complaint_date: '2026-07-03', client_id: 'C055', delivery_id: 'D023590', channel: 'Email',
    category: 'Redelivery needed', escalated_to_account_owner: 'Y', text: 'It did not arrive.', at_risk: true, account_tier: 'Tier 1' };
  const causes: DeliveryCauses = { deliveryId: 'D023590', late: true, stages: ['Intake'],
    flags: { f_addr: true, f_cutoff: false, f_stock: false, f_stock_out: false, f_skip_nearest: false, f_lane: false, f_bad_lane: false, f_d_friday: false, f_route: false } };

  it('AC-CMP-02 (unit): the template names the address problem', () => {
    expect(templateResponse(row, causes)).toContain('address was incomplete');
  });

  it('AC-CMP-02 (unit): rejects drafts with numbers not in the facts', () => {
    expect(onlyKnownNumbers('Delivery D023590 was late.', '{"delivery_id":"D023590"}')).toBe(true);
    expect(onlyKnownNumbers('You will get a 20% refund.', '{"delivery_id":"D023590"}')).toBe(false);
  });
});

describe('complaint queue (E12, E14)', () => {
  const base = { complaint_date: '2026-07-03', channel: 'Email', category: 'Late', escalated_to_account_owner: 'N', text: 't' };
  const rows = [
    { ...base, complaint_id: 'CMP001', client_id: 'C010', delivery_id: 'D000001', at_risk: false, account_tier: 'Tier 3' },
    { ...base, complaint_id: 'CMP002', client_id: 'C055', delivery_id: 'D000002', at_risk: true, account_tier: 'Tier 1' },
    { ...base, complaint_id: 'CMP003', client_id: 'C020', delivery_id: 'D000003', at_risk: false, account_tier: 'Tier 2' },
    { ...base, complaint_id: 'CMP004', client_id: 'C077', delivery_id: 'D000004', at_risk: true, account_tier: 'Tier 2' },
  ];

  it('REQ-PRI-02, AC-PRI-02: Tier 1 and at-risk complaints are flagged to escalate and come first, order kept', () => {
    const q = complaintQueue(rows, []);
    expect(q.map((c) => [c.complaintId, c.escalate])).toEqual([['CMP002', true], ['CMP004', true], ['CMP001', false], ['CMP003', false]]);
  });

  it('AC-CMP-01 (unit): the latest saved triage comes back with its stages and before-pickup flag', () => {
    const q = complaintQueue(rows, [{ complaint_id: 'CMP002', stages: ['Intake'], escalate: true, draft: 'Sorry', draft_source: 'template', at: '2026-10-29 10:00' }]);
    expect(q[0].triage).toEqual({ stages: ['Intake'], prePickup: true, escalate: true, draft: 'Sorry', source: 'template', at: '2026-10-29 10:00' });
    expect(q[1].triage).toBeNull();
    expect([isPrePickup(['Carrier']), isPrePickup(['Fulfilment', 'Carrier'])]).toEqual([false, true]);
  });
});

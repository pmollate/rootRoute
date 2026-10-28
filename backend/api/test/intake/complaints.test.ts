import { describe, expect, it } from 'vitest';
import type { DeliveryCauses } from '../../src/core/contracts.js';
import { onlyKnownNumbers, templateResponse } from '../../src/modules/intake/complaints.js';

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

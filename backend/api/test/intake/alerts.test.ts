import { describe, expect, it } from 'vitest';
import { draftAlert, riskScore } from '../../src/modules/intake/alerts.js';

describe('late-risk alerts (E10)', () => {
  const lookup = [
    { f_addr: true, f_cutoff: false, f_stock: false, f_lane: false, late_rate: 0.653 },
    { f_addr: false, f_cutoff: false, f_stock: false, f_lane: true, late_rate: 0.43 },
  ];
  const c = { deliveryId: 'D1', clientId: 'C1', promisedDate: '2026-09-20', f_addr: true, f_cutoff: false, f_stock: false, f_lane: false, priority: false };

  it('AC-RISK-02: a 0.6+ risk order promised 09-20 scored 09-18 gets an alert dated before 09-20', () => {
    const alert = draftAlert(c, riskScore(c, lookup), '2026-09-18');
    expect(alert).not.toBeNull();
    expect(alert!.payload.sentOn < '2026-09-20').toBe(true);
  });

  it('does not alert below the threshold', () => {
    const low = { ...c, f_addr: false, f_lane: true };
    expect(draftAlert(low, riskScore(low, lookup), '2026-09-18')).toBeNull();
  });

  it('AC-RISK-01: the score reads only pre-despatch facts', () => {
    const src = riskScore.toString() + draftAlert.toString();
    for (const banned of ['f_route', 'actual_route_km', 'delivered_date', 'days_late', 'on_time']) expect(src).not.toContain(banned);
  });
});

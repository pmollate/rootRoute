import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { mockApi, renderScreen } from '../test-utils';
import { CarriersScreen } from './CarriersScreen';

const option = (carrier: string, status: string, reason = 'eligible') =>
  ({ carrier, onTime: status === 'blocked' ? 0.55 : 0.96, meanRate: 12.5, n: 300, score: status === 'blocked' ? null : 80, status, reason });
const lane = (blocked: string[], reason: string) => ({ recommendation: {
  carrier: 'A', backup: 'B', blocked, reason,
  options: [option('A', 'recommended'), option('B', 'backup'), ...blocked.map((c) => option(c, 'blocked', '40% late on fair data (limit 15%)'))],
} });

const ROUTES = {
  '/api/carriers?region=Northeast&commitment=next_day&sla=false': { recommendation: {
    carrier: 'E', backup: 'A', blocked: ['F'],
    reason: 'Carrier E for Northeast next-day: 97% on time vs 55% for F; $1.62 more per shipment',
    options: [
      { carrier: 'E', onTime: 0.968, meanRate: 12.84, n: 309, score: 96, status: 'recommended', reason: 'eligible' },
      { carrier: 'A', onTime: 0.955, meanRate: 14.95, n: 617, score: 85, status: 'backup', reason: 'eligible' },
      { carrier: 'F', onTime: 0.546, meanRate: 11.22, n: 445, score: null, status: 'blocked', reason: '45% late on fair data (limit 15%)' },
    ] } },
  '/api/carriers?region=Midwest&commitment=standard&sla=false': lane(['D'], 'Carrier A for Midwest standard'),
  '/api/carriers?region=Northeast&commitment=standard&sla=false': lane(['F'], 'Carrier A for Northeast standard'),
  '/api/carriers?region=Southeast&commitment=standard&sla=false': lane(['D', 'F'], 'Carrier A for Southeast standard'),
  '/api/carriers?region=West&commitment=standard&sla=false': lane(['E'], 'Carrier A for West standard'),
  '/api/carriers/backtest': { rows: [] },
  '/api/tracking?asOf=2026-09-10': { synthetic: true, asOf: '2026-09-10', freshness: [], atRisk: [] },
};

describe('Carriers', () => {
  afterEach(cleanup);

  it('shows the recommendation reason, a blocked carrier and the synthetic tracking badge', async () => {
    mockApi(ROUTES);
    renderScreen(<CarriersScreen />);
    expect(await screen.findByText(/97% on time vs 55% for F/)).toBeTruthy();
    expect(await screen.findByText('45% late on fair data (limit 15%)')).toBeTruthy();
    expect(await screen.findByText('Synthetic data')).toBeTruthy();
  });

  it('AC-CAR-02: lists the five blocked lanes from the API', async () => {
    mockApi(ROUTES);
    renderScreen(<CarriersScreen />);
    expect(await screen.findByText(/5 carrier lanes are blocked/)).toBeTruthy();
    for (const l of ['D to Midwest', 'D to Southeast', 'E to West', 'F to Northeast', 'F to Southeast']) {
      expect(screen.getByLabelText(`Carrier ${l}`)).toBeTruthy();
    }
  });

  it('shows a fixed message when an override fails, not the server text', async () => {
    mockApi(ROUTES);
    renderScreen(<CarriersScreen />);
    await screen.findByText(/97% on time vs 55% for F/);
    fireEvent.click(screen.getByRole('button', { name: 'Log override' }));
    expect(await screen.findByText('Could not log the override. Check the fields and try again.')).toBeTruthy();
    expect(screen.queryByText(/404|\/api\//)).toBeNull();
  });
});

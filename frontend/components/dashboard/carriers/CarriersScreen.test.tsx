import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { asRole, mockApi, renderScreen } from '../test-utils';
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
  // C9a Routes panel (SPEC §5.18): its own tests are in RoutesPanel.test.tsx.
  '/api/routes/overruns': { all: { value: 'all', n: 10, nMeasured: 10, nOverrun: 1, overrunRate: 0.1, lateRateOverrun: 0.5,
    lateRateOther: 0.2, nBlank: 0, penaltyUsd: 0, handlingUsd: 34, pointsLost: 0.01, standsOut: false }, slices: [] },
};

describe('Carriers', () => {
  afterEach(() => { cleanup(); sessionStorage.clear(); });

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

  it('AC-AUTH-10: leadership sees no override form', async () => {
    mockApi(ROUTES);
    renderScreen(<CarriersScreen />, asRole('leadership'));
    await screen.findByText(/97% on time vs 55% for F/);
    expect(screen.queryByRole('button', { name: 'Log override' })).toBeNull();
    expect(screen.queryByLabelText('Reason')).toBeNull();
  });

  it('REQ-AUTH-07: a carrier manager logs an override with no name field; the actor comes from the sign-in', async () => {
    const fetch = mockApi({ ...ROUTES, '/api/overrides': { id: 7 } });
    renderScreen(<CarriersScreen />, asRole('carrier_manager'));
    await screen.findByText(/97% on time vs 55% for F/);
    expect(screen.queryByPlaceholderText('Full name')).toBeNull();
    expect(screen.queryByText('Your name')).toBeNull();
    fireEvent.change(screen.getByLabelText('Order ref'), { target: { value: 'HX-1' } });
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'client asked for A' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log override' }));
    expect(await screen.findByText(/Logged override #7/)).toBeTruthy();
    const [, init] = (fetch.mock.calls as unknown as [string, RequestInit][]).find(([u]) => u.endsWith('/api/overrides'))!;
    expect(JSON.parse(String(init.body))).not.toHaveProperty('user');
  });

  it('AC-AUTH-11: an ended session keeps the order ref, carrier choice and reason through sign-in', async () => {
    const routes = { ...ROUTES };
    const fetch = mockApi(routes);
    fetch.mockImplementation(async (url: string) => {
      const u = new URL(url, 'http://localhost');
      if (u.pathname === '/api/overrides') return { ok: false, status: 401, json: async () => ({ error: 'session_expired' }) } as Response;
      const hit = (routes as Record<string, unknown>)[u.pathname + u.search];
      return { ok: Boolean(hit), status: hit ? 200 : 404, json: async () => hit ?? {} } as Response;
    });
    const first = renderScreen(<CarriersScreen />, asRole('carrier_manager'));
    await screen.findByText(/97% on time vs 55% for F/);
    fireEvent.change(screen.getByLabelText('Order ref'), { target: { value: 'HX-2' } });
    fireEvent.change(screen.getByLabelText('Use carrier'), { target: { value: 'A' } });
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'dock closes early' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log override' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Your session has ended. Sign in again; your changes are kept.');
    first.unmount();
    fetch.mockClear();
    renderScreen(<CarriersScreen />, asRole('carrier_manager'));
    await screen.findByText(/97% on time vs 55% for F/);
    await waitFor(() => expect((screen.getByLabelText('Reason') as HTMLInputElement).value).toBe('dock closes early'));
    expect((screen.getByLabelText('Order ref') as HTMLInputElement).value).toBe('HX-2');
    expect((screen.getByLabelText('Use carrier') as HTMLSelectElement).value).toBe('A');
    expect(fetch.mock.calls.some(([u]) => String(u).endsWith('/api/overrides'))).toBe(false);
  });
});

describe('Carriers backtest periods (REQ-DATA-14, AC-DATA-21)', () => {
  afterEach(() => { cleanup(); sessionStorage.clear(); });

  it('AC-DATA-21: the train and test periods come from the API window', async () => {
    mockApi({ ...ROUTES, '/api/overview': { benchmark: 0.94, windowFrom: '2026-04-01', windowTo: '2026-09-25', recentFrom: '2026-08-01' } });
    renderScreen(<CarriersScreen />);
    expect(await screen.findByText('Backtest: rules trained Apr–Jul, tested Aug–Sep')).toBeTruthy();
    expect(screen.getByText('Train · Apr–Jul')).toBeTruthy();
    expect(screen.getByText('Test · Aug–Sep')).toBeTruthy();
  });

  it('AC-DATA-21: without the window, neutral period names and no fixed months', async () => {
    mockApi(ROUTES);
    renderScreen(<CarriersScreen />);
    expect(await screen.findByText('Backtest: rules trained on earlier months, tested on the last two')).toBeTruthy();
    expect(screen.queryByText(/Apr–Jul|Aug–Sep/)).toBeNull();
  });
});

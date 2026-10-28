import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mockApi, renderScreen } from '../test-utils';
import { OverviewScreen } from './OverviewScreen';

const ROUTES = {
  '/api/overview': { onTime: 0.71, benchmark: 0.94, deliveries: 48340, late: 14019, penaltiesUsd: 872460, handlingCostUsd: 476646,
    atRiskAccounts: 9, atRiskRevenueUsd: 14200000, prePickupShare: 0.673 },
  '/api/attribution': { causes: [
    { cause: 'f_lane', label: 'Carrier lane / Friday overload', stage: 'Carrier', deliveries: 10030, pointsLost: 0.0763, share: 0.263 },
    { cause: 'f_addr', label: 'Incomplete address', stage: 'Intake', deliveries: 5994, pointsLost: 0.0705, share: 0.243 },
  ] },
  '/api/cause-kpis': { kpis: [
    { cause: 'f_addr', label: 'Incomplete address', kpi: 'Orders with an incomplete address at the pick list', baseline: 0.124, target: '<2%', owner: 'Customer success' },
    { cause: 'none', label: 'Not told about delay', kpi: "'Not told about the delay' complaints per quarter", baseline: 12, target: '0', owner: 'Account owners' },
  ] },
  '/api/causes?segment=all': { segment: 'all', causes: [
    { flag: 'f_addr', label: 'Incomplete address at intake', stage: 'Intake', n: 5994, lateRate: 0.646 },
    { flag: 'none', label: 'None of the five', stage: '-', n: 22309, lateRate: 0 },
  ] },
  '/api/replay?segment=all': { segment: 'all', scenarios: [
    { scenario: 'adopt_address', label: '+ address check (85%)', grp: 'adoption', onTime: 0.762 },
    { scenario: 'adopt_lanes', label: '+ lane rules and Friday cap (90%)', grp: 'adoption', onTime: 0.825 },
    { scenario: 'adopt_all', label: '+ last-mile watch (30%): full programme', grp: 'adoption', onTime: 0.92 },
  ] },
};

describe('Overview', () => {
  it('AC-UI-01/02: shows on-time, cost, attribution and per-cause measures from the API', async () => {
    mockApi(ROUTES);
    renderScreen(<OverviewScreen />);
    expect((await screen.findAllByText('71.0%')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('$1.35M')).length).toBeGreaterThan(0);
    expect(await screen.findByText('Penalties $872k')).toBeTruthy();
    expect((await screen.findAllByText('$14.2M')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('7.6')).length).toBeGreaterThan(0);
    expect(await screen.findByText('12.4%')).toBeTruthy();
    expect(await screen.findByText('Customer comms')).toBeTruthy();
  });

  it('AC-UI-01: the waterfall follows the expected-adoption replay and a fix opens its detail', async () => {
    mockApi(ROUTES);
    renderScreen(<OverviewScreen />);
    expect(await screen.findByText('With fixes')).toBeTruthy();
    expect((await screen.findAllByText('+5.2')).length).toBeGreaterThan(0);
    fireEvent.click((await screen.findAllByRole('button', { name: /Lane rules plus a Friday cap/ }))[0]);
    expect(await screen.findByText('76.2 → 82.5%')).toBeTruthy();
  });
});

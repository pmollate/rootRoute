import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mockApi, renderScreen } from '../test-utils';
import { OverviewScreen } from './OverviewScreen';

describe('Overview', () => {
  it('AC-UI-01/02: shows on-time, attribution and per-cause measures from the API', async () => {
    mockApi({
      '/api/overview': { onTime: 0.71, benchmark: 0.94, deliveries: 48340, late: 14019, penaltiesUsd: 872460, handlingCostUsd: 476646,
        atRiskAccounts: 9, atRiskRevenueUsd: 14200000, prePickupShare: 0.673 },
      '/api/attribution': { causes: [{ cause: 'f_lane', label: 'Carrier lane / Friday overload', stage: 'Carrier', deliveries: 10030, pointsLost: 0.0763, share: 0.263 }] },
      '/api/cause-kpis': { kpis: [{ cause: 'f_addr', label: 'Incomplete address', kpi: 'Orders with an incomplete address at the pick list', baseline: 0.124, target: '<2%', owner: 'Customer success' }] },
      '/api/causes?segment=all': { segment: 'all', causes: [{ flag: 'f_addr', label: 'Incomplete address at intake', stage: 'Intake', n: 5994, lateRate: 0.646 }] },
    });
    renderScreen(<OverviewScreen />);
    expect(await screen.findByText('71.0%')).toBeTruthy();
    expect(await screen.findByText('$872,460')).toBeTruthy();
    expect(await screen.findByText('7.6')).toBeTruthy();
    expect(await screen.findByText('12.4%')).toBeTruthy();
    expect(await screen.findByText('Incomplete address at intake')).toBeTruthy();
  });
});

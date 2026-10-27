import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mockApi, renderScreen } from '../test-utils';
import { ReplayScreen } from './ReplayScreen';

const s = (scenario: string, label: string, onTime: number, costAvoided: number) => ({ scenario, label, grp: 'adoption', onTime, lateAvoided: 1, costAvoided });
const acc = (clientId: string, revenueUsd: number, mainCause: string) =>
  ({ clientId, clientName: clientId, tier: 'Tier 1', revenueUsd, channel: 'API', onTime: 0.7, mainCause, complaints: 1 });

describe('Replay', () => {
  it('builds the replay summary and account summary from API numbers', async () => {
    mockApi({
      '/api/replay?segment=all': { segment: 'all', scenarios: [
        s('today', 'Today', 0.71, 0), s('route_only', 'Route only', 0.736, 113347),
        s('as_built_adopted', 'As built (adoption)', 0.859, 707950), s('adopt_all', 'Full programme', 0.92, 980764),
        s('all_but_route', 'Address + cut-off + stock + lanes', 0.963, 1184850)] },
      '/api/accounts': { accounts: [
        acc('C263', 2_250_000, 'Incomplete address at intake'),
        acc('C049', 2_130_000, 'Bad carrier lane or D on a Friday'),
        acc('C099', 2_000_000, 'Bad carrier lane or D on a Friday')] },
      '/api/attribution': { causes: [{ cause: 'f_addr', pointsLost: 0.08 }] },
    });
    renderScreen(<ReplayScreen />);
    expect(await screen.findByText('+2.6 pts')).toBeTruthy(); // route_only − today
    expect(await screen.findByText('+21.0 pts')).toBeTruthy(); // adopt_all − today
    expect(screen.queryByText(/sign|vendor|pilot/i)).toBeNull();
    expect((await screen.findAllByText('92.0%')).length).toBeGreaterThan(0);
    expect(await screen.findByText('Clears 95%')).toBeTruthy();
    expect(await screen.findByText('6.8')).toBeTruthy(); // 85% of the 8.0 address points
    expect((await screen.findByTestId('coverage')).textContent).toBe('Lane rules + Friday cap protects 2 accounts and Address check 1.');
  });
});

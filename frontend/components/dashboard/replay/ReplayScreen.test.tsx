import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mockApi, renderScreen } from '../test-utils';
import { ReplayScreen } from './ReplayScreen';

const s = (scenario: string, label: string, onTime: number, costAvoided: number) => ({ scenario, label, grp: 'adoption', onTime, lateAvoided: 1, costAvoided });

describe('Replay & decision', () => {
  it('builds the recommendation from API numbers', async () => {
    mockApi({
      '/api/replay?segment=all': { segment: 'all', scenarios: [
        s('today', 'Today', 0.71, 0), s('route_only', 'Route only', 0.736, 113347), s('adopt_vendor', 'Vendor only', 0.783, 320482),
        s('as_built_adopted', 'As built (adoption)', 0.859, 707950), s('adopt_all', 'Full programme', 0.92, 980764)] },
      '/api/accounts': { accounts: [] },
      '/api/overview': { benchmark: 0.94, onTime: 0.71 },
    });
    renderScreen(<ReplayScreen />);
    expect(await screen.findByText(/routing vendor alone reaches 78\.3%/)).toBeTruthy();
    expect(await screen.findByText(/Fixing all five causes reaches/)).toBeTruthy();
    expect((await screen.findAllByText('92.0%')).length).toBeGreaterThan(0);
  });
});

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mockApi, renderScreen } from './test-utils';
import { Status } from './ui';
import { OverviewScreen } from './overview/OverviewScreen';

describe('Status', () => {
  it('SEC: shows a fixed message, never the error text from the API', () => {
    render(<Status loading={false} error={'500 /api/overview: relation "kpis" does not exist'} />);
    expect(screen.getByText('Could not load this section. Please try again later.')).toBeTruthy();
    expect(screen.queryByText(/api|kpis|500/)).toBeNull();
  });

  it('SEC: a failed API call does not put the path or status on the screen', async () => {
    mockApi({});
    const { container } = renderScreen(<OverviewScreen />);
    expect((await screen.findAllByText('Could not load this section. Please try again later.')).length).toBeGreaterThan(0);
    expect(container.textContent).not.toMatch(/\/api\/|404/);
  });
});

import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { mockApi, renderScreen } from '../test-utils';
import { NONE_STANDS_OUT, RoutesPanel } from './RoutesPanel';

const row = (value: string, overrunRate: number, over: Record<string, unknown> = {}) => ({
  value, n: 1000, nMeasured: 980, nOverrun: Math.round(980 * overrunRate), overrunRate, lateRateOverrun: 0.6,
  lateRateOther: 0.27, nBlank: 20, penaltyUsd: 1800, handlingUsd: 1020, pointsLost: null, ratioToAll: overrunRate / (2_880 / 47_001),
  standsOut: false, ...over,
});
const slice = (name: string, rows: ReturnType<typeof row>[]) => {
  const rates = rows.map((r) => r.overrunRate);
  return { slice: name, minRate: Math.min(...rates), maxRate: Math.max(...rates),
    spreadPts: 100 * (Math.max(...rates) - Math.min(...rates)), standsOut: rows.some((r) => r.standsOut), rows };
};
const ALL = {
  value: 'all', n: 48_340, nMeasured: 47_001, nOverrun: 2_880, overrunRate: 2_880 / 47_001, lateRateOverrun: 0.6264,
  lateRateOther: 0.2687, nBlank: 1_339, penaltyUsd: 102_960, handlingUsd: 61_336, pointsLost: 0.031489, // the data's value (SPEC §5.18): 3.1 at one decimal standsOut: false,
};
const flat = (carrier = [row('A', 0.066), row('B', 0.070), row('D', 0.051)]) => ({
  all: ALL,
  slices: [
    slice('carrier', carrier),
    slice('region', [row('Midwest', 0.062), row('West', 0.063)]),
    slice('warehouse', [row('W1', 0.061), row('W5', 0.064)]),
    slice('stops_band', [row('up to 10', 0.062), row('31+', 0.064)]),
    slice('weekday', [row('Monday', 0.062), row('Friday', 0.055)]),
    slice('month', [row('2026-04', 0.063), row('2026-07', 0.056)]),
  ],
});
const URL = '/api/routes/overruns';

describe('Routes panel (SPEC §5.18)', () => {
  afterEach(cleanup);

  it('AC-ROUTE-05: the figures, every slice range, the flat finding, the data gap and the open question', async () => {
    mockApi({ [URL]: flat() });
    renderScreen(<RoutesPanel />);
    expect(await screen.findByText(NONE_STANDS_OUT)).toBeTruthy();
    expect(NONE_STANDS_OUT).toBe('No carrier, region, warehouse, route size, weekday or month stands out: overruns happen at about the same rate everywhere.');
    const stats = screen.getByRole('list', { name: 'Route overrun figures' });
    // No /api/attribution in this mock, so points lost fall back to plain rounding (3.1).
    for (const t of ['2,880', '6.1%', '62.6%', '26.9%', '$164,296', '3.1 pts']) expect(within(stats).getByText(t, { exact: false })).toBeTruthy();
    const ranges = screen.getByRole('group', { name: 'Overrun rate by' });
    for (const [label, range] of [['Carrier', '5.1–7.0%'], ['Destination region', '6.2–6.3%'], ['Warehouse', '6.1–6.4%'],
      ['Stops on route', '6.2–6.4%'], ['Shipping weekday', '5.5–6.2%'], ['Order month', '5.6–6.3%']]) {
      const b = within(ranges).getByRole('button', { name: new RegExp(label) });
      expect(b.textContent).toContain(range);
    }
    expect(screen.getByText(/1,339 deliveries have no actual route distance/)).toBeTruthy();
    expect(screen.getByText(/\[ROUTE_OVERRUN_CAUSE\]/)).toBeTruthy();
    expect(screen.queryByText(/routing engine|vendor|sign|approve/i)).toBeNull();
  });

  it('SPEC §2.2 (v0.20): points lost read as on the Overview, rounded with the other causes to add up (3.2)', async () => {
    mockApi({ [URL]: flat(), '/api/attribution': { causes: [
      { cause: 'f_lane', pointsLost: 0.076260 }, { cause: 'f_addr', pointsLost: 0.070473 }, { cause: 'f_stock', pointsLost: 0.056097 },
      { cause: 'f_cutoff', pointsLost: 0.055689 }, { cause: 'f_route', pointsLost: 0.031489 }] } });
    renderScreen(<RoutesPanel />);
    const stats = await screen.findByRole('list', { name: 'Route overrun figures' });
    expect(await within(stats).findByText('3.2 pts', { exact: false })).toBeTruthy();
  });

  it('AC-ROUTE-05: names a value that stands out instead of the flat sentence', async () => {
    mockApi({ [URL]: flat([row('A', 0.066), row('B', 0.105, { standsOut: true, ratioToAll: 1.71 }), row('D', 0.051)]) });
    renderScreen(<RoutesPanel />);
    expect(await screen.findByText(/Carrier B stands out: 10.5% of its measured routes overran, 1.7 × the overall 6.1%\./)).toBeTruthy();
    expect(screen.queryByText(NONE_STANDS_OUT)).toBeNull();
  });

  it('shows the chosen slice as a table, Carrier first', async () => {
    mockApi({ [URL]: flat() });
    renderScreen(<RoutesPanel />);
    const table = await screen.findByRole('table', { name: /Overrun rate by carrier/ });
    expect(within(table).getAllByRole('row').map((r) => r.querySelector('td')?.textContent).filter(Boolean))
      .toEqual(['Carrier A', 'Carrier B', 'Carrier D']);
    fireEvent.click(screen.getByRole('button', { name: /Shipping weekday/ }));
    const wd = screen.getByRole('table', { name: /Overrun rate by shipping weekday/ });
    expect(within(wd).getByText('Friday')).toBeTruthy();
  });

  it('Review R5-4: a slice range is the one Python reports, not one recomputed over every value', async () => {
    const data = flat();
    data.slices[0] = { ...data.slices[0], minRate: 0.051, maxRate: 0.07, rows: [...data.slices[0].rows, row('Z', 0.4)] };
    mockApi({ [URL]: data });
    renderScreen(<RoutesPanel />);
    const b = await screen.findByRole('button', { name: /Carrier/ });
    expect(b.textContent).toContain('5.1–7.0%');
  });

  it('shows the fixed error when the API has no data (503)', async () => {
    mockApi({});
    renderScreen(<RoutesPanel />);
    expect(await screen.findByText('Could not load this section. Please try again later.')).toBeTruthy();
  });
});

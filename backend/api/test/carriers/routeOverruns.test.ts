import { describe, expect, it } from 'vitest';
import { shapeRouteOverruns, type RouteOverrunDbRow } from '../../src/modules/carriers/routeOverruns.js';

const row = (slice: string, value: string, over: Partial<RouteOverrunDbRow> = {}): RouteOverrunDbRow => ({
  slice, value, n: 100, n_measured: 98, n_overrun: 6, overrun_rate: 6 / 98, late_rate_overrun: 0.6, late_rate_other: 0.27,
  n_blank: 2, penalty_usd: 360, handling_usd: 102, points_lost: null, ratio_to_all: 1, min_rate: 0.05, max_rate: 0.07,
  spread_pts: 1, stands_out: false, ...over,
});

describe('route overruns shape (SPEC §5.18, CONTRACTS §6)', () => {
  it('AC-ROUTE-06: all row, slices in table order, camelCase rows; a slice stands out when any row does', () => {
    const r = shapeRouteOverruns([
      row('all', 'all', { n: 200, points_lost: 0.0315, spread_pts: 0 }),
      row('carrier', 'A', { stands_out: true, spread_pts: 4, min_rate: 0.05, max_rate: 0.09, ratio_to_all: 1.6 }),
      row('carrier', 'B', { spread_pts: 4, min_rate: 0.05, max_rate: 0.09 }),
      row('region', 'West'),
    ]);
    expect(r).not.toBeNull();
    expect(r!.all).toMatchObject({ value: 'all', n: 200, nMeasured: 98, nOverrun: 6, pointsLost: 0.0315, standsOut: false });
    expect(r!.slices.map((s) => [s.slice, s.minRate, s.maxRate, s.spreadPts, s.standsOut, s.rows.length])).toEqual([
      ['carrier', 0.05, 0.09, 4, true, 2], ['region', 0.05, 0.07, 1, false, 1],
    ]);
    expect(r!.slices[0].rows[0].ratioToAll).toBe(1.6);
    expect(Object.keys(r!.slices[0].rows[0]).sort()).toEqual([
      'handlingUsd', 'lateRateOther', 'lateRateOverrun', 'n', 'nBlank', 'nMeasured', 'nOverrun', 'overrunRate',
      'penaltyUsd', 'pointsLost', 'ratioToAll', 'standsOut', 'value',
    ]);
  });

  it('orders slices as §5.18 and values for reading, whatever order the database returns', () => {
    const r = shapeRouteOverruns([
      row('weekday', 'Sunday'), row('stops_band', '31+'), row('stops_band', '11-20'), row('weekday', 'Monday'),
      row('month', '2026-05'), row('stops_band', 'up to 10'), row('all', 'all'), row('carrier', 'B'), row('month', '2026-04'), row('carrier', 'A'),
    ])!;
    expect(r.slices.map((s) => [s.slice, s.rows.map((x) => x.value)])).toEqual([
      ['carrier', ['A', 'B']], ['stops_band', ['up to 10', '11-20', '31+']], ['weekday', ['Monday', 'Sunday']],
      ['month', ['2026-04', '2026-05']],
    ]);
  });

  it('AC-ROUTE-06: no rows, or no all row, is not data (the route answers 503)', () => {
    expect(shapeRouteOverruns([])).toBeNull();
    expect(shapeRouteOverruns([row('carrier', 'A')])).toBeNull();
  });
});

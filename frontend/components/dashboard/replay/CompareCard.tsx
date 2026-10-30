'use client';

import { useState } from 'react';
import { Pager, Pill, Segmented, Status, usePage } from '@/components/dashboard/ui';
import { BRAND } from '@/config/copy';
import { useApi } from '@/hooks/useApi';
import { int, pct, points, usdK } from '@/lib/metrics';
import s from './compare.module.css';

/**
 * Today vs With LateLens (D11, SPEC §5.8), on the Replay screen only: the report screens show the data as it is. The
 * replay's per-delivery estimates are summed by Python into `scenario_breakdown` and served by GET /api/compare.
 */
export const SCENARIOS = [
  ['as_built_adopted', 'As built · expected adoption'],
  ['as_built', 'As built · full fix'],
  ['adopt_all', 'Full programme'],
] as const;
type Scenario = (typeof SCENARIOS)[number][0];

const DIMENSIONS = [
  ['warehouse', 'Warehouse'], ['lane', 'Lane'], ['carrier', 'Carrier'], ['region', 'Region'], ['month', 'Month'], ['client', 'Client'],
] as const;
type Dimension = (typeof DIMENSIONS)[number][0];

/** REQ-REP-11: the replay removes the lane cause but keeps each delivery with the carrier that delivered it. */
const CARRIER_NOTE = 'Deliveries stay under the carrier that delivered them: the replay removes the lane cause but does not move volume to other carriers.';

export interface CompareRow {
  key: string; deliveries: number; onTimeToday: number; onTimeWith: number; lateToday: number; lateWith: number; costAvoided: number;
}

/** A rate (0..1) or a count: today → with, and the change. */
export function Delta({ today, with: after, unit = 'rate' }: { today: number; with: number; unit?: 'rate' | 'count' }) {
  const fmt = unit === 'rate' ? (x: number) => pct(x) : int;
  const d = after - today;
  const change = unit === 'rate' ? `${d >= 0 ? '+' : '−'}${points(Math.abs(d))} pts` : `${d >= 0 ? '+' : '−'}${int(Math.abs(d))}`;
  // More on-time, or fewer late deliveries, reads as a gain.
  const gain = unit === 'rate' ? d > 0 : d < 0;
  return (
    <span className={s.delta}>
      <span className={s.num}>{`${fmt(today)} → ${fmt(after)}`}</span>
      <span className={gain ? s.gain : s.loss}>{change}</span>
    </span>
  );
}

/** "2026-04" → "Apr 2026" */
const monthLabel = (key: string) =>
  new Date(`${key}-01T00:00:00Z`).toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Today vs with LateLens for each warehouse, lane, carrier, region, month or client; `atRisk` marks client ids. */
export function CompareCard({ atRisk }: { atRisk: ReadonlySet<string> }) {
  const [scenario, setScenario] = useState<Scenario>('as_built_adopted');
  const [dimension, setDimension] = useState<Dimension>('warehouse');
  const c = useApi<{ rows: CompareRow[] }>(`/api/compare?scenario=${scenario}&dimension=${dimension}`);
  const rows = c.data?.rows ?? [];
  const page = usePage(rows);
  const keyLabel = DIMENSIONS.find(([d]) => d === dimension)![1];
  return (
    <section className={s.panel} aria-labelledby="compare-head">
      <div className={s.head}>
        <div>
          <h2 id="compare-head" className={s.title}>Today vs with {BRAND}</h2>
          <p className={s.sub}>Each row replays its own deliveries with the chosen fixes in place.</p>
        </div>
        <Pill tone="neutral" title="Replayed on the supplied 48,340 deliveries (SPEC §5.8), not observed outcomes">Replay estimate</Pill>
      </div>
      <div className={s.tools}>
        <Segmented label="Compare by" value={dimension} options={DIMENSIONS} onChange={setDimension} />
        <select className={s.select} aria-label="Scenario" value={scenario} onChange={(e) => setScenario(e.target.value as Scenario)}>
          {SCENARIOS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
      <Status loading={c.loading} error={c.error} skeleton="rows" count={5} />
      {rows.length > 0 && (
        <div className={s.wrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th scope="col">{keyLabel}</th>
                <th scope="col" className={s.right}>Deliveries</th>
                <th scope="col" className={s.right}>On-time, today → with</th>
                <th scope="col" className={s.right}>Late, today → expected</th>
                <th scope="col" className={s.right}>Cost avoided</th>
              </tr>
            </thead>
            <tbody>
              {page.rows.map((r) => (
                <tr key={r.key}>
                  <th scope="row">
                    {dimension === 'month' ? monthLabel(r.key) : r.key}
                    {dimension === 'client' && atRisk.has(r.key) && <Pill tone="warn">At risk</Pill>}
                  </th>
                  <td className={s.right}>{int(r.deliveries)}</td>
                  <td className={s.right}><Delta today={r.onTimeToday} with={r.onTimeWith} /></td>
                  <td className={s.right}><Delta today={r.lateToday} with={r.lateWith} unit="count" /></td>
                  <td className={s.right}>{usdK(r.costAvoided)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pager p={page} />
        </div>
      )}
      {(dimension === 'lane' || dimension === 'carrier') && <p className={s.note}>{CARRIER_NOTE}</p>}
    </section>
  );
}

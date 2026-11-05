'use client';

import { useState } from 'react';
import { Status, ui } from '@/components/dashboard/ui';
import { useApi } from '@/hooks/useApi';
import { int, pct, points, pointsToTotal, usd } from '@/lib/metrics';
import s from './carriers.module.css';

/** GET /api/routes/overruns (CONTRACTS §6, SPEC §5.18). Python computes every figure; this only shows them. */
interface Row {
  value: string; n: number; nMeasured: number; nOverrun: number; overrunRate: number | null;
  lateRateOverrun: number | null; lateRateOther: number | null; nBlank: number; penaltyUsd: number;
  handlingUsd: number; pointsLost: number | null; ratioToAll: number | null; standsOut: boolean;
}
/** minRate / maxRate count only values with enough measured deliveries (Python's min_n), as standsOut does. */
interface Slice { slice: string; minRate: number | null; maxRate: number | null; spreadPts: number; standsOut: boolean; rows: Row[] }
interface RouteOverruns { all: Row; slices: Slice[] }

export const NONE_STANDS_OUT =
  'No carrier, region, warehouse, route size, weekday or month stands out: overruns happen at about the same rate everywhere.';

const SLICE_LABEL: Record<string, string> = {
  carrier: 'Carrier', region: 'Destination region', warehouse: 'Warehouse', stops_band: 'Stops on route',
  weekday: 'Shipping weekday', month: 'Order month',
};
const MONTH = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
function valueLabel(slice: string, value: string): string {
  if (slice === 'carrier') return `Carrier ${value}`;
  if (slice === 'stops_band') return `${value.replace('-', '–')} stops`; // up to 10, 11–20, 21–30, 31+
  if (slice === 'month' && /^\d{4}-\d{2}$/.test(value)) return MONTH.format(new Date(`${value}-01T00:00:00Z`));
  return value;
}

/** "5.1–7.0%": the slice's lowest and highest overrun rate, as Python reports them. */
function range(sl: Slice): string {
  if (sl.minRate == null || sl.maxRate == null) return '—';
  return `${(100 * sl.minRate).toFixed(1)}–${pct(sl.maxRate)}`;
}

function finding(data: RouteOverruns): string {
  const out = data.slices.flatMap((sl) => sl.rows.filter((r) => r.standsOut).map((r) => ({ sl, r })));
  if (!out.length) return NONE_STANDS_OUT;
  return out.map(({ sl, r }) => `${valueLabel(sl.slice, r.value)} stands out: ${pct(r.overrunRate)} of its measured routes overran`
    + `${r.ratioToAll == null ? '' : `, ${r.ratioToAll.toFixed(1)} × the overall ${pct(data.all.overrunRate)}`}.`).join(' ');
}

export function RoutesPanel() {
  const { data, loading, error } = useApi<RouteOverruns>('/api/routes/overruns');
  // Points lost read the same as on the Overview: rounded with the other four causes so the five add to the total.
  const attribution = useApi<{ causes: { cause: string; pointsLost: number }[] }>('/api/attribution').data?.causes;
  const routePts = attribution ? pointsToTotal(attribution).get('f_route') : undefined;
  const [picked, setPicked] = useState('carrier');
  const all = data?.all;
  const current = data?.slices.find((sl) => sl.slice === picked) ?? data?.slices[0];
  // One scale for every slice, so switching slices does not stretch small gaps.
  const top = data ? Math.max(...data.slices.flatMap((sl) => sl.rows.map((r) => r.overrunRate ?? 0)), all?.overrunRate ?? 0) * 1.25 : 1;
  const w = (v: number | null) => `${Math.max(0, Math.min(100, ((v ?? 0) / top) * 100))}%`;

  return (
    <section className={s.panel} id="routes" aria-labelledby="routes-title">
      <div className={s.head}>
        <div>
          <h2 className={s.h2} id="routes-title">Route overruns</h2>
          <p className={s.sub}>Deliveries whose actual route ran more than 20% over the planned route. This shows what the
            route data records; it does not plan routes.</p>
        </div>
      </div>
      <Status loading={loading} error={error} skeleton="cards" count={4} />
      {data && all && current && (
        <>
          <ul className={s.rStats} aria-label="Route overrun figures">
            <li><p className={s.v}>{int(all.nOverrun)}</p>
              <p className={s.l}>routes over plan, {pct(all.overrunRate)} of {int(all.nMeasured)} measured</p></li>
            <li><p className={s.v}>{pct(all.lateRateOverrun)}</p>
              <p className={s.l}>late when the route overran, vs {pct(all.lateRateOther)} otherwise</p></li>
            <li><p className={s.v}>{usd(all.penaltyUsd + all.handlingUsd)}</p>
              <p className={s.l}>late overruns: {usd(all.penaltyUsd)} penalties, {usd(all.handlingUsd)} handling</p></li>
            {all.pointsLost != null && (
              <li><p className={s.v}>{routePts ?? points(all.pointsLost)} pts</p><p className={s.l}>of on-time lost to route overruns</p></li>
            )}
          </ul>

          <p className={s.reason}><span>{finding(data)}</span></p>

          <div className={s.rSlices} role="group" aria-label="Overrun rate by">
            {data.slices.map((sl) => (
              <button key={sl.slice} type="button" aria-pressed={sl === current} onClick={() => setPicked(sl.slice)}>
                <span>{SLICE_LABEL[sl.slice] ?? sl.slice}</span><b>{range(sl)}</b>
              </button>
            ))}
          </div>

          <div className={ui.tableWrap}>
            <table className={s.table} aria-label={`Overrun rate by ${(SLICE_LABEL[current.slice] ?? current.slice).toLowerCase()}`}>
              <thead><tr><th>{SLICE_LABEL[current.slice] ?? current.slice}</th><th>Overrun rate</th>
                <th className={s.right}>Overruns</th><th className={s.right}>Late when overran</th>
                <th className={s.right}>Cost of late overruns</th></tr></thead>
              <tbody>
                {current.rows.map((r) => (
                  <tr key={r.value} className={r.standsOut ? s.rBlk : undefined}>
                    <td>{valueLabel(current.slice, r.value)}</td>
                    <td>
                      <span className={s.ot}>
                        <span className={s.otTrack} role="img"
                          aria-label={`${pct(r.overrunRate)}; overall ${pct(all.overrunRate)}`}>
                          <i style={{ width: w(r.overrunRate) }} />
                          <b style={{ left: w(all.overrunRate) }} title={`Overall ${pct(all.overrunRate)}`} />
                        </span>
                        {pct(r.overrunRate)}
                      </span>
                    </td>
                    <td className={`${s.right} ${s.num}`}>{int(r.nOverrun)} of {int(r.nMeasured)}</td>
                    <td className={`${s.right} ${s.num}`}>{pct(r.lateRateOverrun)}</td>
                    <td className={`${s.right} ${s.num}`}>{usd(r.penaltyUsd + r.handlingUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={s.rNote}>The line on each bar is the overall rate, {pct(all.overrunRate)}.</p>

          <p className={s.rNote}>{int(all.nBlank)} deliveries have no actual route distance; they are counted, but never as an
            overrun.</p>
          <p className={s.rNote}><b>Open question:</b> why these routes overran is not in the data [ROUTE_OVERRUN_CAUSE]. GPS
            traces or stop sequences from the carriers would show it.</p>
        </>
      )}
    </section>
  );
}

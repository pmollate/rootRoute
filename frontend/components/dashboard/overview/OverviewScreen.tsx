'use client';

import Link from 'next/link';
import { useState, type CSSProperties, type ReactNode } from 'react';
import { Segmented, Status } from '@/components/dashboard/ui';
import { useApi } from '@/hooks/useApi';
import { int, pct, points, usdK, usdShort } from '@/lib/metrics';
import s from './overview.module.css';

export interface Overview {
  onTime: number; benchmark: number; deliveries: number; late: number; penaltiesUsd: number; handlingCostUsd: number;
  atRiskAccounts: number; atRiskRevenueUsd: number; prePickupShare: number;
}
interface Cause { flag: string; label: string; stage: string; n: number; lateRate: number }
interface Attribution { cause: string; label: string; stage: string; deliveries: number; pointsLost: number; share: number }
interface CauseKpi { cause: string; label: string; kpi: string; baseline: number; target: string; owner: string }
interface Scenario { scenario: string; label: string; onTime: number }

/** The on-time goal the team set (a target, not a computed figure); the 94% industry benchmark comes from the API. */
const TARGET = 0.95;

/** 24px line icons, drawn with the current text colour. */
const PATHS = {
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  box: <><path d="M21 8 12 3 3 8v8l9 5 9-5z" /><path d="M3 8l9 5 9-5M12 13v8" /></>,
  dollar: <path d="M12 3v18M16.5 7.5c0-1.7-2-3-4.5-3s-4.5 1.3-4.5 3 2 2.6 4.5 3 4.5 1.3 4.5 3-2 3-4.5 3-4.5-1.3-4.5-3" />,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.5 3.3-5.5 6.5-5.5s5.9 2 6.5 5.5M16 4.8a3.5 3.5 0 0 1 0 6.4M18.5 14.8c1.6.8 2.7 2.6 3 5.2" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  warehouse: <><path d="M3 21V8l9-5 9 5v13" /><path d="M7 21v-8h10v8M7 17h10" /></>,
  truck: <><path d="M3 6h11v10H3zM14 9h4l3 3v4h-7" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></>,
  route: <><circle cx="6" cy="19" r="2" /><circle cx="18" cy="5" r="2" /><path d="M8 19h8.5a3.5 3.5 0 0 0 0-7h-9a3.5 3.5 0 0 1 0-7H16" /></>,
  pin: <><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>,
  alert: <><path d="M12 3 2 20h20z" /><path d="M12 10v4M12 17.5v.01" /></>,
  download: <path d="M12 4v11M7 10l5 5 5-5M4 20h16" />,
  replay: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></>,
  chevron: <path d="m9 6 6 6-6 6" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8v.01" /></>,
};
type IconName = keyof typeof PATHS;
const Icon = ({ name, size = 18 }: { name: IconName; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {PATHS[name]}
  </svg>
);

const PRE_PICKUP = new Set(['Intake', 'Promise', 'Fulfilment']);
/** The shipment lifecycle, in order: each stage has one of the five causes. */
const LIFECYCLE = ['f_addr', 'f_cutoff', 'f_stock', 'f_lane', 'f_route'];
const STAGE_ICON: Record<string, IconName> = { f_addr: 'mail', f_cutoff: 'clock', f_stock: 'warehouse', f_lane: 'truck', f_route: 'route' };
const CAUSE_ICON: Record<string, IconName> = { f_addr: 'pin', f_cutoff: 'clock', f_stock: 'warehouse', f_lane: 'truck', f_route: 'route' };
/** Expected-adoption steps of the replay, in programme order, and the cause each one fixes. */
const ADOPTION = [['adopt_address', 'f_addr'], ['adopt_lanes', 'f_lane'], ['adopt_cutoff', 'f_cutoff'],
  ['adopt_warehouse', 'f_stock'], ['adopt_all', 'f_route']] as const;
/** The proposed fix for each cause, and the screen that carries it out. */
const FIXES: Record<string, [string, string]> = {
  f_lane: ['Lane rules + Friday cap on carrier D', '/dashboard/carriers'],
  f_addr: ['Validate addresses at intake', '/dashboard/intake'],
  f_stock: ['Nearest-stocked + sibling fallback', '/dashboard/warehouses'],
  f_cutoff: ['Cutoff-aware promise + 11:00 wave', '/dashboard/warehouses'],
  f_route: ['Live route-overrun alerts', '/dashboard/carriers'],
  none: ['Set up delay alerts', '/dashboard/intake'],
};
const SEGMENTS = [['all', 'All orders'], ['email', 'Email orders'], ['at_risk', 'At-risk accounts']] as const;
type Segment = (typeof SEGMENTS)[number][0];
const MODES = [['ceiling', 'Ceiling'], ['replay', 'Replay']] as const;
type Mode = (typeof MODES)[number][0];
const METHOD = 'Each fix replayed on the supplied deliveries at its expected adoption rate';

/** The waterfall runs from 65% to 100% on-time. */
const AXIS_MIN = 0.65;
const at = (v: number) => `${Math.max(0, Math.min(100, ((v - AXIS_MIN) / (1 - AXIS_MIN)) * 100))}%`;
const span = (from: number, to: number) => ({ left: at(from), width: `calc(${at(to)} - ${at(from)})` });
/** Counts are shown as whole numbers, shares as percentages. */
const today = (k: CauseKpi) => (k.baseline > 1 ? int(k.baseline) : pct(k.baseline));
/** "<26% (the before-cutoff rate)" → "<26%"; the note moves to a tooltip. */
const shortTarget = (t: string) => t.split(' (')[0];
/** Whether today's value meets a target such as "<2%", "0%" or "0"; null when the target can't be read. */
function onTarget(k: CauseKpi): boolean | null {
  const m = /^(<)?\s*([\d.]+)(%)?/.exec(k.target);
  if (!m) return null;
  const v = m[3] ? k.baseline * 100 : k.baseline;
  return m[1] ? v < Number(m[2]) : v <= Number(m[2]);
}
/** "Sales ops / warehouse" → "SO" */
const initials = (name: string) => name.split(/[\s/]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

function downloadCsv(name: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

interface Step { cause: string; label: string; note?: string; pre: boolean; from: number; to: number }

function KpiCard({ label, icon, value, chart, children }: { label: string; icon: IconName; value: string; chart?: ReactNode; children: ReactNode }) {
  return (
    <section className={s.kpi}>
      <p className={s.kpiHead}>{label}<span className={s.kpiIcon}><Icon name={icon} /></span></p>
      <div className={s.kpiValue}>{value}</div>
      <p className={s.kpiNote}>{children}</p>
      {chart}
    </section>
  );
}

/** A 0–100% bar split into parts; optional ticks mark reference values (e.g. benchmark, target). */
function KpiBar({ parts, ticks = [], label }: { parts: [number, string][]; ticks?: [number, string][]; label: string }) {
  const total = parts.reduce((t, [v]) => t + v, 0) || 1;
  return (
    <div className={s.kpiBar} role="img" aria-label={label}>
      <span className={s.kpiTrack}>
        {parts.map(([v, cls], i) => <span key={i} className={cls} style={{ flexGrow: v / total }} />)}
        {ticks.map(([v, cls], i) => <span key={i} className={`${s.kpiTick} ${cls}`} style={{ left: `${v * 100}%` }} />)}
      </span>
    </div>
  );
}

/** One dot per at-risk account, so the count reads at a glance. */
const KpiDots = ({ n }: { n: number }) => (
  <div className={s.kpiDots} role="img" aria-label={`${n} accounts at risk`}>
    {Array.from({ length: Math.min(n, 40) }, (_, i) => <span key={i} />)}
  </div>
);

/** The 94% benchmark (dashed) and the 95% target (solid) drawn across a waterfall track. */
const Marks = ({ benchmark }: { benchmark: number }) => (
  <>
    <span className={s.bench} style={{ left: at(benchmark) }} />
    <span className={s.target} style={{ left: at(TARGET) }} />
  </>
);

/** Hover/focus readout pinned to the end of a waterfall bar. */
const Tip = ({ to, children }: { to: number; children: ReactNode }) => (
  <span className={s.tip} style={{ left: at(to) }} aria-hidden="true">{children}</span>
);

export function OverviewScreen() {
  const [segment, setSegment] = useState<Segment>('all');
  const [mode, setMode] = useState<Mode>('replay');
  const o = useApi<Overview>('/api/overview');
  const a = useApi<{ causes: Attribution[] }>('/api/attribution');
  const k = useApi<{ kpis: CauseKpi[] }>('/api/cause-kpis');
  const r = useApi<{ scenarios: Scenario[] }>('/api/replay?segment=all');
  const all = useApi<{ causes: Cause[] }>('/api/causes?segment=all');
  const seg = useApi<{ causes: Cause[] }>(segment === 'all' ? null : `/api/causes?segment=${segment}`);
  const segCauses = segment === 'all' ? all : seg;

  const attribution = a.data?.causes ?? [];
  const byCause = new Map(attribution.map((x) => [x.cause, x]));
  const flag = (list: Cause[] | undefined, f: string) => list?.find((x) => x.flag === f);
  const lost = attribution.reduce((t, x) => t + x.pointsLost, 0);
  const lostPre = attribution.filter((x) => PRE_PICKUP.has(x.stage)).reduce((t, x) => t + x.pointsLost, 0);
  const maxLost = Math.max(0, ...attribution.map((x) => x.pointsLost));
  const none = flag(all.data?.causes, 'none');
  const kpis = k.data?.kpis ?? [];
  /** A cause's headline measure is the first one /api/cause-kpis lists for it. */
  const measure = (cause: string) => kpis.find((m) => m.cause === cause);
  const crossCutting = measure('none');

  const scenarios = new Map((r.data?.scenarios ?? []).map((x) => [x.scenario, x]));
  const programme = scenarios.get('adopt_all')?.onTime;
  const steps: Step[] = [];
  if (o.data && mode === 'ceiling') {
    let from = o.data.onTime;
    for (const x of attribution) {
      steps.push({ cause: x.cause, label: measure(x.cause)?.label ?? x.label, pre: PRE_PICKUP.has(x.stage), from, to: from + x.pointsLost });
      from += x.pointsLost;
    }
  } else if (o.data && r.data) {
    let from = o.data.onTime;
    for (const [id, cause] of ADOPTION) {
      const sc = scenarios.get(id);
      const c = byCause.get(cause);
      if (!sc || !c) continue;
      steps.push({ cause, label: measure(cause)?.label ?? c.label, note: sc.label.replace(/^\+ /, ''), pre: PRE_PICKUP.has(c.stage), from, to: sc.onTime });
      from = sc.onTime;
    }
  }
  const benchmark = o.data?.benchmark ?? 0.94;
  const clears = steps.findIndex((x) => x.to >= TARGET);

  const exportTable = () => downloadCsv('halcyon-causes.csv', [
    ['Cause', 'Stage', 'Points lost', 'Late rate', 'Measure', 'Today', 'Target', 'Owner'],
    ...attribution.map((x) => {
      const m = measure(x.cause);
      return [m?.label ?? x.label, x.stage, points(x.pointsLost), pct(flag(segCauses.data?.causes, x.cause)?.lateRate, 0),
        m?.kpi ?? '', m ? today(m) : '', m?.target ?? '', m?.owner ?? ''];
    }),
  ]);

  return (
    <div className={s.screen}>
      <div className={s.pageHead}>
        <div>
          <h1 className={s.title}>Delivery performance</h1>
        </div>
        <div className={s.actions}>
          <button type="button" className={s.btn} onClick={exportTable} disabled={attribution.length === 0}>
            <Icon name="download" size={16} />Export
          </button>
          <Link className={`${s.btn} ${s.btnDark}`} href="/dashboard/replay"><Icon name="replay" size={16} />Open replay</Link>
        </div>
      </div>

      <Status loading={o.loading} error={o.error} skeleton="cards" count={4} />
      {o.data && (
        <>
          <div className={s.alert} role="note">
            <Icon name="alert" />
            <p><b>{o.data.atRiskAccounts} accounts at risk</b> · {usdShort(o.data.atRiskRevenueUsd)} combined annual revenue</p>
            <Link href="/dashboard/replay#accounts">View accounts <Icon name="arrow" size={14} /></Link>
          </div>

          <div className={s.kpis}>
            <KpiCard label="On-time delivery" icon="check" value={pct(o.data.onTime)}
              chart={<KpiBar label={`${pct(o.data.onTime)} on-time; benchmark ${pct(o.data.benchmark, 0)}, target ${pct(TARGET, 0)}`}
                parts={[[o.data.onTime, s.kpiFill], [1 - o.data.onTime, s.kpiRest]]}
                ticks={[[o.data.benchmark, s.kpiTickBench], [TARGET, s.kpiTickTarget]]} />}>
              <span className={s.tagBad}>−{Math.round((o.data.benchmark - o.data.onTime) * 100)} pts</span> vs {pct(o.data.benchmark, 0)} industry benchmark
            </KpiCard>
            <KpiCard label="Late deliveries" icon="box" value={int(o.data.late)}
              chart={<KpiBar label={`${int(o.data.late)} late of ${int(o.data.deliveries)} shipments`}
                parts={[[o.data.late, s.kpiBad], [o.data.deliveries - o.data.late, s.kpiRest]]} />}>
              <span className={s.tagMuted}>{pct(o.data.late / o.data.deliveries)}</span> of {int(o.data.deliveries)} shipments
            </KpiCard>
            <KpiCard label="Cost of lateness" icon="dollar" value={usdShort(o.data.penaltiesUsd + o.data.handlingCostUsd)}
              chart={<KpiBar label={`${usdK(o.data.penaltiesUsd)} penalties, ${usdK(o.data.handlingCostUsd)} handling`}
                parts={[[o.data.penaltiesUsd, s.kpiBad], [o.data.handlingCostUsd, s.kpiDark]]} />}>
              {usdK(o.data.penaltiesUsd)} penalties · {usdK(o.data.handlingCostUsd)} handling
            </KpiCard>
            <KpiCard label="Revenue at risk" icon="users" value={usdShort(o.data.atRiskRevenueUsd)}
              chart={<KpiDots n={o.data.atRiskAccounts} />}>
              <span className={s.tagBad}>{o.data.atRiskAccounts} accounts</span> at risk
            </KpiCard>
          </div>
        </>
      )}

      <div className={s.split}>
        <section className={s.panel}>
          <div className={`${s.head} ${s.headStack}`}>
            <div>
              <h2 className={s.h2}>
                Path to {pct(TARGET, 0)} on-time
                <span className={s.info} title={METHOD}><Icon name="info" size={15} /></span>
              </h2>
              <p className={s.sub}>
                {mode === 'ceiling'
                  ? 'On-time points recovered by removing each cause, largest first'
                  : 'Each fix replayed on the supplied deliveries at its expected adoption rate'}
              </p>
            </div>
            <Segmented label="Waterfall" value={mode} onChange={setMode}
              options={MODES.map(([v, l]) => [v, v === 'replay' && programme != null ? `${l} · ${pct(programme, 0)}` : l] as const)} />
          </div>
          <Status loading={a.loading || (mode === 'replay' && r.loading)} error={a.error ?? (mode === 'replay' ? r.error : undefined)}
            skeleton="bars" count={6} />
          {o.data && steps.length > 0 && (
            <div className={s.fall}>
              <div className={s.step}>
                <span className={s.stepLabel}>Today</span>
                <span className={s.track} tabIndex={0} role="img" aria-label={`${pct(o.data.onTime)} on-time today`}>
                  <span className={`${s.seg} ${s.base}`} style={{ ...span(AXIS_MIN, o.data.onTime), '--i': 0 } as CSSProperties} />
                  <Marks benchmark={benchmark} />
                  <Tip to={o.data.onTime}><b>{pct(o.data.onTime)}</b> on-time today</Tip>
                </span>
                <span className={s.stepValue}>{pct(o.data.onTime)}</span>
              </div>
              {steps.map((x, i) => (
                <div key={x.cause} className={s.step}>
                  <span className={s.stepLabel}>{x.label}{x.note && <small>{x.note}</small>}</span>
                  <span className={s.track} tabIndex={0} role="img" aria-label={`+${points(x.to - x.from)} points to ${pct(x.to)}`}>
                    <span className={`${s.seg} ${x.pre ? s.pre : s.post}`} style={{ ...span(x.from, x.to), '--i': i + 1 } as CSSProperties} />
                    <Marks benchmark={benchmark} />
                    <Tip to={Math.min(x.to, 1)}>{pct(x.from)} → <b>{pct(Math.min(x.to, 1))}</b> · +{points(x.to - x.from)}</Tip>
                  </span>
                  <span className={s.stepValue}>
                    <b>+{points(x.to - x.from)}</b> <span className={i === clears ? s.accent : undefined}>{pct(Math.min(x.to, 1))}</span>
                  </span>
                </div>
              ))}
              <div className={s.step} aria-hidden="true">
                <span />
                <span className={s.axis}>
                  <span style={{ left: 0 }}>{pct(AXIS_MIN, 0)}</span>
                  <span className={s.axisBench} style={{ left: at(benchmark) }}>{pct(benchmark, 0)} benchmark</span>
                  <span className={s.axisTarget} style={{ left: at(TARGET) }}>{pct(TARGET, 0)} target</span>
                </span>
                <span />
              </div>
            </div>
          )}
          <div className={s.legend}>
            <span><i className={s.pre} />Decided before pickup</span>
            <span><i className={s.post} />Carrier &amp; delivery</span>
            <span className={s.legendNote}>
              {mode === 'ceiling'
                ? clears >= 0 && `Fixing ${clears + 1} of ${steps.length} causes clears the target`
                : programme != null && `Full programme reaches ${pct(programme)}`}
            </span>
          </div>
        </section>

        <section className={s.panel}>
          <div className={s.head}>
            <div>
              <h2 className={s.h2}>Recommended fixes</h2>
              <p className={s.sub}>One fix per cause, ranked by on-time impact</p>
            </div>
            {attribution.length > 0 && <span className={s.tagMuted}>{attribution.length} proposed</span>}
          </div>
          <Status loading={a.loading} error={a.error} skeleton="rows" count={5} />
          <ul className={s.fixes}>
            {attribution.map((x) => {
              const fix = FIXES[x.cause];
              if (!fix) return null;
              return (
                <li key={x.cause}>
                  <Link className={s.fix} href={fix[1]}>
                    <span className={s.iconBox}><Icon name={CAUSE_ICON[x.cause] ?? 'box'} /></span>
                    <span className={s.fixText}>
                      <b>{fix[0]}</b>
                      <small>{measure(x.cause)?.owner ?? x.stage} · Proposed</small>
                    </span>
                    <span className={s.fixPts}>+{points(x.pointsLost)}</span>
                    <Icon name="chevron" size={16} />
                  </Link>
                </li>
              );
            })}
          </ul>
          <Link className={`${s.btn} ${s.btnDark} ${s.btnWide}`} href="/dashboard/replay"><Icon name="replay" size={16} />Simulate all in Replay</Link>
        </section>
      </div>

      <section className={s.panel}>
        <div className={s.head}>
          <div>
            <h2 className={s.h2}>Where shipments break</h2>
            <p className={s.sub}>Late rate when each cause is present, by lifecycle stage</p>
          </div>
          {lost > 0 && <p className={s.headNote}><b>{pct(lostPre / lost, 0)}</b> of lost points are decided before pickup</p>}
        </div>
        <Status loading={all.loading} error={all.error} skeleton="cards" count={5} />
        {all.data && (
          <ol className={s.stages}>
            {LIFECYCLE.map((f) => {
              const c = flag(all.data?.causes, f);
              if (!c) return null;
              return (
                <li key={f} className={`${s.stage} ${PRE_PICKUP.has(c.stage) ? s.stagePre : ''}`}>
                  <p className={s.stageHead}><span className={s.iconBox}><Icon name={STAGE_ICON[f]} /></span>{c.stage}</p>
                  <p className={s.stageCause}>{c.label}</p>
                  <p className={s.stageRate}><b>{pct(c.lateRate, 0)}</b> late · {int(c.n)} orders</p>
                </li>
              );
            })}
          </ol>
        )}
        {none && (
          <p className={s.clean}>
            <Icon name="check" size={16} /><span><b>{int(none.n)}</b> shipments with none of the five causes: <b>{pct(none.lateRate, 0)} late</b></span>
          </p>
        )}
      </section>

      <section className={`${s.panel} ${s.tablePanel}`}>
        <div className={s.head}>
          <div>
            <h2 className={s.h2}>Causes, measures &amp; owners</h2>
            <p className={s.sub}>One measure per cause, tracked against target</p>
          </div>
          <Segmented label="Orders" value={segment} options={SEGMENTS} onChange={setSegment} />
        </div>
        <Status loading={k.loading || a.loading || (segment !== 'all' && seg.loading)}
          error={k.error ?? a.error ?? (segment !== 'all' ? seg.error : undefined)} skeleton="rows" count={6} />
        {kpis.length > 0 && attribution.length > 0 && (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Cause</th><th>Impact (pts)</th><th className={s.lateRate}>Late rate</th><th>Measure</th><th>Today → target</th><th>Owner</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {attribution.map((x) => {
                  const m = measure(x.cause);
                  const met = m ? onTarget(m) : null;
                  return (
                    <tr key={x.cause}>
                      <td>
                        <span className={s.causeCell}>
                          <span className={s.iconBox}><Icon name={CAUSE_ICON[x.cause] ?? 'box'} /></span>
                          <span><b>{m?.label ?? x.label}</b><small>{x.stage}</small></span>
                        </span>
                      </td>
                      <td>
                        <span className={s.impact}>
                          <span className={s.num}>{points(x.pointsLost)}</span>
                          <span className={s.impactBar}><span style={{ width: `${(x.pointsLost / maxLost) * 100}%` }} /></span>
                        </span>
                      </td>
                      <td className={s.num}>{pct(flag(segCauses.data?.causes, x.cause)?.lateRate, 0)}</td>
                      <td className={s.measure}>{m?.kpi}</td>
                      <td className={s.nowrap}>
                        {m && <><span className={s.num}>{today(m)}</span> → <b className={`${s.num} ${s.good}`} title={m.target}>{shortTarget(m.target)}</b></>}
                      </td>
                      <td>{m && <span className={s.owner}><span className={s.avatar} aria-hidden="true">{initials(m.owner)}</span>{m.owner}</span>}</td>
                      <td>{met != null && <span className={met ? s.tagGood : s.tagBad}>{met ? 'On target' : 'Off target'}</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {crossCutting && (
          <div className={s.cross}>
            <p>
              <b>Customer comms:</b> {crossCutting.kpi} {today(crossCutting)} / quarter → target {shortTarget(crossCutting.target)} · {crossCutting.owner}
            </p>
            <Link href={FIXES.none[1]}>{FIXES.none[0]} <Icon name="arrow" size={14} /></Link>
          </div>
        )}
      </section>
    </div>
  );
}

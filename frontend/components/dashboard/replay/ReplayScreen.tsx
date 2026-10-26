'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Segmented, Status } from '@/components/dashboard/ui';
import { BRAND } from '@/config/copy';
import { useApi } from '@/hooks/useApi';
import { int, pct, points, usd, usdShort } from '@/lib/metrics';
import s from './replay.module.css';

interface Scenario { scenario: string; label: string; grp: string; onTime: number; lateAvoided: number; costAvoided: number }
interface Account { clientId: string; clientName: string; tier: string; revenueUsd: number; channel: string; onTime: number; mainCause: string; complaints: number }

/** The on-time goal the team set (a target, not a computed figure); matches the Overview screen. */
const TARGET = 0.95;
/** The chart runs from 60% to 100% on-time. */
const AXIS_MIN = 0.6;
const at = (v: number) => `${Math.max(0, Math.min(100, ((v - AXIS_MIN) / (1 - AXIS_MIN)) * 100))}%`;
/** A complaint count this high is flagged in the accounts table. */
const MANY_COMPLAINTS = 5;

/** 24px line icons, drawn with the current text colour. */
const PATHS = {
  download: <path d="M12 4v11M7 10l5 5 5-5M4 20h16" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  alert: <><path d="M12 3 2 20h20z" /><path d="M12 10v4M12 17.5v.01" /></>,
  sliders: <path d="M6 4v6M6 14v6M12 4v2M12 10v10M18 4v10M18 18v2M4 12h4M10 8h4M16 16h4" />,
  pin: <><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>,
  truck: <><path d="M3 6h11v10H3zM14 9h4l3 3v4h-7" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  warehouse: <><path d="M3 21V8l9-5 9 5v13" /><path d="M7 21v-8h10v8M7 17h10" /></>,
  route: <><circle cx="6" cy="19" r="2" /><circle cx="18" cy="5" r="2" /><path d="M8 19h8.5a3.5 3.5 0 0 0 0-7h-9a3.5 3.5 0 0 1 0-7H16" /></>,
  chevron: <path d="m9 6 6 6-6 6" />,
};
type IconName = keyof typeof PATHS;
const Icon = ({ name, size = 18 }: { name: IconName; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {PATHS[name]}
  </svg>
);

/** Each programme fix, its expected adoption rate (SPEC §2.4, set in analytics/core/scenarios.py) and the scenario it adds. */
const FIXES = [
  { scenario: 'adopt_address', label: 'Address check', rate: 0.85, icon: 'pin' },
  { scenario: 'adopt_lanes', label: 'Lane rules + Friday cap', rate: 0.9, icon: 'truck' },
  { scenario: 'adopt_cutoff', label: 'Cutoff-aware promise', rate: 0.85, icon: 'clock' },
  { scenario: 'adopt_warehouse', label: 'Warehouse fallback', rate: 0.6, icon: 'warehouse' },
  { scenario: 'adopt_all', label: 'Last-mile watch', rate: 0.3, icon: 'route' },
] as const;

type Tone = 'base' | 'buy' | 'build' | 'full' | 'built';
interface Row { scenario: string; label: string; note?: string; tone: Tone }
const GROUPS: { title: string; rows: Row[] }[] = [
  { title: 'Baseline', rows: [{ scenario: 'today', label: 'Today', tone: 'base' }] },
  { title: 'Buy', rows: [{ scenario: 'adopt_vendor', label: 'Routing vendor only', note: 'All lanes + 30% of detours', tone: 'buy' }] },
  { title: 'Build · cumulative', rows: FIXES.map((f) => ({
    scenario: f.scenario, label: `+ ${f.label}`, tone: f.scenario === 'adopt_all' ? 'full' : 'build',
    note: f.scenario === 'adopt_all' ? 'Full programme' : `${pct(f.rate, 0)} effective`,
  })) },
  { title: 'Built this week', rows: [{ scenario: 'as_built_adopted', label: `${BRAND} as built`, note: 'Expected adoption', tone: 'built' }] },
];

/** Full-fix reference scenarios: what each option reaches if it worked on every delivery. */
const ALTERNATIVES = [
  { scenario: 'vendor_best', label: 'Routing engine best case', note: 'Lanes + routes' },
  { scenario: 'as_built', label: `${BRAND} as built`, note: 'Full fix' },
  { scenario: 'all_but_route', label: 'Address + cut-off + stock + lanes', note: 'Four in-house fixes, full effect' },
];

const SEGMENTS = [['all', 'All'], ['email', 'Email orders'], ['at_risk', 'At-risk accounts'], ['aug_sep', 'Aug–Sep']] as const;
type Segment = (typeof SEGMENTS)[number][0];

/** Account main causes (analytics/core/diagnosis.py LABELS): short name, icon, the fix that protects them and where it lives. */
const CAUSES: Record<string, { short: string; icon: IconName; fix: string; group: string; href: string }> = {
  'Incomplete address at intake': { short: 'Incomplete address', icon: 'pin', fix: 'address validation', group: 'addresses', href: '/dashboard/intake' },
  'Bad carrier lane or D on a Friday': { short: 'Bad lane / D on Friday', icon: 'truck', fix: 'lane rules', group: 'carrier lanes', href: '/dashboard/carriers' },
  'Same-day order after 8am cut-off': { short: 'After 8am cut-off', icon: 'clock', fix: 'cutoff-aware promise', group: 'cut-off', href: '/dashboard/warehouses' },
  'Shipped from a non-nearest warehouse': { short: 'Non-nearest warehouse', icon: 'warehouse', fix: 'warehouse fallback', group: 'warehouses', href: '/dashboard/warehouses' },
  'Route >20% over plan': { short: 'Route overrun', icon: 'route', fix: 'last-mile watch', group: 'routes', href: '/dashboard/carriers' },
};
const causeOf = (a: Account) => CAUSES[a.mainCause] ?? { short: a.mainCause, icon: 'alert' as IconName, fix: 'other fixes', group: 'other', href: '/dashboard/overview' };

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

function downloadCsv(name: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function ReplayScreen() {
  const [segment, setSegment] = useState<Segment>('all');
  const [approved, setApproved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showHow, setShowHow] = useState(false);
  const all = useApi<{ scenarios: Scenario[] }>('/api/replay?segment=all');
  const seg = useApi<{ scenarios: Scenario[] }>(segment === 'all' ? null : `/api/replay?segment=${segment}`);
  const chart = segment === 'all' ? all : seg;
  const a = useApi<{ accounts: Account[] }>('/api/accounts');

  // The recommendation and alternatives always read all orders; the chart follows the segment.
  const allBy = new Map((all.data?.scenarios ?? []).map((x) => [x.scenario, x]));
  const chartBy = new Map((chart.data?.scenarios ?? []).map((x) => [x.scenario, x]));
  const today = allBy.get('today');
  const vendor = allBy.get('adopt_vendor');
  const full = allBy.get('adopt_all');
  const built = allBy.get('as_built_adopted');
  const route = allBy.get('route_only');
  const ready = today && vendor && full && built && route;

  const accounts = a.data?.accounts ?? [];
  const revenue = accounts.reduce((t, x) => t + x.revenueUsd, 0);
  const rates = accounts.map((x) => x.onTime);
  const byCause = [...accounts.reduce((m, x) => {
    const c = causeOf(x);
    const g = m.get(c.group) ?? { ...c, n: 0, revenue: 0 };
    return m.set(c.group, { ...g, n: g.n + 1, revenue: g.revenue + x.revenueUsd });
  }, new Map<string, ReturnType<typeof causeOf> & { n: number; revenue: number }>()).values()].sort((p, q) => q.n - p.n || q.revenue - p.revenue);
  const coverage = byCause.map((g, i) => i === 0
    ? `${cap(g.fix)} protect${g.fix.endsWith('s') ? '' : 's'} ${g.n} of ${accounts.length} accounts`
    : `${g.fix} covers ${i === byCause.length - 1 && i > 0 ? 'the other ' : ''}${g.n}`).join('; ');

  const summary = ready ? [
    `Recommendation on the $680K routing contract: do not sign as scoped.`,
    `Routing vendor alone: ${pct(vendor.onTime)} on-time, ${usd(vendor.costAvoided)} avoided in 6 months.`,
    `${BRAND} as built (expected adoption): ${pct(built.onTime)}, ${usd(built.costAvoided)} avoided.`,
    `Full five-cause programme: ${pct(full.onTime)}, ${usd(full.costAvoided)} avoided.`,
    `Route detours, the one cause routing fixes directly, are worth ${points(route.onTime - today.onTime)} points on their own.`,
    `Next step: pilot for 8 weeks with one measure per cause. If carrier and route causes still cost more than 3 points, pilot the vendor on the remaining lanes only.`,
  ].join('\n') : '';

  const share = async () => {
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked: leave the label as it is */ }
  };

  const exportCsv = () => downloadCsv(`halcyon-replay-${segment}.csv`, [
    ['Scenario', 'On-time', 'Late avoided', 'Cost avoided (6 mo)'],
    ...GROUPS.flatMap((g) => g.rows).map((r) => chartBy.get(r.scenario)).filter((x): x is Scenario => Boolean(x))
      .map((x) => [x.label, pct(x.onTime), x.lateAvoided, x.costAvoided]),
    [],
    ['Client', 'Tier', 'Annual revenue', 'Channel', 'On-time', 'Main cause', 'Complaints'],
    ...accounts.map((x) => [x.clientId, x.tier, x.revenueUsd, x.channel, pct(x.onTime), x.mainCause, x.complaints]),
  ]);

  const notify = `mailto:?subject=${encodeURIComponent(`${accounts.length} accounts threatening to leave`)}&body=${encodeURIComponent(
    [`${accounts.length} accounts (${usdShort(revenue)} annual revenue) are threatening to leave:`, '',
      ...accounts.map((x) => `${x.clientId} (${x.tier}) · ${usd(x.revenueUsd)} · ${pct(x.onTime)} on-time · ${causeOf(x).short}`), '', `${coverage}.`].join('\n'))}`;

  return (
    <div className={s.screen}>
      <div className={s.pageHead}>
        <div>
          <h1 className={s.title}>Replay &amp; decision</h1>
          <p className={s.lede}>Every scenario replays all 48,340 deliveries. Fixes stack one at a time, each working on part of its cause.</p>
        </div>
        <div className={s.actions}>
          <button type="button" className={s.btn} onClick={exportCsv} disabled={!chart.data}><Icon name="download" size={16} />Export</button>
          <button type="button" className={`${s.btn} ${s.btnDark}`} onClick={share} disabled={!ready} aria-live="polite">
            <Icon name={copied ? 'check' : 'arrow'} size={16} />{copied ? 'Summary copied' : 'Share with leadership'}
          </button>
        </div>
      </div>

      <Status loading={all.loading} error={all.error} />
      {ready && (
        <section className={s.decision} aria-labelledby="decision-head">
          <div className={s.decisionTop}>
            <div>
              <p id="decision-head" className={s.eyebrow}>Recommendation · $680K routing contract</p>
              <p className={s.verdict}><Icon name="alert" size={14} />Do not sign as scoped</p>
              <p className={s.decisionText}>
                Route detours, the one cause routing fixes directly, are worth <b>{points(route.onTime - today.onTime)} points</b> on their own.
                Fixing the five causes in-house beats the vendor by <b>{points(full.onTime - vendor.onTime)} points</b>.
              </p>
            </div>
            <div className={s.decisionActions}>
              <button type="button" className={`${s.btn} ${s.btnLight}`} onClick={() => setApproved((v) => !v)} aria-pressed={approved}>
                <Icon name="check" size={16} />{approved ? 'Pilot approved' : 'Approve 8-week pilot'}
              </button>
              <Link className={`${s.btn} ${s.btnGhost}`} href="/dashboard/overview">See evidence</Link>
            </div>
          </div>
          <div className={s.options}>
            <div className={s.option}>
              <p>Routing vendor alone</p>
              <b>{pct(vendor.onTime)}</b>
              <small>{usd(vendor.costAvoided)} avoided · 6 mo</small>
            </div>
            <div className={s.option}>
              <p>Built this week · {BRAND}</p>
              <b>{pct(built.onTime)}</b>
              <small>{usd(built.costAvoided)} avoided · expected adoption</small>
            </div>
            <div className={`${s.option} ${s.optionBest}`}>
              <p>Full five-cause programme</p>
              <b>{pct(full.onTime)}</b>
              <small>{usd(full.costAvoided)} avoided · 6 mo</small>
            </div>
          </div>
          <p className={s.next}>
            <Icon name="route" size={16} />
            <span><b>Next step:</b> pilot for 8 weeks with one measure per cause. If carrier and route causes still cost more than 3 points,
              pilot the vendor on the remaining lanes only.</span>
          </p>
        </section>
      )}

      <section className={s.panel}>
        <div className={s.head}>
          <div>
            <h2 className={s.h2}>Assumptions</h2>
            <p className={s.sub}>Share of each cause a fix removes. The vendor is assumed to fix every carrier issue and 30% of detours.</p>
          </div>
          <button type="button" className={s.btn} onClick={() => setShowHow((v) => !v)} aria-expanded={showHow} aria-controls="assumptions-how">
            <Icon name="sliders" size={16} />Edit assumptions
          </button>
        </div>
        <ul className={s.chips}>
          {FIXES.map((f) => (
            <li key={f.scenario} className={s.chip}><Icon name={f.icon} size={15} />{f.label}<b>{pct(f.rate, 0)}</b></li>
          ))}
        </ul>
        {showHow && (
          <p id="assumptions-how" className={s.how}>
            These rates come from the diagnostic deck (SPEC §2.4) and are set in <code>backend/analytics/core/scenarios.py</code>.
            Change them there and run <code>npm run pipeline</code> to replay every scenario with the new rates.
          </p>
        )}
      </section>

      <section className={s.panel}>
        <div className={s.head}>
          <div>
            <h2 className={s.h2}>On-time delivery by scenario</h2>
            <p className={s.sub}>Late deliveries and cost avoided over 6 months vs today</p>
          </div>
          <Segmented label="Orders" value={segment} options={SEGMENTS} onChange={setSegment} />
        </div>
        <Status loading={chart.loading} error={chart.error} />
        {chart.data && (
          <div className={s.chartWrap}>
            <table className={s.chart}>
              <thead>
                <tr>
                  <th scope="col">Scenario</th>
                  <th scope="col" className={s.axisHead}>
                    <span className={s.axis} aria-hidden="true">
                      <span style={{ left: 0 }}>{pct(AXIS_MIN, 0)}</span>
                      <span className={s.axisTarget} style={{ left: at(TARGET) }}>{pct(TARGET, 0)} target</span>
                      <span style={{ right: 0 }}>100%</span>
                    </span>
                    <span className={s.srOnly}>On-time bar</span>
                  </th>
                  <th scope="col" className={s.right}>On-time</th>
                  <th scope="col" className={s.right}>Late avoided</th>
                  <th scope="col" className={s.right}>Cost avoided</th>
                </tr>
              </thead>
              {GROUPS.map((g) => (
                <tbody key={g.title}>
                  <tr className={s.groupRow}><th scope="rowgroup" colSpan={5}>{g.title}</th></tr>
                  {g.rows.map((r) => {
                    const x = chartBy.get(r.scenario);
                    if (!x) return null;
                    return (
                      <tr key={r.scenario}>
                        <th scope="row" className={s.label}>{r.label}{r.note && <small>{r.note}</small>}</th>
                        <td className={s.barCell}>
                          <span className={s.track}>
                            <span className={`${s.fill} ${s[r.tone]}`} style={{ width: at(x.onTime) }} />
                            <span className={s.targetLine} style={{ left: at(TARGET) }} />
                          </span>
                        </td>
                        <td className={`${s.num} ${s.right} ${s.strong} ${s.rate} ${r.tone === 'full' ? s.good : ''}`}>{pct(x.onTime)}</td>
                        <td className={`${s.num} ${s.right} ${s.late}`} data-label="Late avoided">{int(x.lateAvoided)}</td>
                        <td className={`${s.num} ${s.right} ${s.cost}`} data-label="Cost avoided">{usd(x.costAvoided)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              ))}
            </table>
          </div>
        )}
      </section>

      {all.data && (
        <section aria-labelledby="alt-head">
          <h2 id="alt-head" className={s.h2}>Alternative scenarios</h2>
          <p className={s.sub}>On-time and 6-month cost avoided</p>
          <div className={s.alts}>
            {ALTERNATIVES.map((alt) => {
              const x = allBy.get(alt.scenario);
              if (!x) return null;
              const clears = x.onTime >= TARGET;
              return (
                <div key={alt.scenario} className={`${s.alt} ${clears ? s.altBest : ''}`}>
                  <p className={s.altHead}>
                    <span><b>{alt.label}</b><small>{alt.note}</small></span>
                    {clears && <span className={s.tagGood}>Clears {pct(TARGET, 0)}</span>}
                  </p>
                  <p className={s.altFoot}><b className={s.num}>{pct(x.onTime)}</b><span className={s.num}>{usd(x.costAvoided)}</span></p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className={`${s.panel} ${s.tablePanel}`}>
        <div className={s.head}>
          <div>
            <h2 className={s.h2}>{accounts.length || 'The'} accounts threatening to leave</h2>
            {accounts.length > 0 && (
              <p className={s.sub}>{usdShort(revenue)} annual revenue · all running {pct(Math.min(...rates))}–{pct(Math.max(...rates))} on-time</p>
            )}
          </div>
          <ul className={s.groups}>
            {byCause.map((g) => (
              <li key={g.group} className={s.chip}><Icon name={g.icon} size={15} /><b>{usdShort(g.revenue)}</b> · {g.n} accounts · {g.group}</li>
            ))}
          </ul>
        </div>
        <Status loading={a.loading} error={a.error} />
        {accounts.length > 0 && (
          <>
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th scope="col">Client</th>
                    <th scope="col" className={s.right}>Revenue</th>
                    <th scope="col">Channel</th>
                    <th scope="col" className={s.right}>On-time</th>
                    <th scope="col">Main cause</th>
                    <th scope="col" className={s.right}>Complaints</th>
                    <th scope="col"><span className={s.srOnly}>Fix</span></th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((x) => {
                    const c = causeOf(x);
                    return (
                      <tr key={x.clientId}>
                        <td className={s.clientCell}>
                          <span className={s.client}>
                            <span className={s.num} title={x.clientName}>{x.clientId}</span>
                            <span className={/1/.test(x.tier) ? s.tierTop : s.tier}>{x.tier}</span>
                          </span>
                        </td>
                        <td className={`${s.num} ${s.right} ${s.revenue}`}>{usd(x.revenueUsd)}</td>
                        <td className={s.channelCell}><span className={s.channel}>{x.channel}</span></td>
                        <td className={`${s.right} ${s.onTimeCell}`}>
                          <span className={s.onTime}>
                            <span className={s.mini}><span style={{ width: pct(x.onTime) }} /></span>
                            <span className={s.num}>{pct(x.onTime)}</span>
                          </span>
                        </td>
                        <td className={s.causeCell}><span className={s.cause}><Icon name={c.icon} size={15} />{c.short}</span></td>
                        <td className={`${s.num} ${s.right} ${s.complaints}`} data-label="Complaints">
                          {x.complaints >= MANY_COMPLAINTS ? <span className={s.tagBad}>{x.complaints}</span> : x.complaints}
                        </td>
                        <td className={s.go}>
                          <Link href={c.href} aria-label={`${x.clientId}: open the ${c.fix} screen`}><Icon name="chevron" size={16} /></Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className={s.tableFoot}>
              <p>{coverage}.</p>
              <a href={notify}>Notify account owners <Icon name="arrow" size={14} /></a>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

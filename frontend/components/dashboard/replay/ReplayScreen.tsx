'use client';

import Link from 'next/link';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { useUser } from '@/components/auth/UserContext';
import { Pager, Segmented, Status, usePage } from '@/components/dashboard/ui';
import { BRAND } from '@/config/copy';
import { canOpen } from '@/lib/auth/roles';
import { useApi } from '@/hooks/useApi';
import { periods } from '@/lib/dataWindow';
import { int, pct, points, usd, usdShort } from '@/lib/metrics';
import type { Overview } from '../overview/OverviewScreen';
import s from './replay.module.css';

interface Scenario { scenario: string; label: string; grp: string; onTime: number; lateAvoided: number; costAvoided: number }
interface Account { clientId: string; clientName: string; tier: string; revenueUsd: number; channel: string; onTime: number; mainCause: string; complaints: number }
interface Attribution { cause: string; pointsLost: number }

/** The on-time goal the team set (a target, not a computed figure); matches the Overview screen. */
const TARGET = 0.95;
/** Every on-time scale on this screen runs from 60% to 100%. */
const AXIS_MIN = 0.6;
const at = (v: number) => `${Math.max(0, Math.min(100, ((v - AXIS_MIN) / (1 - AXIS_MIN)) * 100))}%`;
const TICKS = [0.6, 0.7, 0.8, 0.9, 1];
/** A complaint count this high is flagged in the accounts table. */
const MANY_COMPLAINTS = 5;
/** A fix removing less than this share of its cause reads as a weak lever (grey meter). */
const WEAK_RATE = 0.7;

/** 24px line icons, drawn with the current text colour. */
const ICON = {
  csv: <><path d="M14 3H6v18h12V7l-4-4Z" /><path d="M14 3v4h4M9 12v6M12 12v6M15 12v6M8.5 15h7" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  checkCircle: <><circle cx="12" cy="12" r="9" /><path d="m8 12.5 3 3 5-6" /></>,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  trendDown: <><path d="m3 7 6 6 4-4 8 8" /><path d="M15 17h6v-6" /></>,
  trendUp: <><path d="m3 17 6-6 4 4 8-8" /><path d="M15 7h6v6" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  flag: <><path d="M5 21V4" /><path d="M5 4h11l-2 4 2 4H5" /></>,
  shield: <><path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3Z" /><path d="m9 12 2 2 4-4" /></>,
  pin: <><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></>,
  truck: <><path d="M3 6h11v10H3zM14 9h4l3 3v4h-7" /><circle cx="7" cy="17.5" r="1.5" /><circle cx="17" cy="17.5" r="1.5" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  warehouse: <><path d="M3 21V8l9-5 9 5v13" /><path d="M7 21v-8h10v8M7 17h10" /></>,
  route: <><circle cx="6" cy="19" r="2" /><circle cx="18" cy="5" r="2" /><path d="M8 19h8.5a3.5 3.5 0 0 0 0-7h-9a3.5 3.5 0 0 1 0-7H16" /></>,
  home: <><path d="M3 11 12 4l9 7" /><path d="M5 10v10h14V10M10 20v-5h4v5" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  plug: <><path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0V8ZM12 17v4" /></>,
  code: <path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" />,
  alert: <><path d="M12 3 2 20h20L12 3Z" /><path d="M12 10v4M12 17h.01" /></>,
};
type IconName = keyof typeof ICON;
const Icon = ({ name, size = 16, stroke = 1.7 }: { name: IconName; size?: number; stroke?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {ICON[name]}
  </svg>
);

/** Each programme fix, its expected adoption rate (SPEC §2.4, set in analytics/core/scenarios.py), the cause it removes and the scenario it adds. */
const FIXES = [
  { scenario: 'adopt_address', label: 'Address check', rate: 0.85, cause: 'f_addr', causeLabel: 'Incomplete address' },
  { scenario: 'adopt_lanes', label: 'Lane rules + Friday cap', rate: 0.9, cause: 'f_lane', causeLabel: 'Bad lanes, D on Fridays' },
  { scenario: 'adopt_cutoff', label: 'Cut-off-aware promise', rate: 0.85, cause: 'f_cutoff', causeLabel: 'Orders after 08:00' },
  { scenario: 'adopt_warehouse', label: 'Warehouse fallback', rate: 0.6, cause: 'f_stock', causeLabel: 'Non-nearest site' },
  { scenario: 'adopt_all', label: 'Last-mile watch', rate: 0.3, cause: 'f_route', causeLabel: 'Route overrun >20%' },
] as const;

type Tone = 'base' | 'added' | 'full' | 'built';
interface Row { scenario: string; label: string; tone: Tone; step: ReactNode; prev?: string }
const GROUPS: { title: string; rows: Row[] }[] = [
  { title: 'Today', rows: [{ scenario: 'today', label: 'Baseline', tone: 'base', step: '0' }] },
  { title: 'Fixes added cumulatively', rows: FIXES.map((f, i) => ({
    scenario: f.scenario, step: f.scenario === 'adopt_all' ? <Icon name="check" size={12} /> : String(i + 1),
    label: f.scenario === 'adopt_all' ? `+ ${f.label} = full programme` : `+ ${f.label}`,
    tone: f.scenario === 'adopt_all' ? 'full' : 'added', prev: i === 0 ? 'today' : FIXES[i - 1].scenario,
  })) },
  { title: 'As built this week', rows: [{ scenario: 'as_built_adopted', label: `${BRAND} as built`, tone: 'built', step: <Icon name="route" size={12} />, prev: 'today' }] },
];

/** Full-fix reference scenarios: what each option reaches if it worked on every delivery. */
const ALTERNATIVES: { scenario: string; kicker: string; label: string; icon: IconName; fixes: string[] }[] = [
  { scenario: 'lanes_routes', kicker: 'Case A', label: 'Carrier lanes + routes', icon: 'truck', fixes: ['Lane rules', 'Friday cap', 'Last-mile watch'] },
  { scenario: 'as_built', kicker: 'Case B', label: `${BRAND} as built`, icon: 'route', fixes: ['This week’s build', 'Full fix'] },
  { scenario: 'all_but_route', kicker: 'Case C', label: 'The four in-house fixes', icon: 'home', fixes: ['Address', 'Cut-off', 'Stock', 'Lanes'] },
];

/** `aug_sep` is the window's last two calendar months (REQ-DATA-14); its name comes from the API window. */
const segments = (recent: string | null) =>
  [['all', 'All orders'], ['email', 'Email orders'], ['at_risk', 'At-risk accounts'], ['aug_sep', recent ?? 'Last two months']] as const;
type Segment = ReturnType<typeof segments>[number][0];

/** Account main causes (analytics/core/diagnosis.py LABELS): short name, icon, the fix that protects them and where it lives. */
const CAUSES: Record<string, { short: string; title: string; icon: IconName; fix: string; href: string }> = {
  'Bad carrier lane or D on a Friday': { short: 'Lane / carrier D', title: 'Bad carrier lane or D on a Friday', icon: 'truck', fix: 'Lane rules + Friday cap', href: '/dashboard/carriers' },
  'Incomplete address at intake': { short: 'Incomplete address', title: 'Incomplete address at intake', icon: 'pin', fix: 'Address check', href: '/dashboard/intake' },
  'Same-day order after 8am cut-off': { short: 'After cut-off', title: 'Same-day order after the 08:00 cut-off', icon: 'clock', fix: 'Cut-off-aware promise', href: '/dashboard/warehouses' },
  'Shipped from a non-nearest warehouse': { short: 'Non-nearest site', title: 'Shipped from a non-nearest warehouse', icon: 'warehouse', fix: 'Warehouse fallback', href: '/dashboard/warehouses' },
  'Route >20% over plan': { short: 'Route overrun', title: 'Route more than 20% over plan', icon: 'route', fix: 'Last-mile watch', href: '/dashboard/carriers' },
};
const causeOf = (a: Account) => CAUSES[a.mainCause] ?? { short: a.mainCause, title: a.mainCause, icon: 'alert' as IconName, fix: 'Other fixes', href: '/dashboard/overview' };
const CHANNEL_ICON: Record<string, IconName> = { Email: 'mail', EDI: 'plug', API: 'code' };

/** "Northwind Apparel" → "NA"; single words and ids fall back to their first two characters. */
const initials = (name: string) => {
  const w = name.split(/\s+/).filter((x) => /^[A-Za-z]/.test(x));
  return (w.length > 1 ? w[0][0] + w[1][0] : name.slice(0, 2)).toUpperCase();
};

function downloadCsv(name: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** Card heading: title and one-line description on the left, optional tools on the right. */
function Head({ title, sub, id, children }: { title: string; sub?: ReactNode; id?: string; children?: ReactNode }) {
  return (
    <div className={s.head}>
      <div>
        <h2 id={id} className={s.h2}>{title}</h2>
        {sub && <p className={s.sub}>{sub}</p>}
      </div>
      {children && <div className={s.tools}>{children}</div>}
    </div>
  );
}

export function ReplayScreen() {
  const roles = useUser()?.roles ?? null; // REQ-AUTH-15: fix links only to screens this role may open
  const [segment, setSegment] = useState<Segment>('all');
  const [copied, setCopied] = useState(false);
  const all = useApi<{ scenarios: Scenario[] }>('/api/replay?segment=all');
  const seg = useApi<{ scenarios: Scenario[] }>(segment === 'all' ? null : `/api/replay?segment=${segment}`);
  const chart = segment === 'all' ? all : seg;
  const a = useApi<{ accounts: Account[] }>('/api/accounts');
  const o = useApi<Overview>('/api/overview');
  const attr = useApi<{ causes: Attribution[] }>('/api/attribution');

  // Overview's "View accounts" links to #accounts; scroll once the panels above have loaded and settled the layout.
  const accountsRef = useRef<HTMLElement>(null);
  const scrolled = useRef(false);
  const loaded = Boolean(all.data && chart.data && a.data);
  useEffect(() => {
    if (!loaded || scrolled.current || window.location.hash !== '#accounts') return;
    scrolled.current = true;
    accountsRef.current?.scrollIntoView({ block: 'start' });
  }, [loaded]);

  // The summary and alternatives always read all orders; the chart follows the segment.
  const allBy = new Map((all.data?.scenarios ?? []).map((x) => [x.scenario, x]));
  const chartBy = new Map((chart.data?.scenarios ?? []).map((x) => [x.scenario, x]));
  const today = allBy.get('today');
  const full = allBy.get('adopt_all');
  const built = allBy.get('as_built_adopted');
  const route = allBy.get('route_only');
  const ready = today && full && built && route;
  const lost = o.data ? o.data.penaltiesUsd + o.data.handlingCostUsd : undefined;
  const lostBy = new Map((attr.data?.causes ?? []).map((c) => [c.cause, c.pointsLost]));

  const accounts = a.data?.accounts ?? [];
  const revenue = accounts.reduce((t, x) => t + x.revenueUsd, 0);
  const byCause = [...accounts.reduce((m, x) => {
    const c = causeOf(x);
    const g = m.get(c.title) ?? { ...c, n: 0, revenue: 0 };
    return m.set(c.title, { ...g, n: g.n + 1, revenue: g.revenue + x.revenueUsd });
  }, new Map<string, ReturnType<typeof causeOf> & { n: number; revenue: number }>()).values()].sort((p, q) => q.n - p.n || q.revenue - p.revenue);
  // Rows run group by group (largest group first), worst-hit accounts first within each.
  const order = new Map(byCause.map((g, i) => [g.title, i]));
  const sorted = [...accounts].sort((p, q) => order.get(causeOf(p).title)! - order.get(causeOf(q).title)! || q.complaints - p.complaints || q.revenueUsd - p.revenueUsd);
  const accountPage = usePage(sorted);

  const summary = ready ? [
    `On-time today: ${pct(today.onTime)}${lost != null ? `, ${usdShort(lost)} lost to lateness over 6 months` : ''}`,
    `${BRAND} as built: ${pct(built.onTime)} at expected adoption, ${usd(built.costAvoided)} avoided`,
    `Full five-cause programme: ${pct(full.onTime)}, +${points(full.onTime - today.onTime)} pts, ${usd(full.costAvoided)} avoided`,
    `Route detours alone: +${points(route.onTime - today.onTime)} pts, ${usd(route.costAvoided)} avoided`,
  ].join('\n') : '';

  const share = async () => {
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 4000);
    } catch { /* clipboard blocked: leave the label as it is */ }
  };

  const exportCsv = () => downloadCsv(`halcyon-replay-${segment}.csv`, [
    ['Scenario', 'On-time', 'Late avoided', 'Cost avoided (6 mo)'],
    ...GROUPS.flatMap((g) => g.rows).map((r) => chartBy.get(r.scenario)).filter((x): x is Scenario => Boolean(x))
      .map((x) => [x.label, pct(x.onTime), x.lateAvoided, x.costAvoided]),
    [],
    ['Client', 'Name', 'Tier', 'Annual revenue', 'Channel', 'On-time', 'Main cause', 'Complaints'],
    ...accounts.map((x) => [x.clientId, x.clientName, x.tier, x.revenueUsd, x.channel, pct(x.onTime), x.mainCause, x.complaints]),
  ]);

  return (
    <div className={s.screen}>
      <div className={s.pageHead}>
        <div className={s.headText}>
          <p className={s.eyebrow}>What-if scenarios</p>
          <h1 className={s.title}>Replay</h1>
          <p className={s.lede}>Rerun every delivery under what-if scenarios to see how on-time performance and cost would change.</p>
        </div>
        <div className={s.actions}>
          <button type="button" className={s.chip} onClick={exportCsv} disabled={!chart.data}><Icon name="csv" size={14} stroke={2} />Export CSV</button>
          <button type="button" className={s.chip} onClick={share} disabled={!ready} aria-live="polite">
            <Icon name={copied ? 'check' : 'copy'} size={14} stroke={2} />{copied ? 'Summary copied' : 'Copy summary'}
          </button>
          {copied && (
            <div className={s.copied} role="status">
              <p><Icon name="checkCircle" />Summary copied to clipboard</p>
              <pre>{summary}</pre>
            </div>
          )}
        </div>
      </div>

      <Status loading={all.loading} error={all.error} skeleton="block" />
      {ready && (
        <section className={s.summary} aria-label="Replay summary">
          <div className={s.sTop}>
            <div className={s.sc}>
              <p className={s.k}><i style={{ background: 'var(--stone-3)' }} />On-time today</p>
              <p className={s.v}>{points(today.onTime)}<span>%</span></p>
              {lost != null && <span className={`${s.cost} ${s.lost}`}><Icon name="trendDown" size={14} />{usdShort(lost)} lost to lateness</span>}
            </div>
            <div className={s.sc}>
              <p className={s.k}><i style={{ background: 'var(--sand)' }} />{BRAND} as built</p>
              <p className={s.v}>{points(built.onTime)}<span>%</span></p>
              <span className={`${s.cost} ${s.saved}`}><Icon name="trendUp" size={14} />{usd(built.costAvoided)} avoided</span>
            </div>
            <div className={`${s.sc} ${s.scFull}`}>
              <p className={s.k}><i style={{ background: 'var(--gain)' }} />Full five-cause programme</p>
              <p className={s.v}>{points(full.onTime)}<span>%</span></p>
              <span className={`${s.cost} ${s.saved}`}><Icon name="trendUp" size={14} />{usd(full.costAvoided)} avoided</span>
            </div>
            <div className={s.sside}>
              <div className={`${s.sstat} ${s.up}`}><p>Full programme adds</p><b>+{points(full.onTime - today.onTime)} pts<small>vs today</small></b></div>
              <div className={s.sstat}><p>Route detours alone</p><b>+{points(route.onTime - today.onTime)} pts<small>{usd(route.costAvoided)} avoided</small></b></div>
            </div>
          </div>
          <div className={s.scale} aria-hidden="true">
            <div className={s.scaleLab}>{TICKS.map((t) => <span key={t}>{pct(t, 0)}</span>)}</div>
            <div className={s.rail}>
              <span className={s.seg} style={{ left: at(today.onTime), width: `calc(${at(built.onTime)} - ${at(today.onTime)})`, background: 'var(--sand-line)' }} />
              <span className={s.seg} style={{ left: at(built.onTime), width: `calc(${at(full.onTime)} - ${at(built.onTime)})`, background: 'var(--gain-line)' }} />
              {full.onTime < TARGET && <span className={s.seg} style={{ left: at(full.onTime), width: `calc(${at(TARGET)} - ${at(full.onTime)})`, background: 'var(--hot-soft)' }} />}
              <span className={s.tgt} style={{ left: at(TARGET) }} />
              <span className={s.pin} style={{ left: at(today.onTime), background: 'var(--stone-3)' }} />
              <span className={s.pin} style={{ left: at(built.onTime), background: 'var(--sand)' }} />
              <span className={s.pin} style={{ left: at(full.onTime), background: 'var(--gain)' }} />
            </div>
            <div className={s.plabels}>
              <div style={{ left: at(today.onTime) }}><b>{pct(today.onTime)}</b>Today</div>
              <div style={{ left: at(built.onTime) }}><b>{pct(built.onTime)}</b>{BRAND}</div>
              <div style={{ left: at(full.onTime) }}><b className={s.gainText}>{pct(full.onTime)}</b>Full programme</div>
              <div className={s.gapLabel} style={{ left: at(TARGET) }}>
                {full.onTime < TARGET
                  ? <><b className={s.hotText}>{points(TARGET - full.onTime)} pts gap</b>to {pct(TARGET, 0)} target</>
                  : <><b className={s.gainText}>Clears</b>{pct(TARGET, 0)} target</>}
              </div>
            </div>
          </div>
          <p className={s.srOnly}>
            Today {pct(today.onTime)}, {BRAND} as built {pct(built.onTime)}, full programme {pct(full.onTime)}, against a {pct(TARGET, 0)} target.
          </p>
        </section>
      )}

      <div className={s.grid}>
        <section className={`${s.card} ${s.chartCard}`} aria-labelledby="chart-head">
          <Head id="chart-head" title="On-time delivery by scenario"
            sub="Fixes stack from today’s baseline. Grey is the rate before each step, green is what that fix adds.">
            <Segmented label="Orders" value={segment} options={segments(periods(o.data)?.test ?? null)} onChange={setSegment} />
          </Head>
          <Status loading={chart.loading} error={chart.error} skeleton="bars" count={8} />
          {chart.data && (
            <>
              <table className={s.chart}>
                <thead>
                  <tr>
                    <th scope="col">Scenario</th>
                    <th scope="col" className={s.axisHead}>
                      <span className={s.axis} aria-hidden="true">{TICKS.map((t) => <span key={t}>{pct(t, 0)}</span>)}</span>
                      <span className={s.srOnly}>On-time bar</span>
                    </th>
                    <th scope="col" className={s.right}>On-time</th>
                    <th scope="col" className={s.right}>Gain</th>
                    <th scope="col" className={s.right}>Late avoided</th>
                    <th scope="col" className={s.right}>Cost avoided</th>
                  </tr>
                </thead>
                {GROUPS.map((g) => (
                  <tbody key={g.title}>
                    <tr className={s.groupRow}><th scope="rowgroup" colSpan={6}><span>{g.title}</span></th></tr>
                    {g.rows.map((r) => {
                      const x = chartBy.get(r.scenario);
                      if (!x) return null;
                      const prev = r.prev ? chartBy.get(r.prev) : undefined;
                      const gain = prev ? x.onTime - prev.onTime : undefined;
                      return (
                        <tr key={r.scenario} className={s[r.tone]}>
                          <th scope="row" className={s.label}><span className={s.labelIn}><span className={s.step}>{r.step}</span>{r.label}</span></th>
                          <td className={s.barCell}>
                            <span className={s.track}>
                              {TICKS.slice(1, -1).map((t) => <span key={t} className={s.gl} style={{ left: at(t) }} />)}
                              <span className={s.bar} style={{ width: at(x.onTime) }} />
                              {prev && r.tone !== 'built' && <span className={s.prev} style={{ width: at(prev.onTime) }} />}
                              <span className={s.targetLine} style={{ left: at(TARGET) }} />
                            </span>
                          </td>
                          <td className={`${s.num} ${s.right} ${s.rate}`}>{pct(x.onTime)}</td>
                          <td className={`${s.num} ${s.right} ${s.gain}`} data-label="Gain">{gain != null ? `+${points(gain)}` : '–'}</td>
                          <td className={`${s.num} ${s.right} ${s.late}`} data-label="Late avoided">{r.tone === 'base' ? '–' : int(x.lateAvoided)}</td>
                          <td className={`${s.num} ${s.right} ${s.costCell}`} data-label="Cost avoided">{r.tone === 'base' ? '–' : usdShort(x.costAvoided)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                ))}
              </table>
              <div className={s.cfoot}>
                <div className={s.legend}>
                  <span><i style={{ background: 'var(--stone-3)' }} />Today</span>
                  <span><i style={{ background: 'var(--stone-4)' }} />Before step</span>
                  <span><i style={{ background: 'var(--gain)' }} />Gain from fix</span>
                  <span><i style={{ background: 'var(--sand)' }} />{BRAND}</span>
                  <span><i className={s.tg} />{pct(TARGET, 0)} target</span>
                </div>
                {segment === 'all' && o.data && <span>Replayed on <b>{int(o.data.deliveries)} orders</b></span>}
              </div>
            </>
          )}
        </section>

        <section className={`${s.card} ${s.assume}`} aria-labelledby="assume-head">
          <Head id="assume-head" title="Assumptions" sub="Share of each cause a fix is expected to remove." />
          <ul className={s.arows}>
            {FIXES.map((f) => {
              const pts = lostBy.get(f.cause);
              return (
                <li key={f.scenario} className={f.rate < WEAK_RATE ? s.low : undefined}>
                  <div className={s.atop}><span>{f.label}</span><b>{pct(f.rate, 0)}</b></div>
                  <div className={s.asub}>
                    <span>{f.causeLabel}</span>
                    {pts != null && <span>removes <b>{points(pts * f.rate)}</b> of {points(pts)} pts</span>}
                  </div>
                  <span className={s.meter}><i style={{ width: pct(f.rate, 0) }} /></span>
                </li>
              );
            })}
          </ul>
          <p className={s.anote}><Icon name="info" />Replayed gains can differ slightly from share × points lost, because some late deliveries have more than one cause.</p>
        </section>
      </div>

      {all.data && (
        <section className={s.card} aria-labelledby="alt-head">
          <Head id="alt-head" title="Alternative scenarios"
            sub={`Three reference cases with their fixes fully in place, measured against the ${pct(TARGET, 0)} target.`} />
          <div className={s.alts}>
            {ALTERNATIVES.map((alt) => {
              const x = allBy.get(alt.scenario);
              if (!x) return null;
              const clears = x.onTime >= TARGET;
              return (
                <article key={alt.scenario} className={`${s.alt} ${clears ? s.win : ''}`}>
                  <div className={s.altTop}>
                    <span className={s.altIc}><Icon name={alt.icon} size={18} /></span>
                    {clears
                      ? <span className={`${s.tag} ${s.clear}`}><Icon name="checkCircle" size={13} />Clears {pct(TARGET, 0)}</span>
                      : <span className={`${s.tag} ${s.short}`}>{points(TARGET - x.onTime)} pts short</span>}
                  </div>
                  <div><p className={s.kicker}>{alt.kicker}</p><h3 className={s.h3}>{alt.label}</h3></div>
                  <div className={s.altStats}>
                    <div><b className={clears ? s.gainText : undefined}>{points(x.onTime)}<small>%</small></b><span>on-time</span></div>
                    <div><b className={s.gainText}>{usdShort(x.costAvoided)}</b><span>cost avoided</span></div>
                  </div>
                  <div>
                    <span className={s.mt} aria-hidden="true"><i style={{ width: at(x.onTime) }} /><b style={{ left: at(TARGET) }} /></span>
                    <span className={s.mtl}><span>{pct(AXIS_MIN, 0)}</span><span>{pct(TARGET, 0)} target</span></span>
                  </div>
                  <p className={s.altFoot}>{alt.fixes.map((f) => <span key={f}>{f}</span>)}</p>
                </article>
              );
            })}
          </div>
        </section>
      )}

      <section id="accounts" ref={accountsRef} className={`${s.card} ${s.accounts}`} aria-labelledby="acc-head">
        <Head id="acc-head" title="Accounts at risk"
          sub={`Client accounts grouped by their main late cause. ${MANY_COMPLAINTS} or more complaints is flagged.`} />
        <div>
          <Status loading={a.loading} error={a.error} skeleton="rows" count={6} />
          {accounts.length > 0 && (
            <>
              <ul className={s.acchead}>
                {byCause.map((g) => (
                  <li key={g.title}>
                    <p><Icon name={g.icon} size={14} />{g.short}</p>
                    <b>{usdShort(g.revenue)}<small>{g.n} account{g.n === 1 ? '' : 's'}</small></b>
                    <span className={s.shr}><i style={{ width: `${(g.revenue / revenue) * 100}%` }} /></span>
                  </li>
                ))}
              </ul>
              <div className={s.flush}>
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th scope="col">Account</th>
                      <th scope="col" className={s.right}>Revenue</th>
                      <th scope="col">Tier</th>
                      <th scope="col">Channel</th>
                      <th scope="col" className={s.right}>On-time</th>
                      <th scope="col">Main late cause</th>
                      <th scope="col" className={s.right}>Complaints</th>
                      <th scope="col" className={s.right}>Protecting fix</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accountPage.rows.map((x, i) => {
                      const c = causeOf(x);
                      const g = byCause.find((b) => b.title === c.title)!;
                      const first = i === 0 || causeOf(accountPage.rows[i - 1]).title !== c.title;
                      return (
                        <Fragment key={x.clientId}>
                          {first && (
                            <tr className={s.gh}>
                              <td colSpan={8}>
                                <div className={s.ghin}>
                                  <b><span><Icon name={c.icon} size={14} /></span>{c.title}</b>
                                  <span>{g.n} account{g.n === 1 ? '' : 's'} · revenue at stake<strong>{usdShort(g.revenue)}</strong></span>
                                </div>
                              </td>
                            </tr>
                          )}
                          <tr className={s.acc}>
                            <td className={s.clientCell}>
                              <span className={s.client}><span className={s.avatar}>{initials(x.clientName)}</span>
                                <span>{x.clientName}<small>{x.clientId}</small></span></span>
                            </td>
                            <td className={`${s.num} ${s.right} ${s.revenue}`} data-label="Revenue">{usdShort(x.revenueUsd)}</td>
                            <td className={s.tierCell}><span className={/1/.test(x.tier) ? `${s.tier} ${s.tierTop}` : s.tier}>{x.tier}</span></td>
                            <td className={s.channelCell}><span className={s.channel}><Icon name={CHANNEL_ICON[x.channel] ?? 'mail'} size={14} />{x.channel}</span></td>
                            <td className={`${s.right} ${s.onTimeCell}`} data-label="On-time">
                              <span className={s.otr}><em><i style={{ width: at(x.onTime) }} /></em><span className={s.num}>{pct(x.onTime)}</span></span>
                            </td>
                            <td className={s.causeCell}>{c.short}</td>
                            <td className={`${s.right} ${s.complaints}`} data-label="Complaints">
                              {x.complaints >= MANY_COMPLAINTS
                                ? <span className={s.flag}><Icon name="flag" size={12} />{x.complaints}</span>
                                : <span className={s.cmp}>{x.complaints}</span>}
                            </td>
                            <td className={`${s.right} ${s.go}`}>
                              {canOpen(roles, c.href)
                                ? <Link className={s.fixl} href={c.href} aria-label={`${x.clientName}: open the ${c.fix} screen`}>{c.fix}<Icon name="arrow" size={12} /></Link>
                                : <span>{c.fix}</span>}
                            </td>
                          </tr>
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className={s.pagerRow}>
                <span>Showing {accountPage.rows.length} of {accounts.length} accounts · {usdShort(revenue)} revenue at stake</span>
                <Pager p={accountPage} className={s.pager} />
              </div>
              <p className={s.closing} data-testid="coverage">
                <Icon name="shield" />
                <span>{byCause.map((g, i) => (
                  <Fragment key={g.title}>
                    {i > 0 && (i === byCause.length - 1 ? ' and ' : ', ')}
                    <b>{g.fix}</b> {i === 0 ? `protects ${g.n} account${g.n === 1 ? '' : 's'}` : g.n}
                  </Fragment>
                ))}.</span>
              </p>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

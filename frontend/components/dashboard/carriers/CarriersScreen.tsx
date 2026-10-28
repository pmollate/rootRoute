'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { PageHero } from '@/components/dashboard/PageHero';
import { Segmented, Status, SyntheticBadge, ui } from '@/components/dashboard/ui';
import { useApi } from '@/hooks/useApi';
import { postJSON } from '@/lib/api';
import { int, pct, points, usd2 } from '@/lib/metrics';
import s from './carriers.module.css';

interface Option { carrier: string; onTime: number; meanRate: number; n: number; score: number | null; status: string; reason: string }
interface Rec { carrier: string; backup: string; reason: string; blocked: string[]; options: Option[] }
interface Backtest { rows: { choice: string; n: number; onTime: number; meanRate: number }[] }
interface Tracking { asOf: string; freshness: { carrier: string; source: string; lastEventAt: string }[]; atRisk: { deliveryId: string; carrier: string }[] }

const REGIONS = [['Midwest', 'Midwest'], ['Northeast', 'Northeast'], ['Southeast', 'Southeast'], ['West', 'West']] as const;
const COMMITMENTS = [['same_day', 'Same day'], ['next_day', 'Next day'], ['standard', 'Standard']] as const;
type Region = (typeof REGIONS)[number][0];
type Commitment = (typeof COMMITMENTS)[number][0];
const COMMITMENT_LABEL = Object.fromEntries(COMMITMENTS) as Record<Commitment, string>;
/** Tracking is synthetic (SD-07); this is the demo day it is shown for. */
const TRACKING_DAY = '2026-09-10';
/** On-time bars run from 50% to 100%, so the gap between carriers is visible. */
const BAR_MIN = 0.5;
const barWidth = (v: number) => `${Math.max(0, Math.min(100, ((v - BAR_MIN) / (1 - BAR_MIN)) * 100))}%`;
/** A feed this many hours behind the end of the tracking day is lagging; a day or more behind is stale. */
const LAG_HOURS = 6;
const STALE_HOURS = 24;
const laneUrl = (region: Region, commitment: Commitment, sla = false) =>
  `/api/carriers?region=${region}&commitment=${commitment}&sla=${sla}`;

/** Line icons, drawn on a 24px grid. */
const Icon = ({ children, size = 16 }: { children: ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const ICON = {
  block: <><circle cx="12" cy="12" r="9" /><path d="m5.6 5.6 12.8 12.8" /></>,
  fileExport: <><path d="M14 3H6v18h12v-5" /><path d="M14 3v4h4v2M11 13h10M18 10l3 3-3 3" /></>,
  play: <path d="M7 4.5v15l12-7.5-12-7.5Z" />,
  truck: <><path d="M3 6h11v10H3zM14 9h4l3 3v4h-7" /><circle cx="7" cy="17.5" r="1.5" /><circle cx="17" cy="17.5" r="1.5" /></>,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  route: <><circle cx="6" cy="19" r="2" /><circle cx="18" cy="5" r="2" /><path d="M8 19h8.5a3.5 3.5 0 0 0 0-7h-9a3.5 3.5 0 0 1 0-7H16" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  checkCircle: <><circle cx="12" cy="12" r="9" /><path d="m8 12.5 2.8 2.8L16.5 9.5" /></>,
  lifering: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /><path d="m5.6 5.6 3.6 3.6M14.8 14.8l3.6 3.6M18.4 5.6l-3.6 3.6M9.2 14.8l-3.6 3.6" /></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  bulb: <><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3Z" /></>,
  contract: <><path d="M14 3H6v18h12V7l-4-4Z" /><path d="M14 3v4h4M9 12h6M9 16h3" /></>,
  cap: <><path d="m2 9 10-5 10 5-10 5L2 9Z" /><path d="M6 11v5c3 2 9 2 12 0v-5M22 9v6" /></>,
  vial: <><path d="M9 3h6M10 3v15a2 2 0 0 0 4 0V3" /><path d="M10 12h4" /></>,
  history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></>,
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />,
  plug: <><path d="M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0V8ZM12 17v5" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
  file: <><path d="M14 3H6v18h12V7l-4-4Z" /><path d="M14 3v4h4" /></>,
  clipboard: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4h6v3H9zM9 13l2 2 4-4" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
};
/** Backtest choices as written by analytics/carriers/backtest.py. */
const CHOICE: Record<string, { label: string; icon: ReactNode }> = {
  recommended: { label: 'Lane rules', icon: ICON.check },
  actual: { label: 'Historical choice', icon: ICON.history },
};

/** How a carrier reports, read from the feed's source name. */
const feedIcon = (source: string) => {
  const f = source.toLowerCase();
  return /json|api|webhook/.test(f) ? ICON.bolt : /edi/.test(f) ? ICON.plug : /portal|html/.test(f) ? ICON.globe
    : /mail/.test(f) ? ICON.mail : ICON.file;
};

/** "10 Sep, 18:42" and how far behind the end of the tracking day the last event is. */
function freshness(lastEventAt: string, asOf: string) {
  const t = new Date(lastEventAt);
  if (Number.isNaN(t.getTime())) return { when: lastEventAt, hours: null };
  const when = `${t.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}, ${t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })}`;
  const end = new Date(`${asOf}T23:59:59Z`).getTime();
  return { when, hours: Math.max(0, (end - t.getTime()) / 36e5) };
}
const behind = (h: number) => (h >= 48 ? `${Math.floor(h / 24)} d behind` : `${Math.round(h)} h behind`);

function exportLane(region: Region, commitment: Commitment, rec: Rec) {
  const lines = [['region', 'commitment', 'carrier', 'status', 'on_time_fair', 'mean_rate_usd', 'deliveries', 'reason'],
    ...rec.options.map((o) => [region, commitment, o.carrier, o.status, o.onTime.toFixed(4), o.meanRate.toFixed(2), o.n, `"${o.reason}"`])];
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([lines.map((l) => l.join(',')).join('\n')], { type: 'text/csv' }));
  a.download = `carriers-${region}-${commitment}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/**
 * Blocked lanes do not depend on the delivery promise, so one call per region (standard) finds all of them; the same
 * calls give the number of carriers in the network.
 */
function useNetwork(): { carriers: number; blocked: { carrier: string; region: Region }[] } | undefined {
  const lanes = [
    ['Midwest', useApi<{ recommendation: Rec }>(laneUrl('Midwest', 'standard')).data],
    ['Northeast', useApi<{ recommendation: Rec }>(laneUrl('Northeast', 'standard')).data],
    ['Southeast', useApi<{ recommendation: Rec }>(laneUrl('Southeast', 'standard')).data],
    ['West', useApi<{ recommendation: Rec }>(laneUrl('West', 'standard')).data],
  ] as const;
  if (lanes.some(([, d]) => !d)) return undefined;
  const carriers = new Set(lanes.flatMap(([, d]) => d!.recommendation.options.map((o) => o.carrier)));
  const blocked = lanes.flatMap(([region, d]) => d!.recommendation.blocked.map((carrier) => ({ carrier, region })))
    .sort((a, b) => a.carrier.localeCompare(b.carrier) || a.region.localeCompare(b.region));
  return { carriers: carriers.size, blocked };
}

/** Card heading: title and one-line description on the left, optional tags or tools on the right. */
function Head({ title, sub, children }: { title: ReactNode; sub?: string; children?: ReactNode }) {
  return (
    <div className={s.head}>
      <div>
        <h2 className={s.h2}>{title}</h2>
        {sub && <p className={s.sub}>{sub}</p>}
      </div>
      {children && <div className={s.tools}>{children}</div>}
    </div>
  );
}

/** On-time bar on the 50–100% scale, with the industry benchmark as a tick when it is known. */
function OnTime({ value, benchmark, strong }: { value: number; benchmark?: number; strong?: boolean }) {
  return (
    <span className={s.ot}>
      <span className={s.otTrack}>
        <i style={{ width: barWidth(value) }} />
        {benchmark != null && <b style={{ left: barWidth(benchmark) }} title={`Benchmark ${pct(benchmark, 0)}`} />}
      </span>
      {strong ? <b>{pct(value)}</b> : pct(value)}
    </span>
  );
}

const Avatar = ({ children }: { children: ReactNode }) => <span className={s.av} aria-hidden="true">{children}</span>;

export function CarriersScreen() {
  const [region, setRegion] = useState<Region>('Northeast');
  const [commitment, setCommitment] = useState<Commitment>('next_day');
  const [sla, setSla] = useState(false);
  const [override, setOverride] = useState({ orderRef: '', to: '', reason: '', user: '' });
  const [overrideMsg, setOverrideMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const lane = useApi<{ recommendation: Rec }>(laneUrl(region, commitment, sla));
  const network = useNetwork();
  const bt = useApi<Backtest>('/api/carriers/backtest');
  const tr = useApi<Tracking>(`/api/tracking?asOf=${TRACKING_DAY}`);
  const benchmark = useApi<{ benchmark: number }>('/api/overview').data?.benchmark;
  const rec = lane.data?.recommendation;
  const best = rec?.options.find((o) => o.carrier === rec.carrier);
  const backup = rec?.options.find((o) => o.carrier === rec.backup);
  const blocked = rec?.options.filter((o) => o.status === 'blocked') ?? [];
  const btRows = bt.data?.rows ?? [];
  const btWin = btRows.length ? btRows.reduce((a, b) => (b.onTime > a.onTime ? b : a)) : undefined;
  const rules = btRows.find((r) => r.choice === 'recommended');
  const history = btRows.find((r) => r.choice === 'actual');

  async function saveOverride() {
    try {
      const r = await postJSON<{ id: number }>('/api/overrides', { ...override, from: rec?.carrier ?? '' });
      setOverrideMsg({ ok: true, text: `Logged override #${r.id}. It will appear in the next lane-rule review.` });
    } catch {
      // A fixed message: the error text can carry API paths, status codes or server internals.
      setOverrideMsg({ ok: false, text: 'Could not log the override. Check the fields and try again.' });
    }
  }

  return (
    <div className={s.screen}>
      {/* Top section as in the design file (Carrier clips/Carriers.html): title, lede and actions in the hero, stats top right. */}
      <PageHero image="/media/carriers-hero.jpg" imagePosition="right 45%" chipsAt="top"
        eyebrow={<span className={s.heroEy}><Icon size={14}>{ICON.truck}</Icon>Line-haul · {REGIONS.length} regions</span>}
        title="Carriers"
        text="Carrier choice by lane, scored only on deliveries with no address, stock or cut-off problem."
        chips={network ? [
          { label: 'Carriers', value: network.carriers },
          { label: 'Lanes blocked', value: network.blocked.length, tone: 'hot' },
        ] : undefined}>
        <div className={s.heroTools}>
          <button type="button" className={s.heroBtn} disabled={!rec} onClick={() => rec && exportLane(region, commitment, rec)}>
            <Icon>{ICON.fileExport}</Icon>Export <span className={s.fileName}>carriers-{region}-{commitment}.csv</span>
          </button>
          <Link className={s.heroCta} href="/dashboard/replay"><Icon size={14}>{ICON.play}</Icon>Open replay</Link>
        </div>
      </PageHero>

      {network && network.blocked.length > 0 && (
        <div className={s.alert} role="note">
          <span className={s.alertIcon}><Icon size={18}>{ICON.block}</Icon></span>
          <div className={s.alertBody}>
            <p><b>{network.blocked.length} carrier lanes are blocked</b>: late on fair data on every promise. Carrier D is
              also capped on Fridays at its normal daily level, so its Friday overflow goes to the next carrier.</p>
            <ul className={s.lanes}>
              {network.blocked.map((l) => (
                <li key={`${l.carrier}-${l.region}`} aria-label={`Carrier ${l.carrier} to ${l.region}`}>
                  <span className={s.laneC}>{l.carrier}</span>Carrier {l.carrier}<Icon size={12}>{ICON.arrow}</Icon>{l.region}
                </li>
              ))}
              <li className={s.laneCap}><span className={s.laneC}>D</span>Friday cap · all regions</li>
            </ul>
          </div>
        </div>
      )}

      <section className={s.panel}>
        <Head title="Which carrier for this lane?"
          sub="Ranked by on-time rate, days late and cost; blocked carriers are never offered." />
        <div className={s.controls}>
          <div className={s.ctl}><p className={s.lb}>Region</p>
            <Segmented label="Region" value={region} options={REGIONS} onChange={setRegion} /></div>
          <div className={s.ctl}><p className={s.lb}>Delivery promise</p>
            <Segmented label="Delivery promise" value={commitment} options={COMMITMENTS} onChange={setCommitment} /></div>
          <label className={s.check}>
            <input type="checkbox" checked={sla} onChange={(e) => setSla(e.target.checked)} />
            <span className={s.box}><Icon size={12}>{ICON.check}</Icon></span>Client has an SLA penalty clause
          </label>
        </div>
        {sla && (
          <p className={s.slaNote}><Icon size={14}>{ICON.contract}</Icon>SLA clause on: days late are weighted more heavily,
            so the ranking favours the most reliable carrier over the cheapest.</p>
        )}
        <Status loading={lane.loading} error={lane.error} skeleton="cards" count={3} />
        {rec && best && (
          <>
            <div className={s.three}>
              <div className={`${s.opt} ${s.rec}`}>
                <span className={s.k}><Icon size={14}>{ICON.checkCircle}</Icon>Recommended</span>
                <div className={s.carrier}><span className={s.cav}>{rec.carrier}</span>
                  <div><b>Carrier {rec.carrier}</b><span>{region} · {COMMITMENT_LABEL[commitment].toLowerCase()}</span></div></div>
                <div className={s.ostats}>
                  <div><p className={`${s.v} ${s.gain}`}>{pct(best.onTime)}</p><p className={s.l}>on-time, fair data</p></div>
                  <div><p className={s.v}>{usd2(best.meanRate)}</p><p className={s.l}>per shipment</p></div>
                </div>
              </div>
              <div className={`${s.opt} ${s.bak}`}>
                <span className={s.k}><Icon size={14}>{ICON.lifering}</Icon>Backup</span>
                <div className={s.carrier}><span className={s.cav}>{rec.backup}</span>
                  <div><b>Carrier {rec.backup}</b><span>Used when the first choice is at capacity</span></div></div>
                {backup && (
                  <div className={s.ostats}>
                    <div><p className={s.v}>{pct(backup.onTime)}</p><p className={s.l}>on-time, fair data</p></div>
                    <div><p className={s.v}>{usd2(backup.meanRate)}</p><p className={s.l}>per shipment</p></div>
                  </div>
                )}
              </div>
              <div className={`${s.opt} ${blocked.length ? s.blk : s.none}`}>
                <span className={s.k}><Icon size={14}>{ICON.block}</Icon>Blocked on this lane</span>
                {blocked.length ? (
                  <>
                    <div className={s.carrier}><span className={s.cav}>{blocked[0].carrier}</span>
                      <div><b>{blocked.length > 1 ? `Carriers ${blocked.map((o) => o.carrier).join(', ')}` : `Carrier ${blocked[0].carrier}`}</b>
                        <span>{blocked.map((o) => `${pct(o.onTime)}`).join(' · ')} on-time on fair data</span></div></div>
                    <span className={s.never}><Icon size={12}>{ICON.lock}</Icon>Never recommended here</span>
                  </>
                ) : <p className={s.l}>No carrier is blocked on this lane.</p>}
              </div>
            </div>
            <p className={s.reason}><Icon>{ICON.bulb}</Icon><span>{rec.reason}</span></p>
            <div className={ui.tableWrap}>
              <table className={s.table}>
                <thead><tr><th>Carrier</th><th>Status</th><th>On-time (fair data)</th><th className={s.right}>Mean rate</th>
                  <th className={s.right}>Deliveries</th><th>Why</th></tr></thead>
                <tbody>
                  {rec.options.map((o) => (
                    <tr key={o.carrier} className={o.status === 'recommended' ? s.rRec : o.status === 'backup' ? s.rBak : o.status === 'blocked' ? s.rBlk : undefined}>
                      <td><span className={s.cn}><Avatar>{o.carrier}</Avatar>Carrier {o.carrier}</span></td>
                      <td><span className={`${s.pill} ${s[o.status] ?? ''}`}>{o.status}</span></td>
                      <td><OnTime value={o.onTime} benchmark={benchmark} strong={o.status === 'recommended' || o.status === 'backup'} /></td>
                      <td className={`${s.right} ${s.num}`}>{usd2(o.meanRate)}</td>
                      <td className={`${s.right} ${s.num}`}>{int(o.n)}</td>
                      <td className={o.status === 'blocked' ? s.whyBlk : s.whyScore}>
                        {o.status === 'blocked' ? o.reason : o.score == null ? '' : `score ${o.score.toFixed(0)}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <div className={s.halves}>
        <section className={s.panel}>
          <Head title="Backtest: rules trained Apr–Jul, tested Aug–Sep"
            sub="Same Aug–Sep deliveries, each way of choosing the carrier." />
          <p className={s.period}><span><Icon size={13}>{ICON.cap}</Icon>Train · Apr–Jul</span>
            <span className={s.test}><Icon size={13}>{ICON.vial}</Icon>Test · Aug–Sep</span></p>
          <Status loading={bt.loading} error={bt.error} skeleton="rows" count={3} />
          {btRows.length > 0 && (
            <div className={ui.tableWrap}>
              <table className={s.table}>
                <thead><tr><th>Carrier choice</th><th>On-time</th><th className={s.right}>Mean rate</th><th className={s.right}>Deliveries</th></tr></thead>
                <tbody>
                  {btRows.map((r) => (
                    <tr key={r.choice} className={r === btWin ? s.win : undefined}>
                      <td><span className={s.cn}><Avatar><Icon size={13}>{CHOICE[r.choice]?.icon ?? ICON.route}</Icon></Avatar>{CHOICE[r.choice]?.label ?? r.choice}</span></td>
                      <td><OnTime value={r.onTime} benchmark={benchmark} strong={r === btWin} /></td>
                      <td className={`${s.right} ${s.num}`}>{usd2(r.meanRate)}</td>
                      <td className={`${s.right} ${s.num}`}>{int(r.n)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {rules && history && (
            <p className={s.btNote}>Lane rules {rules.onTime >= history.onTime ? 'beat' : 'trail'} the historical choice by{' '}
              <b>{rules.onTime >= history.onTime ? '+' : '−'}{points(Math.abs(rules.onTime - history.onTime))} pts</b> on unseen months,
              {' '}{rules.meanRate >= history.meanRate ? `for ${usd2(rules.meanRate - history.meanRate)} more` : `and ${usd2(history.meanRate - rules.meanRate)} less`} per shipment.</p>
          )}
        </section>

        <section className={s.panel}>
          <Head title="Tracking across all six carriers" sub="How each carrier reports delivery events.">
            <SyntheticBadge />
          </Head>
          <Status loading={tr.loading} error={tr.error} skeleton="rows" count={4} />
          {tr.data && (
            <>
              <p className={s.trackHl}><span className={s.trackN}>{int(tr.data.atRisk.length)}</span>
                <span>As of <b>{tr.data.asOf}</b>: {int(tr.data.atRisk.length)} deliveries promised that day have no delivered event.</span></p>
              <div className={ui.tableWrap}>
                <table className={s.table}>
                  <thead><tr><th>Carrier</th><th>Feed</th><th>Last event</th></tr></thead>
                  <tbody>
                    {tr.data.freshness.map((f) => {
                      const { when, hours } = freshness(f.lastEventAt, tr.data!.asOf);
                      const state = hours == null ? '' : hours >= STALE_HOURS ? s.stale : hours >= LAG_HOURS ? s.lag : s.ok;
                      return (
                        <tr key={f.carrier} className={hours != null && hours >= STALE_HOURS ? s.rStale : undefined}>
                          <td><span className={s.cn}><Avatar>{f.carrier}</Avatar>Carrier {f.carrier}</span></td>
                          <td><span className={s.feed}><Icon size={14}>{feedIcon(f.source)}</Icon>{f.source}</span></td>
                          <td className={s.le}><span className={`${s.dot} ${state}`} />{when}
                            {hours != null && hours >= STALE_HOURS && <small>{behind(hours)}</small>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>

      <section className={s.panel}>
        <Head title="Override a recommendation"
          sub="Every override is logged with a reason, so the lane rules can be reviewed." />
        <div className={s.form}>
          <label className={s.fld}><span className={s.lb}>Order ref</span>
            <input className={s.input} placeholder="HX-209012" value={override.orderRef} onChange={(e) => setOverride({ ...override, orderRef: e.target.value })} /></label>
          <label className={s.fld}><span className={s.lb}>Use carrier</span>
            <select className={s.input} value={override.to} onChange={(e) => setOverride({ ...override, to: e.target.value })}>
              <option value="">Choose a carrier</option>
              {rec?.options.filter((o) => o.status !== 'blocked').map((o) => <option key={o.carrier} value={o.carrier}>Carrier {o.carrier}</option>)}
            </select></label>
          <label className={`${s.fld} ${s.wide}`}><span className={s.lb}>Reason</span>
            <input className={s.input} placeholder="e.g. client asked for a named carrier" value={override.reason} onChange={(e) => setOverride({ ...override, reason: e.target.value })} /></label>
          <label className={s.fld}><span className={s.lb}>Your name</span>
            <input className={s.input} placeholder="Full name" value={override.user} onChange={(e) => setOverride({ ...override, user: e.target.value })} /></label>
          <button type="button" className={s.primary} onClick={saveOverride}><Icon>{ICON.clipboard}</Icon>Log override</button>
        </div>
        {overrideMsg && (
          <p className={`${s.toast} ${overrideMsg.ok ? '' : s.toastErr}`} role="status">
            <span className={s.toastIcon}><Icon size={14}>{overrideMsg.ok ? ICON.check : ICON.info}</Icon></span>{overrideMsg.text}
          </p>
        )}
      </section>
    </div>
  );
}

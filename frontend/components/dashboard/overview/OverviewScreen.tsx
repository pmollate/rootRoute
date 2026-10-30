'use client';

import Link from 'next/link';
import { useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { useCanOpen } from '@/components/auth/UserContext';
import { AskAnswer, AskErrorNote } from '@/components/dashboard/assistant/AskAnswer';
import { useAssistantOn } from '@/components/dashboard/assistant/AssistantFlag';
import { Reply, RouterFrame, RouterInput } from '@/components/dashboard/assistant/Router';
import r from '@/components/dashboard/assistant/router.module.css';
import { MAX_QUESTION, useAsk } from '@/components/dashboard/assistant/useAsk';
import { PageHero } from '@/components/dashboard/PageHero';
import { Status } from '@/components/dashboard/ui';
import { useApi } from '@/hooks/useApi';
import type { DataWindow } from '@/lib/dataWindow';
import { int, pct, points, usdK, usdShort } from '@/lib/metrics';
import s from './overview.module.css';

/** `GET /api/overview`, with the data line (window, sites, carriers) of `DataWindow`. */
export interface Overview extends DataWindow {
  onTime: number; benchmark: number; deliveries: number; late: number; penaltiesUsd: number; handlingCostUsd: number;
  atRiskAccounts: number; atRiskRevenueUsd: number; prePickupShare: number;
}
interface Attribution { cause: string; label: string; stage: string; deliveries: number; pointsLost: number; share: number }
interface CauseKpi { cause: string; label: string; kpi: string; baseline: number; target: string; owner: string }
interface Scenario { scenario: string; label: string; onTime: number }

/** The on-time goal the team set (a target, not a computed figure); the 94% industry benchmark comes from the API. */
const TARGET = 0.95;

/** A small square glyph, as used on the chips and card corners of the design. */
const Glyph = () => <span className={s.glyph} aria-hidden="true" />;

/** 24px line icons for the KPI cards, drawn with the current text colour. */
const KPI_ICONS = {
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  box: <><path d="M21 8 12 3 3 8v8l9 5 9-5z" /><path d="M3 8l9 5 9-5M12 13v8" /></>,
  dollar: <path d="M12 3v18M16.5 7.5c0-1.7-2-3-4.5-3s-4.5 1.3-4.5 3 2 2.6 4.5 3 4.5 1.3 4.5 3-2 3-4.5 3-4.5-1.3-4.5-3" />,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.5 3.3-5.5 6.5-5.5s5.9 2 6.5 5.5M16 4.8a3.5 3.5 0 0 1 0 6.4M18.5 14.8c1.6.8 2.7 2.6 3 5.2" /></>,
};
const KpiIcon = ({ name }: { name: keyof typeof KPI_ICONS }) => (
  <span className={s.kpiIcon}>
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {KPI_ICONS[name]}
    </svg>
  </span>
);

const PRE_PICKUP = new Set(['Intake', 'Promise', 'Fulfilment']);
/** The shipment lifecycle, in order: each stage has one of the five causes. */
const LIFECYCLE = ['f_addr', 'f_cutoff', 'f_stock', 'f_lane', 'f_route'];
/** Short stage/cause wording for the lifecycle list. */
const LIFECYCLE_TEXT: Record<string, [string, string]> = {
  f_addr: ['Intake', 'incomplete address'], f_cutoff: ['Promise', 'after 8am cut-off'], f_stock: ['Fulfilment', 'non-nearest warehouse'],
  f_lane: ['Line-haul', 'carrier D, Fridays'], f_route: ['Last mile', 'route overrun >20%'],
};
/** Expected-adoption steps of the replay, in programme order, and the cause each one fixes. */
const ADOPTION = [['adopt_address', 'f_addr'], ['adopt_lanes', 'f_lane'], ['adopt_cutoff', 'f_cutoff'],
  ['adopt_warehouse', 'f_stock'], ['adopt_all', 'f_route']] as const;
/** The proposed fix for each cause: [title, what it fixes, short waterfall label]. */
const FIXES: Record<string, [string, string, string]> = {
  f_addr: ['Validate addresses at intake', 'Fixes incomplete address', 'Address validation'],
  f_lane: ['Lane rules plus a Friday cap on carrier D', 'Fixes lane / carrier D on Fridays', 'Lane rules + Friday cap on D'],
  f_cutoff: ['Cut-off-aware delivery promise with an 11:00 wave', 'Fixes orders after the 8am cut-off', 'Cut-off-aware promise'],
  f_stock: ['Ship from the nearest warehouse with stock', 'With a sibling fallback', 'Nearest warehouse'],
  f_route: ['Live alerts when a route overruns', 'Fixes route overrun above 20%', 'Route overrun alerts'],
};

/** The waterfall runs from 65% to 100% on-time. */
const AXIS_MIN = 0.65;
const at = (v: number) => `${Math.max(0, Math.min(100, ((v - AXIS_MIN) / (1 - AXIS_MIN)) * 100))}%`;
const col = (from: number, to: number) => ({ bottom: at(from), height: `calc(${at(to)} - ${at(from)})` });
/** Counts are shown as whole numbers, shares as percentages. */
const today = (k: CauseKpi) => (k.baseline > 1 ? int(k.baseline) : pct(k.baseline));
/** "<26% (the before-cutoff rate)" → "<26%"; the note moves to a tooltip. */
const shortTarget = (t: string) => t.split(' (')[0];
/** "Sales ops / warehouse" → "SO" */
const initials = (name: string) => name.split(/[\s/]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

interface Step { cause: string; stage: string; pointsLost: number; from: number; to: number }

/** Ring chart for a 0–1 share. */
function Donut({ value }: { value: number }) {
  const r = 26, c = 2 * Math.PI * r;
  return (
    <span className={s.donut} role="img" aria-label={pct(value, 0)}>
      <svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">
        <circle cx="32" cy="32" r={r} className={s.donutRest} />
        <circle cx="32" cy="32" r={r} className={s.donutFill} strokeDasharray={`${c * value} ${c}`} transform="rotate(-90 32 32)" />
      </svg>
      <b>{pct(value, 0)}</b>
    </span>
  );
}

const OPENING = 'How do we close the gap to our 95% on-time target?';
const SUGGESTIONS = ["Show carrier D's Friday lanes", 'Who owns each fix?', 'What closes the last 3 points?'];

interface AssistantProps {
  deliveries?: number; onTime?: number; steps: Step[]; lost: number; ceiling?: number; largest?: string;
  owners: Record<string, string>; loading: boolean; error?: string;
}

/**
 * Recommendations as a conversation. Answers are worked out from the same replay and attribution figures as the rest of
 * the page. With the assistant on (D10), a typed follow-up goes to the assistant instead (`useAsk`, plain text answers);
 * the suggestion chips keep their worked-out answers.
 */
function Assistant({ deliveries, onTime, steps, lost, ceiling, largest, owners, loading, error }: AssistantProps) {
  const [picked, setPicked] = useState(0);
  const carriersOpen = useCanOpen('/dashboard/carriers');
  const [asked, setAsked] = useState<{ q: string; live: boolean }[]>([]);
  const assistantOn = useAssistantOn();
  const live = useAsk();
  const [draft, setDraft] = useState('');
  const [copied, setCopied] = useState(false);
  const final = steps.at(-1)?.to;
  const first = steps[0] ? steps[0].to - steps[0].from : 1;

  const answer = (q: string): ReactNode => {
    if (/own|who/i.test(q)) {
      return <ul className={s.answerList}>{steps.map((x) => <li key={x.cause}><b>{FIXES[x.cause]?.[0]}</b> · {owners[x.cause] || 'No owner named yet'}</li>)}</ul>;
    }
    if (/carrier|friday|lane/i.test(q)) {
      const lane = steps.find((x) => x.cause === 'f_lane');
      return <p>Carrier D on Fridays is a capacity problem on specific lanes and costs {lane ? points(lane.pointsLost) : '—'} points of on-time.
        The lane-by-lane view is on {carriersOpen ? <Link href="/dashboard/carriers">Lanes &amp; carriers</Link> : 'Lanes & carriers'}.</p>;
    }
    if (/last|close|gap|target|95/i.test(q) && final != null && ceiling != null) {
      return <p>At expected adoption the fixes reach {pct(final)}, {points(Math.max(0, TARGET - final))} points short of {pct(TARGET, 0)}.
        Removing every cause entirely would reach {pct(Math.min(ceiling, 1))}, so the last points come from adopting the same five fixes more fully, not from new fixes.</p>;
    }
    return <p>I can answer about the five causes, who owns each fix, carrier D&apos;s lanes, or what closes the gap to target.</p>;
  };
  const ask = (q: string) => { if (q.trim()) setAsked((list) => [...list, { q: q.trim(), live: false }]); setDraft(''); };
  /** D10: the follow-up goes to the assistant; with no answer it leaves the thread and goes back into the box. */
  const askLive = async (q: string) => {
    if (!q.trim() || q.trim().length > MAX_QUESTION || live.busy) return;
    setAsked((list) => [...list, { q: q.trim(), live: true }]);
    setDraft('');
    if (await live.ask(q)) return;
    setAsked((list) => list.filter((_, i) => i !== list.map((x) => x.live).lastIndexOf(true)));
    setDraft(q);
  };
  const submit = (e: FormEvent) => { e.preventDefault(); if (assistantOn) void askLive(draft); else ask(draft); };
  const copyPlan = () => {
    const plan = steps.map((x, i) => `${i + 1}. ${FIXES[x.cause]?.[0]}: +${points(x.to - x.from)} pts, to ${pct(x.to)}`).join('\n');
    navigator.clipboard?.writeText(plan).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); }, () => {});
  };

  return (
    <RouterFrame subtitle={deliveries != null ? `Analysed ${int(deliveries)} deliveries` : undefined}>
      <div className={r.thread}>
        <p className={r.day}>Today</p>
        <p className={r.you}>{OPENING}</p>
        <Reply>
            <p>I traced every late delivery to one of five causes. Here&apos;s <b>one fix per cause, ranked by impact</b>. I replayed each on your
              supplied deliveries at its expected adoption rate. Select a fix to see what it targets.</p>
            <Status loading={loading} error={error} skeleton="rows" count={5} />
            <ol className={s.fixes}>
              {steps.map((x, i) => {
                const fix = FIXES[x.cause];
                const gain = x.to - x.from;
                const open = i === picked;
                return (
                  <li key={x.cause}>
                    <button type="button" className={`${s.fix} ${open ? s.fixOpen : ''}`} aria-expanded={open} onClick={() => setPicked(i)}>
                      <span className={s.fixRow}>
                        <span className={s.fixNum}>{i + 1}</span>
                        <span className={s.fixText}><b>{fix?.[0] ?? x.cause}</b><small>{fix?.[1]} · {x.stage}</small></span>
                        <span className={s.fixBar}><span className={x.cause === largest || i === 0 ? s.hot : undefined} style={{ width: `${(gain / first) * 100}%`, '--i': i } as CSSProperties} /></span>
                        <span className={s.fixPts}><b className={i === 0 ? s.hotText : undefined}>+{points(gain)}</b><small>to {pct(x.to)}</small></span>
                      </span>
                      {open && (
                        <span className={s.fixDetail}>
                          <span><small>Cause removed</small>{points(x.pointsLost)} pts lost</span>
                          <span><small>Lifecycle stage</small>{x.stage}, {PRE_PICKUP.has(x.stage) ? 'before' : 'after'} pickup</span>
                          <span><small>Replayed on-time</small>{(x.from * 100).toFixed(1)} → {pct(x.to)}</span>
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ol>
            {onTime != null && final != null && (
              <>
                <p className={s.applied}><span>Applied together, on-time rises from {pct(onTime)} to</span><b>{pct(final)}</b></p>
                {ceiling != null && ceiling > TARGET && (
                  <p>Removing every cause entirely would put you above the {pct(TARGET, 0)} target, so the last {points(TARGET - final)} points come down to adoption.</p>
                )}
                <p className={s.meta}>
                  {deliveries != null && <span><Glyph />{int(deliveries)} supplied deliveries</span>}
                  <span><Glyph />Replayed at expected adoption</span>
                  <span><Glyph />{steps.length} causes, {points(lost)} pts</span>
                </p>
                <button type="button" className={s.ghost} onClick={copyPlan}><Glyph />{copied ? 'Copied' : 'Copy plan'}</button>
              </>
            )}
        </Reply>
        <div className={r.asked} aria-live="polite">
          {asked.map(({ q, live: isLive }, i) => {
            const reply = isLive ? live.exchanges[asked.slice(0, i).filter((x) => x.live).length]?.answer : undefined;
            return (
              <div key={i}>
                <p className={r.you}>{q}</p>
                <Reply>{!isLive ? answer(q) : reply ? <AskAnswer a={reply} /> : <p>Asking Router…</p>}</Reply>
              </div>
            );
          })}
        </div>
      </div>
      <div className={s.suggest}>
        {SUGGESTIONS.map((q) => <button key={q} type="button" className={s.chip} onClick={() => ask(q)}><Glyph />{q}</button>)}
      </div>
      {assistantOn && live.error && <div className={r.note}><AskErrorNote error={live.error} /></div>}
      <RouterInput value={draft} onChange={setDraft} onSubmit={submit} disabled={!draft.trim() || (assistantOn && live.busy)}
        maxLength={assistantOn ? MAX_QUESTION : undefined} />
    </RouterFrame>
  );
}

export function OverviewScreen() {
  const o = useApi<Overview>('/api/overview');
  const a = useApi<{ causes: Attribution[] }>('/api/attribution');
  const k = useApi<{ kpis: CauseKpi[] }>('/api/cause-kpis');
  const r = useApi<{ scenarios: Scenario[] }>('/api/replay?segment=all');

  const attribution = a.data?.causes ?? [];
  const byCause = new Map(attribution.map((x) => [x.cause, x]));
  const lost = attribution.reduce((t, x) => t + x.pointsLost, 0);
  const maxLost = Math.max(0, ...attribution.map((x) => x.pointsLost));
  const kpis = k.data?.kpis ?? [];
  /** A cause's headline measure is the first one /api/cause-kpis lists for it. */
  const measure = (cause: string) => kpis.find((m) => m.cause === cause);
  const crossCutting = measure('none');

  const scenarios = new Map((r.data?.scenarios ?? []).map((x) => [x.scenario, x]));
  const steps: Step[] = [];
  if (o.data) {
    let from = o.data.onTime;
    for (const [id, cause] of ADOPTION) {
      const sc = scenarios.get(id);
      const c = byCause.get(cause);
      if (!sc || !c) continue;
      steps.push({ cause, stage: c.stage, pointsLost: c.pointsLost, from, to: sc.onTime });
      from = sc.onTime;
    }
  }
  const final = steps.at(-1)?.to;
  const ceiling = o.data ? o.data.onTime + lost : undefined;
  const benchmark = o.data?.benchmark ?? 0.94;
  const largest = attribution[0]?.cause;

  return (
    <div className={s.screen}>
      <div className={s.pageHead}>
        <div>
          <p className={s.eyebrow}>Delivery performance</p>
          <h1 className={s.title}>Overview</h1>
        </div>
      </div>

      <Status loading={o.loading} error={o.error} skeleton="block" count={1} />
      {o.data && (
        <>
          <PageHero image="/media/overview-hero.jpg" imagePosition="right -40px center" imageSize="auto 135%"
            variant="metric" eyebrow="On-time delivery rate" title={<>{(o.data.onTime * 100).toFixed(1)}<small>%</small></>}
            text={<>
              <b>{Math.round((o.data.benchmark - o.data.onTime) * 100)} points below</b> the {pct(o.data.benchmark, 0)} industry benchmark
              and short of the team&apos;s {pct(TARGET, 0)} target. Five causes explain the entire gap, and most of it happens <b>before pickup</b>.
            </>}
            chips={[
              { label: 'Late shipments', value: int(o.data.late), note: `of ${int(o.data.deliveries)}` },
              { label: 'Cost of lateness', value: usdShort(o.data.penaltiesUsd + o.data.handlingCostUsd) },
            ]}>
            <div className={s.heroGauge}>
              <div className={s.heroBar} role="img" aria-label={`${pct(o.data.onTime)} today; benchmark ${pct(benchmark, 0)}, target ${pct(TARGET, 0)}`}>
                <span className={s.heroFill} style={{ width: pct(o.data.onTime) }} />
                <span className={s.heroGap} style={{ left: pct(o.data.onTime), width: pct(TARGET - o.data.onTime) }} />
                <span className={s.heroTick} style={{ left: pct(benchmark) }} />
                <span className={s.heroTick} style={{ left: pct(TARGET) }} />
              </div>
              <div className={s.heroAxis}>
                <span>0%</span>
                <span style={{ left: pct(o.data.onTime) }}><b>{pct(o.data.onTime)}</b>Today</span>
                <span style={{ left: pct(TARGET) }}><b>{pct(benchmark, 0)} / {pct(TARGET, 0)}</b>Benchmark / target</span>
              </div>
            </div>
          </PageHero>

          <div className={s.kpis}>
            <section className={s.kpi}>
              <p className={s.kpiHead}>On-time rate<KpiIcon name="clock" /></p>
              <p className={s.kpiValue}>{(o.data.onTime * 100).toFixed(1)}<small>%</small></p>
              <span className={s.tagBad}><Glyph />{Math.round((o.data.benchmark - o.data.onTime) * 100)} pts vs {pct(o.data.benchmark, 0)} benchmark</span>
              <p className={s.kpiNote}>Target {pct(TARGET, 0)}.{final != null && <> Replayed fixes lift it to <b className={s.good}>{pct(final)}</b>.</>}</p>
            </section>
            <section className={s.kpi}>
              <p className={s.kpiHead}>Late shipments<KpiIcon name="box" /></p>
              <p className={s.kpiValue}>{int(o.data.late)}</p>
              <p className={s.kpiNote}>{pct(o.data.late / o.data.deliveries)} of {int(o.data.deliveries)} shipments arrived late</p>
              <span className={s.split2}>
                <span className={s.light} style={{ flexGrow: o.data.deliveries - o.data.late }} />
                <span className={s.dark} style={{ flexGrow: o.data.late }} />
              </span>
              <p className={s.legend}><span><i className={s.light} />On time {int(o.data.deliveries - o.data.late)}</span><span><i className={s.dark} />Late {int(o.data.late)}</span></p>
            </section>
            <section className={s.kpi}>
              <p className={s.kpiHead}>Cost of lateness<KpiIcon name="dollar" /></p>
              <p className={s.kpiValue}>{usdShort(o.data.penaltiesUsd + o.data.handlingCostUsd)}</p>
              <p className={s.kpiNote}>Penalties and late-delivery handling</p>
              <span className={s.split2}>
                <span className={s.dark} style={{ flexGrow: o.data.penaltiesUsd }} />
                <span className={s.mid} style={{ flexGrow: o.data.handlingCostUsd }} />
              </span>
              <p className={s.legend}><span><i className={s.dark} />Penalties {usdK(o.data.penaltiesUsd)}</span><span><i className={s.mid} />Handling {usdK(o.data.handlingCostUsd)}</span></p>
            </section>
            <section className={s.kpi}>
              <p className={s.kpiHead}>Accounts at risk<KpiIcon name="users" /></p>
              <p className={s.kpiValue}>{o.data.atRiskAccounts}</p>
              <p className={s.kpiNote}>Combined annual revenue <span className={s.tagMuted}>{usdShort(o.data.atRiskRevenueUsd)}</span></p>
            </section>
          </div>
        </>
      )}

      <section className={`${s.panel} ${s.pathPanel}`}>
        <div className={s.head}>
          <div>
            <h2 className={s.h2}>Path to target</h2>
            <p className={s.sub}>
              Each fix replayed on the supplied deliveries at its expected adoption rate.
              {o.data && final != null && <> On-time rises step by step from {pct(o.data.onTime)} to {pct(final)}.</>}
            </p>
          </div>
          <div className={s.chips}>
            {o.data && final != null && <span className={s.tagGood}><Glyph />+{points(final - o.data.onTime)} pts</span>}
            {ceiling != null && <span className={s.tagMuted}>Ceiling {ceiling > TARGET ? `> ${pct(TARGET, 0)}` : pct(ceiling)}</span>}
          </div>
        </div>
        <Status loading={a.loading || r.loading} error={a.error ?? r.error} skeleton="bars" count={6} />
        {o.data && final != null && (
          <div className={s.pathGrid}>
            <div className={s.chartScroll}>
              <div className={s.chart}>
                <div className={s.plot}>
                  {[0.7, 0.8, 0.9, 1].map((v) => <span key={v} className={s.grid} style={{ bottom: at(v) }}><em>{pct(v, 0)}</em></span>)}
                  <span className={s.targetLine} style={{ bottom: at(TARGET) }}><em>Target {pct(TARGET, 0)}</em></span>
                  <span className={s.benchLine} style={{ bottom: at(benchmark) }}><em>Benchmark {pct(benchmark, 0)}</em></span>
                  <div className={s.cols}>
                    <div className={s.col}>
                      <span className={`${s.bar} ${s.barBase}`} style={{ ...col(AXIS_MIN, o.data.onTime), '--i': 0 } as CSSProperties}>
                        <em>{(o.data.onTime * 100).toFixed(1)}</em>
                      </span>
                    </div>
                    {steps.map((x, i) => (
                      <div key={x.cause} className={s.col}>
                        <span className={`${s.bar} ${x.cause === largest ? s.barHot : s.barStep}`} title={`${pct(x.from)} → ${pct(x.to)}`}
                          style={{ ...col(x.from, x.to), '--i': i + 1 } as CSSProperties}>
                          <em>+{points(x.to - x.from)}<small>{(x.to * 100).toFixed(1)}%</small></em>
                        </span>
                      </div>
                    ))}
                    <div className={s.col}>
                      {ceiling != null && <span className={s.ceiling} style={col(final, Math.min(ceiling, 1))}><em>Ceiling {ceiling > TARGET ? `>${pct(TARGET, 0)}` : pct(ceiling)}</em></span>}
                      <span className={`${s.bar} ${s.barFinal}`} style={{ ...col(AXIS_MIN, final), '--i': steps.length + 1 } as CSSProperties}>
                        <b>{(final * 100).toFixed(1)}</b>
                      </span>
                    </div>
                  </div>
                </div>
                <div className={s.colLabels}>
                  <span><b>Today</b></span>
                  {steps.map((x) => <span key={x.cause}>{FIXES[x.cause]?.[2] ?? x.cause}</span>)}
                  <span className={s.good}>With fixes</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      <div className={s.row2}>
        <section className={s.panel}>
          <h2 className={s.h2}>Where the loss starts</h2>
          <p className={s.sub}>Each cause is tied to one stage of the shipment lifecycle.</p>
          {o.data && (
            <div className={s.callout}>
              <Donut value={o.data.prePickupShare} />
              <div>
                <b>of late deliveries start before pickup</b>
                <p>At intake, the delivery promise or fulfilment, not with the carrier.</p>
              </div>
            </div>
          )}
          <Status loading={a.loading} error={a.error} skeleton="rows" count={5} />
          <ol className={s.stages}>
            {LIFECYCLE.map((f, i) => {
              const c = byCause.get(f);
              if (!c) return null;
              const [stage, text] = LIFECYCLE_TEXT[f];
              const pre = PRE_PICKUP.has(c.stage);
              const firstPost = !pre && LIFECYCLE.slice(0, i).every((g) => PRE_PICKUP.has(byCause.get(g)?.stage ?? ''));
              return (
                <li key={f} className={pre ? s.stagePre : undefined} style={{ '--i': i } as CSSProperties}>
                  {firstPost && <span className={s.pickup}>Pickup</span>}
                  <span className={s.stage}>
                    <span className={s.num}>{i + 1}</span>
                    <span><b>{stage}</b> · {text}</span>
                    <span className={s.pts}>{points(c.pointsLost)}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        </section>

        <section className={s.panel}>
          <h2 className={s.h2}>Five causes of lost on-time</h2>
          <p className={s.sub}>Points lost to each cause. No shipment without one of these causes arrived late.</p>
          <Status loading={a.loading} error={a.error} skeleton="rows" count={5} />
          <ul className={s.causes}>
            {attribution.map((x, i) => (
              <li key={x.cause}>
                <span className={s.causeHead}>
                  <span><b>{measure(x.cause)?.label ?? x.label}</b><small>{x.stage}{i === 0 && ' · largest cause'}</small></span>
                  <span className={s.causePts}>{points(x.pointsLost)} <small>pts</small></span>
                </span>
                <span className={s.causeBar}><span className={i === 0 ? s.hot : undefined} style={{ width: `${(x.pointsLost / maxLost) * 100}%`, '--i': i } as CSSProperties} /></span>
              </li>
            ))}
          </ul>
          {lost > 0 && <p className={s.total}><span>Together, all five causes</span><b>{points(lost)} pts</b></p>}
        </section>
      </div>

      <Assistant deliveries={o.data?.deliveries} onTime={o.data?.onTime} steps={steps} lost={lost} ceiling={ceiling}
        largest={largest} owners={Object.fromEntries(attribution.map((x) => [x.cause, measure(x.cause)?.owner ?? '']))}
        loading={a.loading || r.loading} error={a.error ?? r.error} />

      <section className={`${s.panel} ${s.tablePanel}`}>
        <div className={s.head}>
          <div>
            <h2 className={s.h2}>Causes and measures</h2>
            <p className={s.sub}>Each cause has one measure, a current value, a target and a named owner. Customer comms is tracked across all stages.</p>
          </div>
          {kpis.length > 0 && <span className={s.tagMuted}><Glyph />{attribution.length + (crossCutting ? 1 : 0)} measures</span>}
        </div>
        <Status loading={k.loading || a.loading} error={k.error ?? a.error} skeleton="rows" count={6} />
        {kpis.length > 0 && attribution.length > 0 && (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr><th>Cause</th><th>Stage</th><th>Measure</th><th>Current</th><th>Target</th><th>Owner</th><th className={s.right}>Pts at stake</th></tr>
              </thead>
              <tbody>
                {attribution.map((x) => {
                  const m = measure(x.cause);
                  return (
                    <tr key={x.cause}>
                      <td><b>{m?.label ?? x.label}</b></td>
                      <td><span className={`${s.dot} ${PRE_PICKUP.has(x.stage) ? s.dotPre : ''}`}>{x.stage}</span></td>
                      <td>{m?.kpi}</td>
                      <td>{m && <span className={s.cell}>{today(m)}</span>}</td>
                      <td>{m && <span className={s.cell} title={m.target}>{shortTarget(m.target)}</span>}</td>
                      <td>{m && <span className={s.owner}><span className={s.avatar} aria-hidden="true">{initials(m.owner)}</span>{m.owner}</span>}</td>
                      <td className={`${s.right} ${s.strong}`}>{points(x.pointsLost)}</td>
                    </tr>
                  );
                })}
                {crossCutting && (
                  <tr className={s.crossRow}>
                    <td><b>Customer comms</b></td>
                    <td><span className={s.tagMuted}>Cross-cutting</span></td>
                    <td>{crossCutting.kpi}</td>
                    <td><span className={s.cell}>{today(crossCutting)}</span></td>
                    <td><span className={s.cell} title={crossCutting.target}>{shortTarget(crossCutting.target)}</span></td>
                    <td><span className={s.owner}><span className={s.avatar} aria-hidden="true">{initials(crossCutting.owner)}</span>{crossCutting.owner}</span></td>
                    <td className={s.right}>All</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {o.data && (
        <p className={s.foot}>
          <span>Halcyon · Delivery performance overview · {int(o.data.deliveries)} shipments</span>
          <span>Fix impact replayed on supplied deliveries at expected adoption rates</span>
        </p>
      )}
    </div>
  );
}

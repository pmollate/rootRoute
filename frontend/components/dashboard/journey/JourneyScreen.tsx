'use client';

import Link from 'next/link';
import { Fragment, useState, type CSSProperties, type ReactNode } from 'react';
import { Status } from '@/components/dashboard/ui';
import { useApi } from '@/hooks/useApi';
import s from './journey.module.css';

type StageStatus = 'done' | 'current' | 'waiting' | 'at_risk' | 'failed' | 'skipped' | 'not_reached';
interface Stage { n: number; key: string; label: string; status: StageStatus; at: string | null; actor: string;
  source: 'real' | 'synthetic' | 'rule'; detail: string; withLateLens?: string }
interface Journey { ref: string; kind: 'order' | 'delivery'; synthetic: boolean;
  summary: { clientId: string | null; tier: string | null; channel: string; commitment: string | null;
    destination: string | null; promisedDate: string | null; outcome: string };
  rounds: { id: number; receivedAt: string; decision: string | null }[]; stages: Stage[] }
interface Inbox { emails: { id: number; decision: string | null; status: string }[] }

/** Line icons, drawn on a 24px grid. */
const Icon = ({ children, size = 14 }: { children: ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const ICON = {
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  searchMinus: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4M8 11h6" /></>,
  enter: <path d="M20 5v7a3 3 0 0 1-3 3H5M9 11l-4 4 4 4" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  calendar: <><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></>,
  building: <><path d="M5 21V4h10v17M15 9h4v12M3 21h18" /><path d="M8 8h1M11 8h1M8 12h1M11 12h1M8 16h1M11 16h1" /></>,
  pin: <><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z" /><circle cx="12" cy="10" r="2.5" /></>,
  phases: <><rect x="3" y="4" width="7" height="6" rx="1.5" /><rect x="14" y="14" width="7" height="6" rx="1.5" /><path d="M6.5 10v4a3 3 0 0 0 3 3H14" /></>,
  list: <><path d="M10 6h10M10 12h10M10 18h10" /><path d="M4 5h1.5v3M4 8h3M4 15.5a1.2 1.2 0 0 1 2.4 0c0 1-2.4 2-2.4 3h2.6" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  minus: <path d="M6 12h12" />,
  hourglass: <><path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9" /></>,
  alert: <><path d="M12 4 2.5 20h19L12 4Z" /><path d="M12 10v4M12 17h.01" /></>,
  dot: <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />,
  dolly: <><path d="M4 4h3l3 12h10" /><circle cx="10" cy="19" r="2" /><rect x="11" y="6" width="8" height="7" rx="1" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
};

const STATUS: Record<StageStatus, { cls: string; label: string; icon?: ReactNode }> = {
  done: { cls: s.pDone, label: 'Done', icon: ICON.check },
  current: { cls: s.pProg, label: 'In progress', icon: ICON.dot },
  waiting: { cls: s.pWait, label: 'Waiting', icon: ICON.hourglass },
  at_risk: { cls: s.pRisk, label: 'At risk', icon: ICON.alert },
  failed: { cls: s.pBad, label: 'Went wrong here', icon: ICON.x },
  skipped: { cls: s.pSkip, label: 'Not done today' },
  not_reached: { cls: s.pNr, label: 'Not reached' },
};
/** The colour of a stage's node and rail. */
const TONE: Record<StageStatus, string> = {
  done: s.tGood, current: s.tWarn, waiting: s.tWarn, at_risk: s.tWarn, failed: s.tBad, skipped: s.tIdle, not_reached: s.tIdle,
};
/** What the timeline says when a stage has no time. */
const NO_TIME: Partial<Record<StageStatus, string>> = { skipped: 'no time recorded', waiting: 'not yet', current: 'not yet', at_risk: 'not yet' };
/** The five phases on the tracker, by stage number; the bar widths follow the design (3:3:2:4:2). */
const PHASES: [string, number[]][] = [['Intake', [1, 2, 3]], ['Plan', [4, 5, 6]], ['Approve', [7, 8]], ['Ship', [9, 10, 11, 12]], ['Deliver', [13, 14]]];
/** The pickup divider sits after this stage. */
const LAST_BEFORE_PICKUP = 10;
/** Real late deliveries from the supplied data, one per kind of cause (SPEC §5.1). */
const EXAMPLES = [['delivery:D000213', 'address + carrier lane'], ['delivery:D000559', 'cut-off']] as const;
/** A ref that does not exist, shown as a dashed chip so the not-found state can be opened. */
const MISSING = 'delivery:D999999';
const COMMITMENT: Record<string, string> = { same_day: 'Same day', next_day: 'Next day', standard: 'Standard' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-04-05" -> "5 Apr 2026" (no Date parsing, so no time-zone shift). */
const shortDate = (d: string) => { const [y, m, day] = d.split('-'); return `${Number(day)} ${MONTHS[Number(m) - 1]} ${y}`; };
const isPending = (st: Stage) => st.status === 'current' || st.status === 'waiting' || st.status === 'at_risk';

/** A phase takes the colour of its worst stage; the caption says why (a late delivery shows its outcome). */
function phase(stages: Stage[], outcome?: string): { cls: string; icon: ReactNode; text: string } {
  const failed = stages.filter((st) => st.status === 'failed');
  if (failed.length > 1) return { cls: s.bad, icon: ICON.x, text: `${failed.length} stages went wrong` };
  if (failed.length === 1) {
    const f = failed[0];
    return { cls: s.bad, icon: ICON.x, text: outcome && f.n === 13 ? outcome : `${f.label.split(' ')[0]} went wrong` };
  }
  const pending = stages.find(isPending);
  if (pending) return { cls: s.warn, icon: ICON.hourglass, text: `${STATUS[pending.status].label} · ${pending.label}` };
  if (stages.every((st) => st.status === 'skipped')) return { cls: '', icon: ICON.minus, text: 'Not done today' };
  if (stages.every((st) => st.status === 'done' || st.status === 'skipped')) return { cls: s.good, icon: ICON.check, text: 'All done' };
  return { cls: '', icon: ICON.minus, text: 'Not reached' };
}

export function JourneyScreen({ initialRef }: { initialRef: string }) {
  const [ref, setRef] = useState(initialRef);
  const [draft, setDraft] = useState(initialRef);
  const j = useApi<Journey>(`/api/journey/${ref}`);
  const inbox = useApi<Inbox>('/api/intake');
  const open = (r: string) => { setDraft(r); setRef(r.trim()); };
  const data = j.data;
  const sum = data?.summary;
  const outcomeTone = data?.kind === 'order' ? s.nv : sum && /late/i.test(sum.outcome) ? s.hot : '';
  const chip = (r: string, note?: string, dash = false) => (
    <button key={r} type="button" className={`${s.chip} ${dash ? s.chipDash : ''} ${r === ref ? s.chipOn : ''}`} onClick={() => open(r)} aria-pressed={r === ref}>
      {r}{note && <em aria-hidden="true">{note}</em>}
    </button>
  );

  return (
    <div className={s.screen}>
      <section className={s.ban}>
        <img className={s.banImg} src="/media/journey-hero.jpg" alt="Parcels moving along a conveyor belt inside a distribution centre" />
        <div className={s.banShade} aria-hidden="true" />
        <div className={s.banInner}>
          <div>
            <h1 className={s.banTitle}>
              Order journey
            </h1>
            <p className={s.banText}>
              One order from the client&apos;s email to the door. For a past delivery, the stages that made it late are marked,
              with what the Root Route rule gives on the same facts. For a new order, the stages it has reached so far.
            </p>
          </div>
        </div>
      </section>

      <section className={`${s.card} ${s.pick}`}>
        <label className={s.field}>
          <span className={s.lb}>Order or delivery</span>
          <span className={s.inp}>
            <Icon>{ICON.search}</Icon>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && open(draft)}
              placeholder="delivery:D000213 or email:8" spellCheck={false} />
          </span>
        </label>
        <button type="button" className={s.btn} onClick={() => open(draft)}>Open <Icon>{ICON.enter}</Icon></button>
        <div className={s.chips}>
          {EXAMPLES.map(([r, note]) => chip(r, note))}
          {inbox.data?.emails.slice(0, 4).map((e) => chip(`email:${e.id}`))}
          {chip(MISSING, undefined, true)}
        </div>
      </section>

      {j.error ? (
        <section className={`${s.card} ${s.nf}`} role="alert">
          <span className={s.nfIcon}><Icon size={26}>{ICON.searchMinus}</Icon></span>
          <h2>No order or delivery found for {ref}</h2>
          <p>Check the reference, or open one of the quick picks above.</p>
        </section>
      ) : <Status loading={j.loading} skeleton="cards" count={4} />}

      {data && sum && (
        <Fragment key={data.ref}>
          <section className={s.tiles}>
            <Tile label="Outcome" icon={ICON.clock} value={sum.outcome} valueCls={outcomeTone}
              note={data.kind === 'delivery' ? `Delivery ${data.ref.slice(9)}` : `Email ${data.ref.slice(6)}`} />
            <Tile label="Promised" icon={ICON.calendar} value={sum.promisedDate ? shortDate(sum.promisedDate) : '—'} note={COMMITMENT[sum.commitment ?? '']} />
            <Tile label="Client" icon={ICON.building} value={sum.clientId ?? 'Unknown'} note={sum.tier ?? undefined} />
            <Tile label="Destination" icon={ICON.pin} value={sum.destination ?? '—'} note={sum.channel} />
          </section>

          <section className={`${s.card} ${s.ph}`}>
            <div className={s.hh}>
              <div>
                <h2><span className={`${s.hi} ${s.tn}`}><Icon size={16}>{ICON.phases}</Icon></span>Phases</h2>
              </div>
              {data.kind === 'order' && (
                <Link href="/dashboard/intake" className={s.back}>Open in Order emails <Icon>{ICON.arrow}</Icon></Link>
              )}
            </div>
            <ol className={s.bar} aria-label="Phases">
              {PHASES.map(([name, ns]) => {
                const p = phase(data.stages.filter((st) => ns.includes(st.n)), data.kind === 'delivery' ? sum.outcome : undefined);
                return (
                  <li key={name} className={`${s.seg} ${p.cls}`}>
                    <b>{name}</b>
                    <span><Icon size={12}>{p.icon}</Icon>{p.text}</span>
                  </li>
                );
              })}
            </ol>
            <div className={s.lgd} aria-hidden="true">
              <span><i className={s.lBad} />Went wrong</span><span><i className={s.lWarn} />In progress or at risk</span>
              <span><i className={s.lGood} />All done</span><span><i />Not reached</span>
            </div>
          </section>

          <section className={`${s.card} ${s.tl}`}>
            <div className={s.hh}>
              <div>
                <h2><span className={`${s.hi} ${s.tt}`}><Icon size={16}>{ICON.list}</Icon></span>Stages</h2>
              </div>
            </div>
            <ol className={s.tline}>
              {data.stages.map((st, i) => {
                const status = STATUS[st.status];
                const quiet = st.status === 'not_reached';
                const [date, time] = (st.at ?? '').split(' ');
                const who = st.actor && st.actor !== '—' ? st.actor : null;
                return (
                  <Fragment key={st.key}>
                    <li className={`${s.ev} ${TONE[st.status]}`} style={{ '--i': i } as CSSProperties}>
                      <span className={s.when}>
                        {st.at ? <>{time && <b>{time}</b>}<small>{/^\d{4}-\d{2}-\d{2}$/.test(date) ? shortDate(date) : date}</small></>
                          : <i>{NO_TIME[st.status] ?? '—'}</i>}
                      </span>
                      <span className={s.node}><Icon size={13}>{status.icon ?? ICON.minus}</Icon></span>
                      <div className={s.evCard}>
                        <div className={s.evHead}>
                          <span className={s.n}>{st.n}</span>
                          <b className={s.nm}>{st.label}{st.source === 'synthetic' && !quiet && <span className={s.src}>Synthetic data</span>}</b>
                          <span className={`${s.pl} ${status.cls}`}>{status.icon && <Icon size={12}>{status.icon}</Icon>}{status.label}</span>
                        </div>
                        {who && <p className={s.who}>By {who}</p>}
                        <p className={`${s.dt} ${quiet ? s.dtQuiet : ''}`}>{st.detail || (quiet ? 'Not reached' : '')}</p>
                        {st.withLateLens && (
                          <div className={s.rr}><b>With Root Route</b><span>{st.withLateLens}</span></div>
                        )}
                      </div>
                    </li>
                    {st.n === LAST_BEFORE_PICKUP && i < data.stages.length - 1 && (
                      <li className={`${s.ev} ${s.evPk}`} style={{ '--i': i + 0.5 } as CSSProperties} aria-hidden="true">
                        <span />
                        <span className={s.node}><Icon size={13}>{ICON.dolly}</Icon></span>
                        <span className={s.pk}>Pickup</span>
                      </li>
                    )}
                  </Fragment>
                );
              })}
            </ol>
            {data.kind === 'order' && (
              <p className={s.fut}><Icon size={15}>{ICON.info}</Icon>Stages 10 to 13 show once the simulated warehouse and carrier events are built.</p>
            )}
          </section>
        </Fragment>
      )}
    </div>
  );
}

function Tile({ label, icon, value, valueCls = '', note }: { label: string; icon: ReactNode; value: string; valueCls?: string; note?: string }) {
  return (
    <div className={s.tile}>
      <div className={s.k}>{label}<span className={s.kIcon}><Icon size={13}>{icon}</Icon></span></div>
      <div className={`${s.v} ${valueCls} ${value.length > 12 ? s.vLong : ''}`}>{value}</div>
      {note && <div className={s.s}>{note}</div>}
    </div>
  );
}

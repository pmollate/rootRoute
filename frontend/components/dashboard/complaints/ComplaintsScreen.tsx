'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { useCan } from '@/components/auth/UserContext';
import { PageHero } from '@/components/dashboard/PageHero';
import { Segmented, Status } from '@/components/dashboard/ui';
import { useApi } from '@/hooks/useApi';
import { SESSION_ENDED, SessionExpired, postJSON, signInAgain } from '@/lib/api';
import s from './complaints.module.css';

export interface Triage { stages: string[]; prePickup: boolean; escalate: boolean; draft: string; source: 'model' | 'template'; at?: string }
export interface Complaint {
  complaintId: string; clientId: string; deliveryId: string; category: string; date: string; text: string;
  atRisk: boolean; tier: string; escalate: boolean;
  /** The cause stages of the complaint's delivery (delivery_causes); null when the delivery has no causes row. */
  stages?: string[] | null;
  triage: Triage | null;
}

/** The five stages in order, each with its one cause (backend/analytics/core/diagnosis.py STAGE_FLAGS). */
const STAGES = ['Intake', 'Promise', 'Fulfilment', 'Carrier', 'Delivery'] as const;
const PRE_PICKUP = new Set<string>(['Intake', 'Promise', 'Fulfilment']);
const STAGE_CAUSE: Record<string, { cause: string; flag: string }> = {
  Intake: { cause: 'Incomplete address', flag: 'f_addr' },
  Promise: { cause: 'Same-day order after the 8am cut-off', flag: 'f_cutoff' },
  Fulfilment: { cause: 'Shipped from a farther warehouse', flag: 'f_stock' },
  Carrier: { cause: 'Carrier unreliable on this lane, or carrier D on a Friday', flag: 'f_lane' },
  Delivery: { cause: 'More than 20% over the planned route', flag: 'f_route' },
};

const SHOW = [['all', 'All'], ['escalate', 'Escalate'], ['open', 'Not triaged']] as const;
type Show = (typeof SHOW)[number][0];

const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const month = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' });
const monthLong = new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' });
const asDate = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);
/** "2026-07-03" → "3 Jul 2026" */
const fmtDay = (iso: string) => day.format(asDate(iso));
/** "2026-10-29 11:42" → "29 Oct 2026, 11:42" */
const fmtAt = (at: string) => `${fmtDay(at)}${at.length > 10 ? `, ${at.slice(11, 16)}` : ''}`;
/** The months the complaints span: "Jul to Oct 2026". */
function span(dates: string[]): string {
  if (!dates.length) return '';
  const sorted = [...dates].sort();
  const [a, b] = [asDate(sorted[0]), asDate(sorted.at(-1)!)];
  const ya = a.getUTCFullYear(), yb = b.getUTCFullYear();
  if (month.format(a) === month.format(b) && ya === yb) return `${month.format(a)} ${ya}`;
  return ya === yb ? `${month.format(a)} to ${month.format(b)} ${yb}` : `${month.format(a)} ${ya} to ${month.format(b)} ${yb}`;
}
const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** Counts by key, largest first; ties keep first-seen order. */
function countBy<T>(xs: T[], key: (x: T) => string): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const x of xs) m.set(key(x), [...(m.get(key(x)) ?? []), x]);
  return [...m].sort((a, b) => b[1].length - a[1].length);
}

/** Line icons, drawn on a 24px grid. */
const Icon = ({ children, size = 16 }: { children: ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const ICON = {
  headset: <><path d="M4 14v-2a8 8 0 0 1 16 0v2" /><rect x="3" y="14" width="4" height="6" rx="1.5" /><rect x="17" y="14" width="4" height="6" rx="1.5" /><path d="M19 20a3 3 0 0 1-3 2h-3" /></>,
  list: <><path d="M10 6h10M10 12h10M10 18h10" /><path d="m3.5 6 1.5 1.5L7.5 5M3.5 12l1.5 1.5L7.5 11M3.5 18l1.5 1.5L7.5 17" /></>,
  table: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M9 10v10" /></>,
  file: <><path d="M14 3H6v18h12V7l-4-4Z" /><path d="M14 3v4h4M9 12h6M9 16h6" /></>,
  owner: <><circle cx="12" cy="7" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /><path d="m12 13-1.5 3 1.5 5 1.5-5L12 13Z" /></>,
  bars: <path d="M4 6h10M4 12h16M4 18h7" />,
  layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 13 9 5 9-5" /></>,
  route: <><circle cx="6" cy="19" r="2" /><circle cx="18" cy="5" r="2" /><path d="M8 19h8a3 3 0 0 0 0-6H8a3 3 0 0 1 0-6h8" /></>,
  columns: <path d="M5 20V10M12 20V4M19 20v-7M3 20h18" />,
  repeat: <><path d="M4 11V9a3 3 0 0 1 3-3h13l-3-3" /><path d="M20 13v2a3 3 0 0 1-3 3H4l3 3" /></>,
  bulb: <><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.4 1 2.5h6c0-1.1.3-1.8 1-2.5A6 6 0 0 0 12 3Z" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  rotate: <><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  back: <path d="M19 12H5M11 6l-6 6 6 6" />,
};
const STAGE_ICON: Record<string, ReactNode> = {
  Intake: <><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></>,
  Promise: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4M9 15l2 2 4-4" /></>,
  Fulfilment: <><path d="M3 21V9l9-5 9 5v12" /><path d="M7 21v-8h10v8M7 17h10" /></>,
  Carrier: <><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7" /><circle cx="7" cy="18" r="1.8" /><circle cx="17" cy="18" r="1.8" /></>,
  Delivery: <><path d="M6 21 10 3M18 21 14 3M12 6v2M12 11v2M12 16v2" /></>,
};

/**
 * E12 + E14 (SPEC §5.10, §5.15): the complaints from complaints.csv, Tier 1 and at-risk clients first and marked
 * Escalate. Summaries (category, tier, cause stage, month, repeat clients) come from the list itself; the stages come
 * from each delivery's causes. Triage drafts a response from those facts only. The Triage button shows for
 * customer_support and admin (SPEC-auth §4.2); the API refuses anyone else. Layout: Carrier clips/Complaints.html.
 */
export function ComplaintsScreen() {
  const list = useApi<{ complaints: Complaint[] }>('/api/complaints');
  const canTriage = useCan('triage');
  const [show, setShow] = useState<Show>('escalate');
  const [selected, setSelected] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Record<string, Triage>>({});
  const [note, setNote] = useState<{ text: string; link?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = list.data?.complaints ?? [];
  const triageOf = (x: Complaint) => fresh[x.complaintId] ?? x.triage;
  /** The delivery's cause stages; a triage, when there is one, is the latest word. */
  const stagesOf = (x: Complaint) => triageOf(x)?.stages ?? x.stages ?? null;
  const escalating = rows.filter((x) => x.escalate);
  const triaged = rows.filter((x) => triageOf(x)).length;
  const visible = rows.filter((x) => (show === 'escalate' ? x.escalate : show === 'open' ? !triageOf(x) : true));
  const groups = show === 'escalate' ? [{ title: '', rows: visible }] : [
    { title: 'Escalate', rows: visible.filter((x) => x.escalate) },
    { title: 'Other complaints', rows: visible.filter((x) => !x.escalate) },
  ].filter((g) => g.rows.length > 0);
  // The first complaint is open until another is picked, as in the design.
  const c = rows.find((x) => x.complaintId === selected) ?? rows[0] ?? null;

  async function runTriage(id: string) {
    setBusy(true);
    setNote(null);
    try {
      const r = await postJSON<Triage>(`/api/complaints/${id}/triage`, {});
      setFresh((f) => ({ ...f, [id]: r }));
      setNote({ text: `Complaint ${id} triaged${r.escalate ? ' and flagged to escalate' : ''}.` });
      list.reload();
    } catch (e) {
      if (e instanceof SessionExpired) setNote({ text: SESSION_ENDED, link: signInAgain('/dashboard/complaints') });
      else setNote({ text: e instanceof Error && e.message === 'forbidden' ? 'Your role cannot do this.' : 'Couldn’t triage. Try again in a moment.' });
    } finally {
      setBusy(false);
    }
  }

  const escOpen = escalating.filter((x) => !triageOf(x)).length;

  return (
    <div className={s.screen}>
      <PageHero image="/media/complaints-hero.jpg" imagePosition="right center" chipsAt="top"
        eyebrow={<span className={s.heroEy}><Icon size={14}>{ICON.headset}</Icon>Customer support{rows.length > 0 && ` · ${span(rows.map((x) => x.date))}`}</span>}
        title="Complaints"
        text={<>From <span className={s.fileName}>complaints.csv</span>. What clients complain about, where the delay started, and who needs a call first.</>}
        chips={list.data ? [
          { label: 'Complaints', value: rows.length },
          { label: 'Escalate', value: escalating.length, note: `of ${rows.length}`, tone: 'hot' },
          { label: 'Triaged', value: triaged },
        ] : undefined}>
        <div className={s.heroTools}>
          <Link className={s.heroCta} href="/dashboard/journey"><Icon size={14}>{ICON.route}</Icon>Open order journey</Link>
        </div>
      </PageHero>

      {escalating.length > 0 && (
        <div className={s.alert} role="note">
          <span className={s.alertIcon}><Icon size={18}>{ICON.owner}</Icon></span>
          <p><b>{escalating.length === 1 ? '1 complaint escalates' : `${escalating.length} complaints escalate`} to the account
            owner</b>: the client is Tier 1, or its account is threatening to leave.
            {' '}{escOpen === 0 ? 'All of them are triaged.' : `${escOpen} of the ${escalating.length} ${escOpen === 1 ? 'is' : 'are'} not triaged yet.`}</p>
          <span className={s.escDots} role="img" aria-label={`${escOpen} escalations not triaged, ${escalating.length - escOpen} triaged`}>
            {escalating.map((x) => <i key={x.complaintId} className={triageOf(x) ? undefined : s.h} />)}
          </span>
        </div>
      )}

      <Status loading={list.loading} error={list.error} skeleton="rows" />

      {rows.length > 0 && <Summary rows={rows} escalating={escalating} triaged={triaged} stagesOf={stagesOf} />}

      <div className={s.grid}>
        <section className={`${s.panel} ${s.span7}`} aria-labelledby="cmp-list">
          <div className={s.head}>
            <div>
              <h2 id="cmp-list" className={s.h2}><span className={s.hicon}><Icon>{ICON.list}</Icon></span>Escalation queue</h2>
              <p className={s.sub}>Listed in their original order. Dots show the stages each delay came from.</p>
            </div>
            {rows.length > 0 && (
              <button type="button" className={s.btn} onClick={() => setShow('all')}>
                <Icon>{ICON.table}</Icon>All {rows.length} complaints
              </button>
            )}
          </div>
          <div className={s.controls}>
            <div className={s.ctl}>
              <span className={s.lb}>Show</span>
              <Segmented label="Show" value={show} options={SHOW} onChange={setShow} />
            </div>
          </div>
          {list.data && (
            <>
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead>
                    <tr><th>Complaint</th><th>Client</th><th>Category</th><th>Cause stages</th><th>Triage</th></tr>
                  </thead>
                  <tbody>
                    {groups.map((g) => [
                      g.title && <tr key={g.title} className={s.grp}><td colSpan={5}><b>{g.title}</b> · {g.rows.length}</td></tr>,
                      ...g.rows.map((x) => (
                        <tr key={x.complaintId} className={x.complaintId === c?.complaintId ? s.on : undefined}>
                          <td>
                            <button type="button" className={s.cid} aria-pressed={x.complaintId === c?.complaintId}
                              onClick={() => setSelected(x.complaintId)}>{x.complaintId}</button>
                          </td>
                          <td>
                            <span className={s.mono}>{x.clientId}</span> <span className={s.tier}>· {x.tier}</span>
                            {x.escalate && show !== 'escalate' && <span className={`${s.pill} ${s.esc} ${s.inline}`} title="Tier 1 or at-risk client: the account owner follows up">Escalate</span>}
                          </td>
                          <td className={s.cat}>{x.category}</td>
                          <td><MiniStages stages={stagesOf(x)} /></td>
                          <td>{triageOf(x) ? <span className={`${s.pill} ${s.done}`}>Done</span> : <span className={s.dash}>Not yet</span>}</td>
                        </tr>
                      )),
                    ])}
                    {visible.length === 0 && (
                      <tr><td colSpan={5} className={s.none}>
                        {show === 'escalate' ? 'No complaint escalates.' : 'Nothing to show: every complaint here is triaged.'}
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className={s.legend}>
                <span><i className={`${s.dot} ${s.pre}`} />Before pickup</span>
                <span><i className={`${s.dot} ${s.post}`} />After pickup</span>
                <span className={s.dim}>{STAGES.join(' · ')}</span>
              </div>
            </>
          )}
        </section>

        <section className={`${s.panel} ${s.span5} ${s.detail}`} aria-label="Complaint">
          {c ? (
            <Detail c={c} t={triageOf(c)} stages={stagesOf(c)} fromClient={rows.filter((x) => x.clientId === c.clientId).length}
              canTriage={canTriage} busy={busy} onTriage={() => runTriage(c.complaintId)} />
          ) : !list.loading && <p className={s.sub}>No complaints.</p>}
          {note && (
            <p role="status" className={s.status}>
              <Icon>{ICON.info}</Icon>
              <span>{note.text}{note.link && <> <a href={note.link}>Sign in again</a></>}</span>
            </p>
          )}
        </section>
      </div>

      <footer className={s.foot}>
        <span>Complaints · from complaints.csv</span>
        <Link href="/dashboard/overview"><Icon size={14}>{ICON.back}</Icon>Back to overview</Link>
      </footer>
    </div>
  );
}

/** Five dots, one per stage: navy before pickup, warm after, grey where the delivery had no cause. */
function MiniStages({ stages }: { stages: string[] | null }) {
  if (!stages) return <span className={s.dash}>—</span>;
  const hit = new Set(stages);
  return (
    <span className={s.mini} role="img" aria-label={stages.length ? stages.join(', ') : 'No cause found'}>
      {STAGES.map((st) => <i key={st} className={hit.has(st) ? (PRE_PICKUP.has(st) ? s.pre : s.post) : undefined} />)}
    </span>
  );
}

/** KPI tiles, categories and tiers, where the delays started, months and repeat clients. */
function Summary({ rows, escalating, triaged, stagesOf }: {
  rows: Complaint[]; escalating: Complaint[]; triaged: number; stagesOf: (x: Complaint) => string[] | null;
}) {
  const n = rows.length;
  const months = countBy(rows, (x) => x.date.slice(0, 7)).sort((a, b) => a[0].localeCompare(b[0]));
  const monthMax = Math.max(...months.map(([, xs]) => xs.length));
  const [lastKey, lastRows] = months.at(-1)!;
  const lastIsTop = lastRows.length === monthMax && months.filter(([, xs]) => xs.length === monthMax).length === 1;
  const tier1 = escalating.filter((x) => x.tier === 'Tier 1').length;
  const leaving = escalating.length - tier1;
  const ring = 2 * Math.PI * 26;

  // Causes: one per stage hit on a complaint's delivery (a delivery can have more than one).
  const known = rows.filter((x) => stagesOf(x));
  const byStage = Object.fromEntries(STAGES.map((st) => [st, known.filter((x) => stagesOf(x)!.includes(st)).length])) as Record<string, number>;
  const causes = STAGES.reduce((a, st) => a + byStage[st], 0);
  const before = STAGES.filter((st) => PRE_PICKUP.has(st)).reduce((a, st) => a + byStage[st], 0);
  const after = causes - before;
  const ranked = [...STAGES].sort((a, b) => byStage[b] - byStage[a]);
  const stageMax = byStage[ranked[0]];
  const bubble = (v: number) => Math.round(48 + 44 * Math.sqrt(stageMax ? v / stageMax : 0));

  const cats = countBy(rows, (x) => x.category);
  const catMax = cats[0][1].length;
  const tiers = countBy(rows, (x) => x.tier).sort((a, b) => a[0].localeCompare(b[0]));
  const TIER_COLOR = ['var(--navy)', 'var(--navy-2)', 'var(--stone-3)'];
  const donut = 2 * Math.PI * 64;
  let offset = 0;
  const repeat = countBy(rows, (x) => x.clientId).filter(([, xs]) => xs.length > 1)
    .sort((a, b) => Number(b[1].some((x) => x.escalate)) - Number(a[1].some((x) => x.escalate)) || b[1].length - a[1].length);

  return (
    <>
      <div className={s.grid}>
        <div className={`${s.panel} ${s.kpi}`}>
          <span className={s.lb}>Complaints this period</span>
          <div className={s.kRow}>
            <b className={s.big}>{n}</b>
            <span className={s.spark} aria-hidden="true">
              {months.map(([k, xs], i) => <i key={k} className={i === months.length - 1 ? s.last : undefined} style={{ height: `${Math.round(44 * xs.length / monthMax)}px` }} />)}
            </span>
          </div>
          <p className={s.kFoot}><b>{lastRows.length} in {monthLong.format(asDate(`${lastKey}-01`))}</b>{lastIsTop && months.length > 1 ? ', the highest month so far' : ''}</p>
        </div>
        <div className={`${s.panel} ${s.kpi}`}>
          <span className={s.lb}>Escalate</span>
          <div className={s.kRow}>
            <b className={`${s.big} ${s.hot}`}>{escalating.length}<small>{pct(escalating.length, n)}%</small></b>
            <span className={s.share}><i style={{ width: `${pct(escalating.length, n)}%` }} /></span>
          </div>
          <p className={s.kFoot}><b>{tier1} Tier 1</b>{leaving > 0 && `, ${leaving} more threatening to leave`}</p>
        </div>
        <div className={`${s.panel} ${s.kpi}`}>
          <span className={s.lb}>Triaged</span>
          <div className={s.kRow}>
            <b className={s.big}>{triaged}<small>of {n}</small></b>
            <span className={s.ring}>
              <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
                <circle cx="32" cy="32" r="26" fill="none" stroke="var(--stone-5)" strokeWidth="8" />
                {triaged > 0 && <circle cx="32" cy="32" r="26" fill="none" stroke="var(--navy)" strokeWidth="8" strokeLinecap="round"
                  strokeDasharray={`${ring * triaged / n} ${ring}`} transform="rotate(-90 32 32)" />}
              </svg>
              <b>{pct(triaged, n)}%</b>
            </span>
          </div>
          <p className={s.kFoot}><b>{n - triaged} waiting</b>{n - triaged > 0 && ', escalations first'}</p>
        </div>
        <div className={`${s.panel} ${s.kpi}`}>
          <span className={s.lb}>Delays that started before pickup</span>
          <div className={s.kRow}>
            <b className={s.big}>{pct(before, causes)}<small>%</small></b>
            <span className={`${s.share} ${s.shareSplit}`}><i style={{ width: `${pct(before, causes)}%` }} /></span>
          </div>
          <p className={s.kFoot}><b>{before} of {causes}</b> causes were before pickup, not with the carrier</p>
        </div>
      </div>

      <div className={s.grid}>
        <section className={`${s.panel} ${s.span7}`} aria-labelledby="cmp-cats">
          <div className={s.head}><div>
            <h2 id="cmp-cats" className={s.h2}><span className={s.hicon}><Icon>{ICON.bars}</Icon></span>What clients complain about</h2>
            <p className={s.sub}>Complaints by category, with how many escalate.</p>
          </div></div>
          <div className={s.cats}>
            {cats.map(([cat, xs], i) => {
              const esc = xs.filter((x) => x.escalate).length;
              return (
                <div key={cat} className={`${s.crow} ${i === 0 ? s.top : ''}`}>
                  <span className={s.nm}>{cat}</span>
                  <span className={s.track}><i style={{ width: `${(xs.length / catMax) * 100}%` }} /></span>
                  <span className={s.c}>{xs.length}</span>
                  <span className={s.e}>
                    {esc > 0 ? <><span className={s.pip}>{Array.from({ length: esc }, (_, k) => <i key={k} />)}</span>{esc} escalate</> : 'None'}
                  </span>
                </div>
              );
            })}
          </div>
          <div className={s.legend}>
            <span><i className={s.sq} style={{ background: 'var(--accent)' }} />Largest category</span>
            <span><i className={s.sq} style={{ background: 'var(--stone-3)' }} />Other categories</span>
            <span><i className={s.dot} style={{ background: 'var(--hot-ink)' }} />One escalated complaint</span>
          </div>
        </section>

        <section className={`${s.panel} ${s.span5}`} aria-labelledby="cmp-tiers">
          <div className={s.head}><div>
            <h2 id="cmp-tiers" className={s.h2}><span className={`${s.hicon} ${s.tPlum}`}><Icon>{ICON.layers}</Icon></span>Who is complaining</h2>
            <p className={s.sub}>Complaints by client tier.</p>
          </div></div>
          <div className={s.donut}>
            <div className={s.dw}>
              <svg width="170" height="170" viewBox="0 0 170 170" aria-hidden="true">
                <circle cx="85" cy="85" r="64" fill="none" stroke="var(--stone-5)" strokeWidth="22" />
                {tiers.map(([t, xs], i) => {
                  const len = (donut * xs.length) / n;
                  const el = <circle key={t} cx="85" cy="85" r="64" fill="none" stroke={TIER_COLOR[i] ?? 'var(--stone-4)'} strokeWidth="22"
                    strokeDasharray={`${len} ${donut - len}`} strokeDashoffset={-offset} transform="rotate(-90 85 85)" />;
                  offset += len;
                  return el;
                })}
              </svg>
              <div className={s.dc}><div><b>{n}</b><span>complaints</span></div></div>
            </div>
            <div className={s.tiers}>
              {tiers.map(([t, xs], i) => {
                const esc = xs.filter((x) => x.escalate).length;
                return (
                  <div key={t} className={s.tier}>
                    <span className={s.sw} style={{ background: TIER_COLOR[i] ?? 'var(--stone-4)' }} />
                    <span className={s.tn}>{t}<small>{esc} of {xs.length} {esc === 1 ? 'escalates' : 'escalate'}</small></span>
                    <b className={s.tv}>{xs.length}</b>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      {causes > 0 && (
        <section className={s.panel} aria-labelledby="cmp-road">
          <div className={s.head}>
            <div>
              <h2 id="cmp-road" className={s.h2}><span className={`${s.hicon} ${s.tWarm}`}><Icon>{ICON.route}</Icon></span>Where the delays started</h2>
              <p className={s.sub}>Causes found in the delivery records behind {known.length === n ? `all ${n}` : `${known.length} of the ${n}`} complaints. A delivery can have more than one cause.</p>
            </div>
            <span className={`${s.pill} ${s.eli}`}>{plural(causes, 'cause')}</span>
          </div>
          <div className={s.road}>
            {([['pre', 'Before pickup · in our hands', before], ['post', 'After pickup · with the carrier', after]] as const).map(([zone, title, total]) => (
              <div key={zone} className={`${s.zone} ${zone === 'pre' ? s.zPre : s.zPost}`}>
                <div className={s.zh}><b>{title}</b><span>{plural(total, 'cause')}</span></div>
                <div className={s.stages}>
                  {STAGES.filter((st) => PRE_PICKUP.has(st) === (zone === 'pre')).map((st) => {
                    const v = byStage[st], d = bubble(v);
                    return (
                      <div key={st} className={`${s.stg} ${v === stageMax && v > 0 ? s.top : ''}`}>
                        <span className={s.bub} style={{ width: d, height: d, fontSize: Math.round(d / 3.5) }}>{v}</span>
                        <span className={s.sn}>{st}<small>{STAGE_CAUSE[st].flag}</small></span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className={s.split}>
            <span><b>{before}</b> before pickup</span>
            <span className={s.sb}><i className={s.pre} style={{ width: `${pct(before, causes)}%` }} /><i className={s.post} style={{ width: `${100 - pct(before, causes)}%` }} /></span>
            <span><b>{after}</b> after pickup</span>
          </div>
          <p className={s.insight}>
            <Icon>{ICON.bulb}</Icon>
            <span><b>{ranked[0]} is the single biggest source ({byStage[ranked[0]]}): {STAGE_CAUSE[ranked[0]].cause.toLowerCase()}.</b>
              {byStage[ranked[1]] > 0 && <> {ranked[1]} comes next ({byStage[ranked[1]]}): {STAGE_CAUSE[ranked[1]].cause.toLowerCase()}.</>}</span>
          </p>
        </section>
      )}

      <div className={s.grid}>
        <section className={`${s.panel} ${s.span5}`} aria-labelledby="cmp-months">
          <div className={s.head}><div>
            <h2 id="cmp-months" className={s.h2}><span className={s.hicon}><Icon>{ICON.columns}</Icon></span>Complaints by month</h2>
            <p className={s.sub}>Escalated share in each month.</p>
          </div></div>
          <div className={s.chart}>
            {months.map(([k, xs], i) => {
              const esc = xs.filter((x) => x.escalate).length;
              const h = (v: number) => `${(150 * v) / monthMax}px`;
              return (
                <div key={k} className={`${s.col} ${i === months.length - 1 ? s.last : ''}`}>
                  <span className={s.v}>{xs.length}</span>
                  <span className={s.stack} title={`${esc} of ${xs.length} escalate`}>
                    <i className={s.o} style={{ height: h(xs.length - esc) }} /><i className={s.h} style={{ height: h(esc) }} />
                  </span>
                </div>
              );
            })}
          </div>
          <div className={s.months}>{months.map(([k]) => <span key={k}>{month.format(asDate(`${k}-01`))}</span>)}</div>
          <div className={s.legend}>
            <span><i className={s.sq} style={{ background: 'var(--hot-ink)' }} />Escalate</span>
            <span><i className={s.sq} style={{ background: 'var(--stone-4)' }} />Other</span>
            <span><i className={s.sq} style={{ background: 'var(--navy-2)' }} />Latest month</span>
          </div>
        </section>

        <section className={`${s.panel} ${s.span7}`} aria-labelledby="cmp-repeat">
          <div className={s.head}><div>
            <h2 id="cmp-repeat" className={s.h2}><span className={`${s.hicon} ${s.tTeal}`}><Icon>{ICON.repeat}</Icon></span>Clients who complained more than once</h2>
            <p className={s.sub}>Each square is one complaint. Repeat complaints are the strongest sign an account is at risk.</p>
          </div></div>
          {repeat.length ? (
            <div className={s.rep}>
              {repeat.map(([id, xs]) => (
                <div key={id} className={s.rrow}>
                  <span className={s.who}><span className={s.av}>{id}</span><span>{id}<small>{xs[0].tier}</small></span></span>
                  <span className={s.dots} role="img" aria-label={`${plural(xs.length, 'complaint')}, ${xs.filter((x) => x.escalate).length} escalate`}>
                    {xs.map((x) => <i key={x.complaintId} className={x.escalate ? s.h : undefined} />)}
                  </span>
                  <span className={s.st}>
                    {xs[0].atRisk ? <span className={`${s.pill} ${s.esc}`}>Threatening to leave</span>
                      : xs[0].tier === 'Tier 1' ? <span className={`${s.pill} ${s.esc}`}>Tier 1</span>
                      : <span className={`${s.pill} ${s.eli}`}>{plural(xs.length, 'complaint')}</span>}
                  </span>
                </div>
              ))}
            </div>
          ) : <p className={s.none}>No client complained more than once.</p>}
        </section>
      </div>
    </>
  );
}

function Detail({ c, t, stages, fromClient, canTriage, busy, onTriage }: {
  c: Complaint; t: Triage | null; stages: string[] | null; fromClient: number; canTriage: boolean; busy: boolean; onTriage: () => void;
}) {
  const hit = new Set(stages ?? []);
  const pre = stages?.some((st) => PRE_PICKUP.has(st));
  return (
    <>
      <div className={s.head}>
        <div>
          <h2 className={s.h2}><span className={s.hicon}><Icon>{ICON.file}</Icon></span>{c.complaintId}</h2>
          <p className={s.sub}>{c.category}</p>
        </div>
        {c.escalate && <span className={`${s.pill} ${s.esc}`} title={`${c.tier}${c.atRisk ? ', threatening to leave' : ''}: escalate to the account owner`}>Escalate</span>}
      </div>

      <dl className={s.kv}>
        <div><dt>Date</dt><dd>{fmtDay(c.date)}</dd></div>
        <div><dt>Client</dt><dd><span className={s.mono}>{c.clientId}</span> · {c.tier}{c.atRisk ? ', at risk' : ''}</dd></div>
        <div><dt>Complaints from client</dt><dd>{fromClient} this period</dd></div>
        <div>
          <dt>Delivery</dt>
          <dd>
            <Link className={s.journey} href={`/dashboard/journey?ref=delivery:${c.deliveryId}`}>
              <span className={s.mono}>{c.deliveryId}</span> in Journey<Icon size={13}>{ICON.arrow}</Icon>
            </Link>
          </dd>
        </div>
      </dl>

      <blockquote className={s.quote}>{c.text}</blockquote>

      {stages && (
        <>
          <div className={s.subHead}>
            <h3>Where it went wrong</h3>
            {stages.length > 0 && <span className={`${s.pill} ${pre ? s.before : s.after}`}>{pre ? 'Started before pickup' : 'After pickup'}</span>}
          </div>
          <ol className={s.ctrack}>
            {STAGES.map((st) => (
              <li key={st} className={hit.has(st) ? s.hit : undefined} title={hit.has(st) ? STAGE_CAUSE[st].cause : undefined}>
                <Icon size={14}>{STAGE_ICON[st]}</Icon>{st}
                {hit.has(st) && <small>{STAGE_CAUSE[st].flag}</small>}
              </li>
            ))}
          </ol>
          <div className={s.pickup}><span>Before pickup</span><span>After pickup</span></div>
          {stages.length > 0 ? (
            <ul className={s.causeList}>
              {stages.map((st) => <li key={st}><b>{st}</b>{STAGE_CAUSE[st]?.cause ?? st}</li>)}
            </ul>
          ) : <p className={s.note}>None of the five causes on this delivery.</p>}
        </>
      )}

      {t ? (
        <>
          <div className={s.subHead}>
            <h3>Draft response</h3>
            <span className={`${s.pill} ${t.source === 'model' ? s.ai : s.tpl}`}>{t.source === 'model' ? 'AI draft' : 'Template'}</span>
          </div>
          <p className={s.draft}>{t.draft}</p>
          <p className={s.note}>
            <Icon size={14}>{ICON.info}</Icon>
            {t.source === 'model'
              ? 'Written from the cause facts only, under 90 words.'
              : 'The template was used: the model was unavailable, or its draft had a number not in the facts.'}
          </p>
        </>
      ) : (
        <p className={s.empty}>
          <span className={s.emptyIcon}><Icon>{ICON.search}</Icon></span>
          Not triaged yet. Triage looks up the delivery’s causes and drafts a reply.
        </p>
      )}

      <div className={s.act}>
        {canTriage ? (
          <button type="button" className={s.primary} disabled={busy} aria-busy={busy} onClick={onTriage}>
            <Icon>{t ? ICON.rotate : ICON.search}</Icon>{busy ? 'Triaging…' : t ? 'Triage again' : 'Triage'}
          </button>
        ) : (
          <span className={s.lock}><Icon size={14}>{ICON.lock}</Icon>Triage is available to customer support and admin.</span>
        )}
        {t && <span className={s.when}>{t.at ? `Last triaged ${fmtAt(t.at)}` : 'Triaged just now'}</span>}
      </div>
    </>
  );
}

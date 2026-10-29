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
  atRisk: boolean; tier: string; escalate: boolean; triage: Triage | null;
}

/** One cause per stage (backend/analytics/core/diagnosis.py STAGE_FLAGS); triage returns the stages only. */
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

/** Line icons, drawn on a 24px grid. */
const Icon = ({ children, size = 16 }: { children: ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const ICON = {
  headset: <><path d="M4 14v-2a8 8 0 0 1 16 0v2" /><rect x="3" y="14" width="4" height="6" rx="1.5" /><rect x="17" y="14" width="4" height="6" rx="1.5" /><path d="M19 20a3 3 0 0 1-3 2h-3" /></>,
  list: <><path d="M10 6h10M10 12h10M10 18h10" /><path d="m3.5 6 1.5 1.5L7.5 5M3.5 12l1.5 1.5L7.5 11M3.5 18l1.5 1.5L7.5 17" /></>,
  file: <><path d="M14 3H6v18h12V7l-4-4Z" /><path d="M14 3v4h4M9 12h6M9 16h6" /></>,
  owner: <><circle cx="12" cy="7" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /><path d="m12 13-1.5 3 1.5 5 1.5-5L12 13Z" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  rotate: <><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  back: <path d="M19 12H5M11 6l-6 6 6 6" />,
};

/**
 * E12 + E14 (SPEC §5.10, §5.15): the complaints from complaints.csv, Tier 1 and at-risk clients first and marked
 * Escalate. Triage links each to its delivery's causes and drafts a response from those facts only. The Triage button
 * shows for customer_support and admin (SPEC-auth §4.2); the API refuses anyone else. Layout: Carrier clips/Complaints.html.
 */
export function ComplaintsScreen() {
  const list = useApi<{ complaints: Complaint[] }>('/api/complaints');
  const canTriage = useCan('triage');
  const [show, setShow] = useState<Show>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Record<string, Triage>>({});
  const [note, setNote] = useState<{ text: string; link?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = list.data?.complaints ?? [];
  const triageOf = (x: Complaint) => fresh[x.complaintId] ?? x.triage;
  const escalating = rows.filter((x) => x.escalate);
  const triaged = rows.filter((x) => triageOf(x)).length;
  const visible = rows.filter((x) => (show === 'escalate' ? x.escalate : show === 'open' ? !triageOf(x) : true));
  const groups = [
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

  return (
    <div className={s.screen}>
      <PageHero image="/media/complaints-hero.jpg" imagePosition="right center" chipsAt="top"
        eyebrow={<span className={s.heroEy}><Icon size={14}>{ICON.headset}</Icon>Customer support{rows.length > 0 && ` · ${span(rows.map((x) => x.date))}`}</span>}
        title="Complaints"
        text={<>From <span className={s.fileName}>complaints.csv</span>. Tier 1 and at-risk clients come first. Triage finds the stages the delay came from and drafts a reply.</>}
        chips={list.data ? [
          { label: 'Complaints', value: rows.length },
          { label: 'Escalate', value: escalating.length, note: `of ${rows.length}`, tone: 'hot' },
          { label: 'Triaged', value: triaged },
        ] : undefined} />

      {escalating.length > 0 && (
        <div className={s.alert} role="note">
          <span className={s.alertIcon}><Icon size={18}>{ICON.owner}</Icon></span>
          <p><b>{escalating.length} {escalating.length === 1 ? 'complaint escalates' : 'complaints escalate'} to the account
            owner</b>: the client is Tier 1, or its account is threatening to leave. They are listed first, in their original order.</p>
        </div>
      )}

      <div className={s.grid}>
        <section className={`${s.panel} ${s.listPanel}`} aria-labelledby="cmp-list">
          <div className={s.head}>
            <div>
              <h2 id="cmp-list" className={s.h2}><span className={s.hicon}><Icon>{ICON.list}</Icon></span>All complaints</h2>
              <p className={s.sub}>Select a complaint id to open it.</p>
            </div>
          </div>
          <div className={s.controls}>
            <div className={s.ctl}>
              <span className={s.lb}>Show</span>
              <Segmented label="Show" value={show} options={SHOW} onChange={setShow} />
            </div>
          </div>
          <Status loading={list.loading} error={list.error} skeleton="rows" />
          {list.data && (
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr><th>Complaint</th><th>Client</th><th>Category</th><th>Delivery</th><th>Triage</th></tr>
                </thead>
                <tbody>
                  {groups.map((g) => [
                    <tr key={g.title} className={s.grp}><td colSpan={5}><b>{g.title}</b> · {g.rows.length}</td></tr>,
                    ...g.rows.map((x) => (
                      <tr key={x.complaintId} className={x.complaintId === c?.complaintId ? s.on : undefined}>
                        <td>
                          <button type="button" className={s.cid} aria-pressed={x.complaintId === c?.complaintId}
                            onClick={() => setSelected(x.complaintId)}>{x.complaintId}</button>
                        </td>
                        <td>
                          <span className={s.client}>
                            <span className={s.mono}>{x.clientId}</span><span className={s.tier}>· {x.tier}</span>
                            {x.escalate && <span className={`${s.pill} ${s.esc}`} title="Tier 1 or at-risk client: the account owner follows up">Escalate</span>}
                          </span>
                        </td>
                        <td className={s.cat}>{x.category}</td>
                        <td className={s.did}>{x.deliveryId}</td>
                        <td>{triageOf(x) ? <span className={`${s.pill} ${s.done}`}>Done</span> : <span className={s.dash}>—</span>}</td>
                      </tr>
                    )),
                  ])}
                  {groups.length === 0 && (
                    <tr><td colSpan={5} className={s.none}>Nothing to show: every complaint here is triaged.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className={`${s.panel} ${s.detail}`} aria-label="Complaint">
          {c ? (
            <Detail c={c} t={triageOf(c)} canTriage={canTriage} busy={busy} onTriage={() => runTriage(c.complaintId)} />
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

function Detail({ c, t, canTriage, busy, onTriage }: {
  c: Complaint; t: Triage | null; canTriage: boolean; busy: boolean; onTriage: () => void;
}) {
  return (
    <>
      <div className={s.head}>
        <div>
          <h2 className={s.h2}><span className={s.hicon}><Icon>{ICON.file}</Icon></span>{c.complaintId}</h2>
          <p className={s.sub}>{c.category}</p>
        </div>
        {c.escalate && <span className={`${s.pill} ${s.esc}`}>Escalate</span>}
      </div>

      <dl className={s.kv}>
        <div><dt>Date</dt><dd>{fmtDay(c.date)}</dd></div>
        <div><dt>Category</dt><dd>{c.category}</dd></div>
        <div><dt>Client</dt><dd><span className={s.mono}>{c.clientId}</span> · {c.tier}</dd></div>
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

      {c.escalate && (
        <p className={s.escl}>
          <Icon>{ICON.owner}</Icon>
          <span><b>{c.tier}{c.atRisk ? ', threatening to leave' : ''}:</b> escalate to the account owner</span>
        </p>
      )}

      {t ? (
        <>
          <div className={s.subHead}>
            <h3>Cause found</h3>
            <span className={`${s.pill} ${t.prePickup ? s.before : s.after}`}>{t.prePickup ? 'Before pickup' : 'After pickup'}</span>
          </div>
          <table className={`${s.table} ${s.causes}`}>
            <thead><tr><th>Stage</th><th>Cause</th></tr></thead>
            <tbody>
              {t.stages.length ? t.stages.map((st) => (
                <tr key={st}>
                  <td>{st}</td>
                  <td>{STAGE_CAUSE[st]?.cause ?? st}{STAGE_CAUSE[st] && <span className={s.flag}>{STAGE_CAUSE[st].flag}</span>}</td>
                </tr>
              )) : <tr><td colSpan={2} className={s.none}>None of the five causes on this delivery.</td></tr>}
            </tbody>
          </table>

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

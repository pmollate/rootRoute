'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Status } from '@/components/dashboard/ui';
import { useApi } from '@/hooks/useApi';
import { postJSON } from '@/lib/api';
import s from './intake.module.css';

type Decision = 'ALL_CLEAR' | 'CONFIRM_ADDRESS' | 'MISSING_INFO';
interface EmailItem {
  id: number; source: string; from: string; subject: string; receivedAt: string; clientId: string | null; status: string;
  decision: Decision | null; inReplyTo: number | null; priority: boolean;
}
interface LastPoll { trigger: 'schedule' | 'button'; startedAt: string; processed: number; retried: number; ok: boolean | null }
interface Inbox { emails: EmailItem[]; pollMinutes?: number; lastPoll?: LastPoll | null }
interface PollResult { processed: number; retried: number; ok: boolean }
interface Address { line1: string; line2: string | null; city: string; state: string; zip: string }
interface Detail {
  email: { id: number; from: string; subject: string; body: string; redactedBody: string | null; receivedAt: string; status: string; inReplyTo: number | null };
  decision: Decision | null; replyDraft: string | null; replySource: 'model' | 'template' | null;
  extraction: { items: { sku: string; qty: number }[] } | null;
  checks: {
    address: { status: string; missing: string[]; address: Address | null;
      validation: { confidence: string; issues: string[]; suggestion: { zip: string } | null } | null } | null;
    promise: { promiseDate: string; reason: string | null } | null;
    warehouse: { warehouseId: string; reason: string } | null;
    carrier: { carrier: string; reason: string } | null;
  } | null;
}

/** Line icons, drawn on a 24px grid. */
const Icon = ({ children, size = 15 }: { children: ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const ICON = {
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  flask: <><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3" /><path d="M7.5 15h9" /></>,
  fetch: <><path d="M21 12a9 9 0 1 1-2.6-6.4" /><path d="M21 4v5h-5" /></>,
  inbox: <><path d="M3 13h5l1.5 3h5L16 13h5" /><path d="M5 5h14l2 8v6H3v-6l2-8Z" /></>,
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />,
  hourglass: <><path d="M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9s10 4 10 9" /></>,
  reply: <><path d="M10 8 4 13l6 5" /><path d="M4 13h10a6 6 0 0 1 6 6" /></>,
  warehouse: <><path d="M3 21V8l9-5 9 5v13" /><path d="M7 21v-8h10v8M7 17h10" /></>,
  clipboard: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4h6v3H9z" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.4-4.4" /></>,
  mask: <><path d="M3 9c3-1.5 6-1.5 9 0 3-1.5 6-1.5 9 0 0 5-3 8-6 8-1.5 0-2.4-1-3-2-.6 1-1.5 2-3 2-3 0-6-3-6-8Z" /><path d="M7 12h2M15 12h2" /></>,
  shield: <><path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  pin: <><path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11Z" /><circle cx="12" cy="10" r="2.5" /></>,
  alert: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5h.01" /></>,
  warn: <><path d="M12 3 2 20h20L12 3Z" /><path d="M12 10v4M12 17h.01" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  truck: <><path d="M3 6h11v10H3zM14 9h4l3 3v4h-7" /><circle cx="7" cy="17.5" r="1.5" /><circle cx="17" cy="17.5" r="1.5" /></>,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  minus: <path d="M6 12h12" />,
  wand: <><path d="m4 20 11-11M13 7l2-2 4 4-2 2" /><path d="M6 3v3M4.5 4.5h3M19 14v3M17.5 15.5h3" /></>,
  file: <><path d="M14 3H6v18h12V7l-4-4Z" /><path d="M14 3v4h4M9 12h6M9 16h4" /></>,
  send: <><path d="M21 3 3 10.5l7 2.5 2.5 7L21 3Z" /><path d="m10 13 4.5-4.5" /></>,
  rotate: <><path d="M20 12a8 8 0 1 1-2.3-5.7" /><path d="M20 4v5h-5" /></>,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
};

const DECISION: Record<Decision, { label: string; tone: string; icon: ReactNode }> = {
  ALL_CLEAR: { label: 'All clear', tone: s.ok, icon: ICON.check },
  CONFIRM_ADDRESS: { label: 'Confirm address', tone: s.confirm, icon: ICON.pin },
  MISSING_INFO: { label: 'Missing info', tone: s.missing, icon: ICON.alert },
};
const STATUS: Record<string, string> = {
  RECEIVED: 'Received', WAITING: 'Waiting for AI services', AWAITING_APPROVAL: 'Awaiting approval', APPROVED: 'Approved',
  SENT: 'Reply sent', ENTERED: 'In WMS',
};
/** The coloured dot before each status in the list. */
const STATUS_DOT: Record<string, string> = {
  WAITING: s.dotWaiting, AWAITING_APPROVAL: s.dotAwaiting, APPROVED: s.dotApproved, SENT: s.dotSent, ENTERED: s.dotWms,
};
const FIELD: Record<string, string> = { 'address.line1': 'street address', 'address.city': 'city', 'address.state': 'state', 'address.zip': 'ZIP code' };
const ISSUE: Record<string, string> = {
  street_not_found: 'street not found on the map', zip_mismatch: 'ZIP code does not match the city', state_mismatch: 'state does not match the city',
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };
/** "2026-10-21 07:42" -> "21 Oct 2026, 07:42". */
const stamp = (at: string) => { const [date, time] = at.split(' '); return time ? `${day(date)}, ${time}` : at; };
const timeOf = (at: string) => at.split(' ')[1] ?? at;
const oneLine = (a: Address) => `${a.line1}${a.line2 ? `, ${a.line2}` : ''}, ${a.city}, ${a.state} ${a.zip}`;
const ACTION_DONE: Record<string, string> = { approve: 'Approved', send_reply: 'Reply sent', send_to_wms: 'Sent to WMS' };
/** "C412" -> "C4", as on the client avatars. */
const initials = (e: { clientId: string | null; from: string }) => (e.clientId ?? e.from).slice(0, 2).toUpperCase();
/** Tags the PII redaction puts in place of names, phones and emails, e.g. [PERSON_1]. */
const PII_TAG = /(\[[A-Z]+_\d+\])/;

type Folder = 'inbox' | 'priority' | 'approval' | 'client' | 'wms';
const FOLDERS: { key: Folder; label: string; icon: ReactNode; hot?: boolean; match: (e: EmailItem) => boolean }[] = [
  { key: 'inbox', label: 'Inbox', icon: ICON.inbox, match: () => true },
  { key: 'priority', label: 'Priority', icon: ICON.bolt, hot: true, match: (e) => e.priority },
  { key: 'approval', label: 'Awaiting approval', icon: ICON.hourglass, match: (e) => e.status === 'AWAITING_APPROVAL' },
  { key: 'client', label: 'Waiting on client', icon: ICON.reply, match: (e) => e.status === 'SENT' && e.decision !== 'ALL_CLEAR' },
  { key: 'wms', label: 'In WMS', icon: ICON.warehouse, match: (e) => e.status === 'ENTERED' },
];

/** A fixed message per known refusal: the server's text can carry config names or internals. */
function refusal(e: unknown): string {
  const m = e instanceof Error ? e.message : '';
  if (m.includes('allow-list')) return 'Not sent: this address is not on the test allow-list.';
  if (m.includes('Gmail is not set up')) return 'Not sent: Gmail is not connected yet.';
  if (m.includes('check is running')) return 'A Gmail check is already running. Try again in a minute.';
  return 'Could not do that. Refresh and try again.';
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** E15: how often the API checks Gmail by itself, and how the last check went. */
function PollState({ minutes, last }: { minutes: number; last: LastPoll | null }) {
  const how = last && (last.trigger === 'schedule' ? 'automatic' : 'by hand');
  const result = last && (last.ok === false ? 'failed, the next check covers it'
    : `${plural(last.processed, 'new email')}${last.retried ? `, ${last.retried} retried` : ''}`);
  return (
    <div className={s.poll}>
      <p className={s.pollHead}><span className={minutes > 0 ? s.pulse : s.pulseOff} />
        {minutes > 0 ? `Gmail is checked every ${minutes} min.` : 'Automatic Gmail check is off.'}</p>
      {last && <p>Last check {clock(last.startedAt)} ({how}): {result}.</p>}
    </div>
  );
}

function DecisionPill({ decision }: { decision: Decision | null }) {
  if (!decision) return <span className={`${s.pill} ${s.undecided}`}>Not decided</span>;
  const d = DECISION[decision];
  return <span className={`${s.pill} ${d.tone}`}><Icon size={11}>{d.icon}</Icon>{d.label}</span>;
}

function AddressCheck({ a }: { a: NonNullable<Detail['checks']>['address'] }) {
  if (!a) return <>Not read</>;
  if (a.status === 'incomplete') return <>Missing: {a.missing.map((m) => FIELD[m] ?? m).join(', ')}</>;
  if (!a.address) return <>—</>;
  const v = a.validation;
  if (a.status === 'unverified') {
    const issues = v?.issues.map((i) => ISSUE[i] ?? i).join('; ') || 'not confirmed on the map';
    return <>{oneLine(a.address)}: <b>{issues}</b>{v?.suggestion && <> <small>(map shows {v.suggestion.zip})</small></>}</>;
  }
  const how = a.status === 'matched' ? 'saved address' : v && v.confidence !== 'unavailable' ? `map: ${v.confidence} confidence` : 'format checked';
  return <>{oneLine(a.address)} <small>({how})</small></>;
}

/** The redacted body with each PII tag shown as a small dark label. */
function Redacted({ text }: { text: string }) {
  return <>{text.split(PII_TAG).map((part, i) => (PII_TAG.test(part) ? <span key={i} className={s.tag}>{part.slice(1, -1)}</span> : part))}</>;
}

type Mark = 'ok' | 'warn' | 'bad' | 'info' | 'none';
const MARK_CLASS: Record<Mark, string> = { ok: s.mOk, warn: s.mWarn, bad: s.mBad, info: s.mInfo, none: s.mNone };
const MARK_DOT: Record<Mark, ReactNode> = { ok: <Icon size={9}>{ICON.check}</Icon>, warn: '!', bad: '×', info: null, none: null };

function Checks({ d }: { d: Detail }) {
  const c = d.checks;
  const items = d.extraction?.items;
  const a = c?.address;
  const rows: { label: string; mark: Mark; icon: ReactNode; value: ReactNode; cls?: string }[] = [
    { label: 'Items', mark: items ? (items.length ? 'ok' : 'bad') : 'none', icon: items ? (items.length ? ICON.check : ICON.x) : ICON.minus,
      value: items?.length ? <span className={s.mono}>{items.map((i) => `${i.qty} × ${i.sku}`).join(', ')}</span> : 'Not read',
      cls: items?.length ? undefined : s.dash },
    { label: 'Address', mark: !a ? 'none' : a.status === 'incomplete' ? 'bad' : a.status === 'unverified' ? 'warn' : 'ok',
      icon: !a ? ICON.minus : a.status === 'incomplete' ? ICON.x : a.status === 'unverified' ? ICON.warn : ICON.check,
      value: <AddressCheck a={a ?? null} />,
      cls: !a ? s.dash : a.status === 'incomplete' ? s.badText : a.status === 'unverified' ? s.warnText : undefined },
    { label: 'Promise', mark: c?.promise ? (c.promise.reason ? 'warn' : 'ok') : 'none',
      icon: c?.promise ? (c.promise.reason ? ICON.clock : ICON.check) : ICON.minus,
      value: c?.promise ? <><b>{day(c.promise.promiseDate)}</b>{c.promise.reason && <> <small>{c.promise.reason}</small></>}</> : '—',
      cls: c?.promise ? undefined : s.dash },
    { label: 'Warehouse', mark: c?.warehouse ? 'info' : 'none', icon: ICON.warehouse, value: c?.warehouse?.reason ?? '—', cls: c?.warehouse ? undefined : s.dash },
    { label: 'Carrier', mark: c?.carrier ? 'info' : 'none', icon: ICON.truck, value: c?.carrier?.reason ?? '—', cls: c?.carrier ? undefined : s.dash },
  ];
  const [summary, tone] = !d.decision ? ['Not run yet', s.muted]
    : a?.status === 'incomplete' ? ['Address incomplete', s.badText]
      : d.decision === 'CONFIRM_ADDRESS' ? ['Address needs confirming', s.warnText]
        : d.decision === 'MISSING_INFO' ? ['Information missing', s.badText] : ['All checks passed', s.okText];
  return (
    <details className={s.checks} open={rows.some((r) => r.mark === 'bad')}>
      <summary>
        <b>Checks</b>
        <span className={s.dots} aria-hidden="true">{rows.map((r) => <i key={r.label} className={MARK_CLASS[r.mark]}>{MARK_DOT[r.mark]}</i>)}</span>
        <span className={tone}>{summary}</span>
        <span className={s.chevron}><Icon size={12}>{ICON.chevronDown}</Icon></span>
      </summary>
      <dl>
        {rows.map((r) => (
          <div key={r.label} className={s.checkRow}>
            <dt className={MARK_CLASS[r.mark]}><Icon size={12}>{r.icon}</Icon>{r.label}</dt>
            <dd className={r.cls}>{r.value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

interface Note { id: number; text: string; tone: 'info' | 'ok' | 'bad' }

export function IntakeScreen() {
  const list = useApi<Inbox>('/api/intake');
  const [selected, setSelected] = useState<number | null>(null);
  const [pane, setPane] = useState<'email' | 'paste'>('email');
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [view, setView] = useState<'email' | 'ai'>('email');
  const [folder, setFolder] = useState<Folder>('inbox');
  const [query, setQuery] = useState('');
  const detail = useApi<Detail>(selected ? `/api/intake/${selected}` : null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [busy, setBusy] = useState<'fetch' | 'act' | null>(null);
  const [draft, setDraft] = useState({ from: 'orders@client190.example', subject: '[SYNTHETIC] Order', receivedAt: '2026-10-21 08:05', body: '' });
  const readRef = useRef<HTMLElement>(null);
  const seen = useRef<Set<number> | null>(null);
  const d = detail.data && detail.data.email.id === selected ? detail.data : undefined;
  const emails = list.data?.emails ?? [];
  // The reply the operator edits in place: the draft until they type, kept per email.
  const [edit, setEdit] = useState<{ id: number; text: string } | null>(null);
  const reply = d && edit?.id === d.email.id ? edit.text : d?.replyDraft ?? '';
  const setReply = (text: string) => d && setEdit({ id: d.email.id, text });

  // Open the first email once the inbox loads, as a mail client does.
  useEffect(() => {
    if (selected === null && emails.length) setSelected(emails[0].id);
  }, [emails, selected]);

  // Emails that arrive after the first load slide in, highlighted.
  const fresh = new Set<number>();
  if (list.data) {
    if (!seen.current) seen.current = new Set(emails.map((e) => e.id));
    else for (const e of emails) if (!seen.current.has(e.id)) fresh.add(e.id);
  }
  useEffect(() => { for (const id of fresh) seen.current?.add(id); });

  const say = (text: string, tone: Note['tone']) => setNotes((n) => [...n.slice(-3), { id: Date.now(), text, tone }]);

  async function run(kind: 'fetch' | 'act', work: () => Promise<string>) {
    setBusy(kind);
    try {
      say(await work(), 'ok');
    } catch (e) {
      say(refusal(e), 'bad');
    } finally {
      setBusy(null);
      list.reload();
      detail.reload();
    }
  }

  const open = (id: number) => {
    setSelected(id);
    setPane('email');
    if (window.matchMedia?.('(max-width: 760px)').matches) readRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };

  const act = (action: 'approve' | 'send_reply' | 'send_to_wms') => run('act', async () => {
    await postJSON<{ status: string }>(`/api/intake/${selected}/action`,
      { action, user: 'ops', ...(action === 'send_reply' ? { reply: reply.trim() } : {}) });
    return `Email ${selected}: ${ACTION_DONE[action]}.`;
  });

  const fetchGmail = () => run('fetch', async () => {
    const r = await postJSON<PollResult>('/api/intake/fetch', {});
    if (!r.ok) return 'The Gmail check did not finish. The next check will cover it.';
    return `Checked Gmail: ${plural(r.processed, 'new email')}${r.retried ? `, ${r.retried} retried` : ''}.`;
  });

  const submit = () => run('act', async () => {
    const r = await postJSON<{ id: number; decision: Decision | null }>('/api/intake/email',
      { ...draft, ...(replyTo ? { inReplyTo: replyTo } : {}) });
    setSelected(r.id);
    setPane('email');
    setReplyTo(null);
    setDraft({ ...draft, body: '' });
    return r.decision ? `Email ${r.id}: ${r.decision}` : `Email ${r.id} is waiting: the AI services did not answer. Process it again shortly.`;
  });

  const pasteFor = (id: number | null) => { setReplyTo(id); setPane('paste'); };

  // Search matches everything a row shows: number, sender, client, subject, decision, status, priority.
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = (e: EmailItem) => [e.id, e.from, e.clientId, e.subject, e.decision && DECISION[e.decision].label,
    STATUS[e.status] ?? e.status, e.priority && 'priority', e.inReplyTo && `reply to ${e.inReplyTo}`].filter(Boolean).join(' ').toLowerCase();
  const shown = emails.filter((e) => FOLDERS.find((f) => f.key === folder)!.match(e))
    .filter((e) => terms.every((t) => haystack(e).includes(t)));
  const status = d?.email.status;
  const waitingOnClient = d && d.decision !== 'ALL_CLEAR' && d.decision !== null && status === 'SENT';
  const disabled = busy !== null;

  return (
    <>
      <h1 className={s.srOnly}>Order emails</h1>
      <section className={s.app}>
        <aside className={s.rail}>
          <button type="button" className={s.fetch} onClick={fetchGmail} disabled={disabled}>
            <span className={busy === 'fetch' ? s.spin : undefined}><Icon>{ICON.fetch}</Icon></span>Fetch from Gmail
          </button>
          <p className={s.railLabel}>Mailbox</p>
          <nav className={s.folders} aria-label="Mailbox">
            {FOLDERS.map((f) => {
              const n = emails.filter(f.match).length;
              return (
                <button key={f.key} type="button" className={s.folder} aria-pressed={pane === 'email' && folder === f.key}
                  onClick={() => { setFolder(f.key); setPane('email'); }}>
                  <Icon>{f.icon}</Icon><span>{f.label}</span><b className={f.hot && n ? s.countHot : undefined}>{n}</b>
                </button>
              );
            })}
          </nav>
          <p className={s.railLabel}>Tools</p>
          <button type="button" className={s.folder} aria-pressed={pane === 'paste'} onClick={() => pasteFor(null)}>
            <Icon>{ICON.clipboard}</Icon><span>Paste an email</span>
          </button>
          {list.data && <PollState minutes={list.data.pollMinutes ?? 0} last={list.data.lastPoll ?? null} />}
        </aside>

        <section className={s.list} aria-label="Emails">
          <div className={s.listHead}>
            <div className={s.listTitle}><h2>{FOLDERS.find((f) => f.key === folder)!.label}</h2>
              <span className={s.sample} title="Built on data we generated (SPEC §12.1)"><Icon size={11}>{ICON.flask}</Icon>Synthetic data</span></div>
            <label className={s.search}><Icon size={13}>{ICON.search}</Icon>
              <input type="search" placeholder="Search sender, client, subject or status" aria-label="Search emails" value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            <p className={s.hint}><Icon size={11}>{ICON.bolt}</Icon>Priority clients (Tier 1 or at risk) are listed first.</p>
          </div>
          <div className={s.items}>
            <Status loading={list.loading && !list.data} error={list.error} />
            {list.data && emails.length === 0 && <p className={s.empty}>No order emails yet. Fetch from Gmail or paste one.</p>}
            {list.data && emails.length > 0 && shown.length === 0 && (
              <p className={s.empty}>{terms.length ? `No emails match "${query.trim()}" in ${FOLDERS.find((f) => f.key === folder)!.label}.` : 'No emails here.'}</p>
            )}
            {shown.map((e) => (
              <button key={e.id} type="button" aria-label={`Open email ${e.id}`} aria-pressed={pane === 'email' && e.id === selected}
                className={`${s.item} ${fresh.has(e.id) ? s.fresh : ''} ${e.status === 'RECEIVED' || e.status === 'AWAITING_APPROVAL' ? s.unread : ''}`}
                onClick={() => open(e.id)}>
                <span className={`${s.avatar} ${e.priority ? s.avatarPriority : ''}`}>{initials(e)}<span className={s.num}>{e.id}</span></span>
                <span className={s.itemBody}>
                  <span className={s.itemTop}><span className={s.sender}>{e.from}</span><time>{timeOf(e.receivedAt)}</time></span>
                  <span className={s.subject}>{e.subject}</span>
                  <span className={s.tags}>
                    {e.priority && <span className={s.priority} title="Tier 1 or at-risk client: handled first"><Icon size={11}>{ICON.bolt}</Icon>Priority</span>}
                    {e.inReplyTo && <span className={s.replyOf}><Icon size={11}>{ICON.reply}</Icon>reply to {e.inReplyTo}</span>}
                    <DecisionPill decision={e.decision} />
                    <span className={`${s.state} ${STATUS_DOT[e.status] ?? ''}`}><i />{STATUS[e.status] ?? e.status}</span>
                  </span>
                </span>
              </button>
            ))}
          </div>
          {notes.length > 0 && (
            <div className={s.log} role="status">
              {notes.map((n) => (
                <p key={n.id} className={n.tone === 'ok' ? s.logOk : n.tone === 'bad' ? s.logBad : undefined}>
                  <Icon size={13}>{n.tone === 'bad' ? ICON.alert : n.tone === 'ok' ? ICON.check : ICON.info}</Icon>{n.text}
                </p>
              ))}
            </div>
          )}
        </section>

        <section className={s.read} ref={readRef} aria-label="Reading pane">
          {pane === 'paste' ? (
            <div className={s.pane} key="paste">
              <div className={s.bar}>
                <b className={s.barTitle}>New email</b>
                <button type="button" className={s.iconButton} aria-label="Close" onClick={() => setPane('email')}><Icon>{ICON.x}</Icon></button>
              </div>
              <div className={s.pasteForm}>
                <h3>{replyTo ? `Paste the client's reply to email ${replyTo}` : 'Paste an email'} <span>(synthetic only)</span></h3>
                <label className={s.field}><span>From</span>
                  <input className={s.mono} value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} /></label>
                <label className={s.field}><span>Subject</span>
                  <input value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} /></label>
                <label className={`${s.field} ${s.fieldShort}`}><span>Received at</span>
                  <input className={s.mono} value={draft.receivedAt} onChange={(e) => setDraft({ ...draft, receivedAt: e.target.value })} /></label>
                <textarea className={s.textarea} aria-label="Body" placeholder="Paste the email body here" value={draft.body}
                  onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
                <div className={s.pasteFoot}>
                  <button type="button" className={`${s.btn} ${s.btnNavy}`} onClick={submit} disabled={disabled || !draft.body.trim()}>
                    <Icon size={13}>{ICON.wand}</Icon>Process email
                  </button>
                  <span>{replyTo ? `This will be linked as the reply to email ${replyTo}.` : 'Select an email waiting for an address to paste the client\'s reply to it.'}</span>
                </div>
              </div>
            </div>
          ) : (
            <>
              <Status loading={Boolean(selected) && detail.loading && !d} error={detail.error} />
              {!selected && list.data && <p className={s.empty}>Select an email to read it.</p>}
              {d && (
                <div className={s.pane} key={d.email.id}>
                  <div className={s.bar}>
                    <div className={s.seg} role="group" aria-label="View">
                      <button type="button" aria-pressed={view === 'email'} onClick={() => setView('email')}><Icon size={13}>{ICON.mail}</Icon>Email</button>
                      <button type="button" aria-pressed={view === 'ai'} onClick={() => setView('ai')}><Icon size={13}>{ICON.mask}</Icon>What the AI saw</button>
                    </div>
                  </div>
                  <div className={s.scroll}>
                    <h2 className={s.readSubject}>Email {d.email.id} · {d.email.subject}</h2>
                    <div className={s.fromRow}>
                      <span className={`${s.avatar} ${s.avatarLg} ${emails.find((e) => e.id === d.email.id)?.priority ? s.avatarPriority : ''}`}>
                        {initials({ clientId: emails.find((e) => e.id === d.email.id)?.clientId ?? null, from: d.email.from })}
                      </span>
                      <div>
                        <p className={s.who}><b className={s.mono}>{d.email.from}</b> <span>{d.email.inReplyTo ? `reply to email ${d.email.inReplyTo}` : 'to orders desk'}</span></p>
                      </div>
                      <time>{stamp(d.email.receivedAt)}</time>
                    </div>
                    {status === 'WAITING' && (
                      <p className={s.waiting}><span className={s.spinSlow}><Icon size={14}>{ICON.rotate}</Icon></span>
                        Email {d.email.id} is waiting: the AI services did not answer. Process it again shortly.</p>
                    )}
                    {view === 'email' ? (
                      <div className={s.body} key="email">{d.email.body}</div>
                    ) : (
                      <div className={s.body} key="ai">
                        {d.email.redactedBody ? <>
                          <span className={s.note}><Icon size={12}>{ICON.shield}</Icon>Names, phones and emails removed before the AI read it</span>
                          <Redacted text={d.email.redactedBody} />
                        </> : <em className={s.muted}>Not sent to the AI yet.</em>}
                      </div>
                    )}
                    <Checks d={d} />
                  </div>
                  {d.replyDraft && (
                    <div className={s.composer}>
                      <div className={s.composerHead}>
                        <span className={s.spark}><Icon size={16}>{d.replySource === 'model' ? ICON.wand : ICON.file}</Icon></span>
                        <b>Reply draft</b><span>({d.replySource === 'model' ? 'written by AI from the checked facts' : 'template'})</span>
                        <span className={s.to}>To: {d.email.from}</span>
                      </div>
                      <textarea className={s.draft} aria-label="Reply" value={reply} onChange={(e) => setReply(e.target.value)}
                        readOnly={status === 'SENT'} rows={Math.min(12, Math.max(4, reply.split('\n').length + 1))} />
                      <div className={s.composerFoot}>
                        <div className={s.buttons}>
                          {waitingOnClient ? (
                            <button type="button" className={s.btn} onClick={() => pasteFor(d.email.id)}><Icon size={13}>{ICON.clipboard}</Icon>Paste client&apos;s reply</button>
                          ) : <>
                            {status === 'AWAITING_APPROVAL' && (
                              <button type="button" className={`${s.btn} ${s.btnOrange}`} onClick={() => act('approve')} disabled={disabled}><Icon size={13}>{ICON.check}</Icon>Approve</button>
                            )}
                            {status !== 'SENT' && (
                              <button type="button" className={`${s.btn} ${s.btnNavy}`} onClick={() => act('send_reply')}
                                disabled={disabled || !reply.trim() || !(status === 'APPROVED' || status === 'ENTERED')}><Icon size={13}>{ICON.send}</Icon>Send reply</button>
                            )}
                            {d.decision === 'ALL_CLEAR' && status !== 'ENTERED' && (
                              <button type="button" className={`${s.btn} ${s.btnGreen}`} onClick={() => act('send_to_wms')}
                                disabled={disabled || !(status === 'APPROVED' || status === 'SENT')}><Icon size={13}>{ICON.warehouse}</Icon>Send to WMS</button>
                            )}
                          </>}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      </section>
    </>
  );
}

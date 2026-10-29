'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useCan } from '@/components/auth/UserContext';
import { Status } from '@/components/dashboard/ui';
import { useApi } from '@/hooks/useApi';
import { SESSION_ENDED, SessionExpired, postJSON, signInAgain } from '@/lib/api';
import s from './intake.module.css';

export type Decision = 'ALL_CLEAR' | 'CONFIRM_ADDRESS' | 'MISSING_INFO';
interface Item { sku: string; qty: number }
export interface EmailItem {
  id: number; source: string; from: string; subject: string; receivedAt: string; clientId: string | null; status: string;
  decision: Decision | null; inReplyTo: number | null; priority: boolean;
  /** Client facts from clients.csv, the parsed items and the first lines of the body (older APIs leave them out). */
  clientName?: string | null; tier?: string | null; items?: Item[] | null; preview?: string;
}
/** lastPoll: the API's last Gmail check, scheduled or by hand. */
interface Inbox { emails: EmailItem[]; lastPoll?: { startedAt: string; finishedAt: string | null; ok: boolean | null } | null }
interface PollResult { processed: number; retried: number; ok: boolean }
interface Address { line1: string; line2: string | null; city: string; state: string; zip: string }
export interface Detail {
  email: { id: number; from: string; subject: string; body: string; redactedBody: string | null; receivedAt: string; status: string; inReplyTo: number | null };
  decision: Decision | null; replyDraft: string | null; replySource: 'model' | 'template' | null;
  extraction: { items: Item[] } | null;
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
  fetch: <><path d="M21 12a9 9 0 1 1-2.6-6.4" /><path d="M21 4v5h-5" /></>,
  inbox: <><path d="M3 13h5l1.5 3h5L16 13h5" /><path d="M5 5h14l2 8v6H3v-6l2-8Z" /></>,
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />,
  hourglass: <><path d="M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9s10 4 10 9" /></>,
  reply: <><path d="M10 8 4 13l6 5" /><path d="M4 13h10a6 6 0 0 1 6 6" /></>,
  warehouse: <><path d="M3 21V8l9-5 9 5v13" /><path d="M7 21v-8h10v8M7 17h10" /></>,
  clipboard: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4h6v3H9z" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.4-4.4" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  checkCircle: <><circle cx="12" cy="12" r="9" /><path d="m8 12.5 2.8 2.8L16.5 9.5" /></>,
  circle: <circle cx="12" cy="12" r="9" />,
  pin: <><path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11Z" /><circle cx="12" cy="10" r="2.5" /></>,
  alert: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5h.01" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  wand: <><path d="m4 20 11-11M13 7l2-2 4 4-2 2" /><path d="M6 3v3M4.5 4.5h3M19 14v3M17.5 15.5h3" /></>,
  send: <><path d="M21 3 3 10.5l7 2.5 2.5 7L21 3Z" /><path d="m10 13 4.5-4.5" /></>,
  rotate: <><path d="M20 12a8 8 0 1 1-2.3-5.7" /><path d="M20 4v5h-5" /></>,
  down: <path d="m6 9 6 6 6-6" />,
  back: <path d="M19 12H5m6-6-6 6 6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
};

const DECISION: Record<Decision, string> = { ALL_CLEAR: 'All clear', CONFIRM_ADDRESS: 'Confirm address', MISSING_INFO: 'Missing info' };
const STATUS: Record<string, string> = {
  RECEIVED: 'Received', WAITING: 'Waiting for AI services', AWAITING_APPROVAL: 'Awaiting approval', APPROVED: 'Approved',
  SENT: 'Reply sent', ENTERED: 'In WMS',
};
/** What the reply template is for, by decision. */
const TEMPLATE: Record<Decision, string> = { ALL_CLEAR: 'Order confirmed', CONFIRM_ADDRESS: 'Confirm address', MISSING_INFO: 'Ask for missing info' };
/** The send button for a reply that asks the client for something: the order itself cannot be approved yet. */
const REQUEST: Record<Exclude<Decision, 'ALL_CLEAR'>, string> = { CONFIRM_ADDRESS: 'Request address', MISSING_INFO: 'Request details' };
const FIELD: Record<string, string> = { 'address.line1': 'street address', 'address.city': 'city', 'address.state': 'state', 'address.zip': 'ZIP code' };
const ISSUE: Record<string, string> = {
  street_not_found: 'street not found on the map', zip_mismatch: 'ZIP code does not match the city', state_mismatch: 'state does not match the city',
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };
/** "2026-10-21 07:42" -> "21 Oct 2026, 07:42". */
const stamp = (at: string) => { const [date, time] = at.split(' '); return time ? `${day(date)}, ${time}` : at; };
const timeOf = (at: string) => at.split(' ')[1] ?? at;
const ACTION_DONE: Record<string, string> = { approve: 'Approved', send_reply: 'Reply sent', send_to_wms: 'Sent to WMS' };
/** A time of day as "09:14 am". */
const clock = (t: Date) => `${String(t.getHours() % 12 || 12).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')} ${t.getHours() < 12 ? 'am' : 'pm'}`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
/** "[SYNTHETIC] Re: Demo order" -> "Re: Demo order"; the Synthetic badge says the rest. */
const bare = (subject: string) => subject.replace(/^\s*\[SYNTHETIC\]\s*/i, '');
const synthetic = (e: { subject: string }) => /\[SYNTHETIC\]/i.test(e.subject);
const clientOf = (e: EmailItem) => e.clientName ?? (e.clientId ? `Client ${e.clientId.replace(/^C/, '')}` : e.from);
/** The name under the sign-off ("Thanks,\nSam Kowalski"), else the mailbox name. */
function signer(body: string | undefined, from: string): string {
  const lines = (body ?? '').split('\n').map((l) => l.trim());
  const i = lines.findIndex((l) => /^(thanks|thank you|regards|best|best regards|kind regards|cheers)[,!.]?$/i.test(l));
  const name = i >= 0 ? lines.slice(i + 1).find(Boolean) : undefined;
  return name && !name.startsWith('--') && name.length < 40 ? name : from.split('@')[0];
}
const initials = (name: string) => name.split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const units = (items: Item[]) => items.reduce((n, i) => n + i.qty, 0);

/** Lines like "-- SYNTHETIC demo email, not a real order --" become a footnote under the message. */
function splitBody(body: string) {
  const notes: string[] = [];
  const text = body.split('\n').filter((l) => {
    const m = l.trim().match(/^--\s*(.+?)\s*--$/);
    if (m) { const t = m[1].toLowerCase(); notes.push(t.charAt(0).toUpperCase() + t.slice(1)); }
    return !m;
  }).join('\n').trim();
  return { text, notes };
}

/** The message text with the ship-to address (street to ZIP) marked, as extracted to the order summary. */
function Body({ text, address }: { text: string; address: Address | null }) {
  const at = address ? text.indexOf(address.line1) : -1;
  if (!address || at < 0) return <div className={s.body}>{text}</div>;
  const zip = text.indexOf(address.zip, at);
  const lineEnd = text.indexOf('\n', at);
  const end = zip >= 0 && zip - at < 120 ? zip + address.zip.length : lineEnd < 0 ? text.length : lineEnd;
  return (
    <>
      <div className={s.body}>{text.slice(0, at)}<mark className={s.mark}>{text.slice(at, end)}</mark>{text.slice(end)}</div>
      <p className={s.extracted}><Icon size={12}>{ICON.pin}</Icon>Ship-to address extracted to the order summary</p>
    </>
  );
}

type Folder = 'inbox' | 'priority' | 'approval' | 'client' | 'wms';
/** A conversation: the order and the replies linked to it, oldest first. */
interface Thread { id: number; emails: EmailItem[]; latest: EmailItem }

const waitingOnClient = (e: EmailItem) => e.status === 'SENT' && e.decision !== null && e.decision !== 'ALL_CLEAR';
const needsAction = (e: EmailItem) => e.status === 'AWAITING_APPROVAL' || e.status === 'APPROVED' || e.status === 'WAITING'
  || (e.status === 'SENT' && e.decision === 'ALL_CLEAR');

const FOLDERS: { key: Folder; label: string; icon: ReactNode; match: (e: EmailItem) => boolean }[] = [
  { key: 'inbox', label: 'Inbox', icon: ICON.inbox, match: () => true },
  { key: 'priority', label: 'Priority', icon: ICON.bolt, match: (e) => e.priority },
  { key: 'approval', label: 'Awaiting approval', icon: ICON.hourglass, match: (e) => e.status === 'AWAITING_APPROVAL' },
  { key: 'client', label: 'Waiting on client', icon: ICON.reply, match: waitingOnClient },
  { key: 'wms', label: 'In WMS', icon: ICON.warehouse, match: (e) => e.status === 'ENTERED' },
];

/** Groups emails into threads by their reply links, keeping the inbox order (priority clients first). */
function toThreads(emails: EmailItem[]): Thread[] {
  const byId = new Map(emails.map((e) => [e.id, e]));
  const rootOf = (e: EmailItem) => {
    let r = e;
    for (let hops = 0; r.inReplyTo && byId.has(r.inReplyTo) && hops < 50; hops++) r = byId.get(r.inReplyTo)!;
    return r.id;
  };
  const groups = new Map<number, EmailItem[]>();
  for (const e of emails) { const id = rootOf(e); groups.set(id, [...(groups.get(id) ?? []), e]); }
  return [...groups].map(([id, list]) => {
    const sorted = [...list].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt) || a.id - b.id);
    return { id, emails: sorted, latest: sorted[sorted.length - 1] };
  });
}

/** The thread's state in a few words, for its chip in the list. */
function chip(e: EmailItem): { text: string; tone: string } {
  if (e.status === 'WAITING') return { text: 'Waiting for AI', tone: s.tNeutral };
  if (e.status === 'ENTERED') return { text: 'In WMS', tone: s.tGood };
  if (waitingOnClient(e)) return { text: 'Waiting on client', tone: s.tNeutral };
  if (e.status === 'SENT') return { text: 'Ready for WMS', tone: s.tAccent };
  if (e.status === 'APPROVED') return e.decision === 'ALL_CLEAR' ? { text: 'Approved, reply to send', tone: s.tAccent } : { text: 'Request to send', tone: s.tWarn };
  if (e.decision === 'ALL_CLEAR') return { text: 'Ready for approval', tone: s.tAccent };
  if (e.decision === 'CONFIRM_ADDRESS') return { text: 'Confirm address', tone: s.tWarn };
  if (e.decision === 'MISSING_INFO') return { text: 'Missing info', tone: s.tBad };
  return { text: STATUS[e.status] ?? e.status, tone: s.tNeutral };
}

/** A fixed message per known refusal: the server's text can carry config names or internals. */
function refusal(e: unknown): string {
  const m = e instanceof Error ? e.message : '';
  if (m.includes('allow-list')) return 'Not sent: this address is not on the test allow-list.';
  if (m.includes('Gmail is not set up')) return 'Not sent: Gmail is not connected yet.';
  if (m.includes('check is running')) return 'A Gmail check is already running. Try again in a minute.';
  if (m === 'forbidden') return 'Your role cannot do this.';
  return 'Could not do that. Refresh and try again.';
}

type Step = 'done' | 'current' | 'pending' | 'warn' | 'todo';
const STEP_ICON: Record<Step, ReactNode> = { done: <Icon size={10}>{ICON.check}</Icon>, current: null, pending: <Icon size={12}>{ICON.clock}</Icon>,
  warn: '!', todo: null };

/** The approval stage, named by where the email is: an all-clear order waits for approval; any other waits on the client. */
function approval(d: Detail, st: string): [string, Step] {
  if (d.decision === 'ALL_CLEAR') {
    return ['APPROVED', 'SENT', 'ENTERED'].includes(st) ? ['Approved', 'done'] : ['Approve', st === 'AWAITING_APPROVAL' ? 'current' : 'todo'];
  }
  if (!d.decision) return ['Approve', 'todo'];
  if (st === 'SENT' || st === 'ENTERED') return ['Waiting on client', 'pending'];
  return [d.decision === 'CONFIRM_ADDRESS' ? 'Pending address' : 'Pending details', 'pending'];
}

function Stepper({ d }: { d: Detail }) {
  const st = d.email.status;
  const a = d.checks?.address?.status;
  const after = (...states: string[]) => states.includes(st);
  const steps: [string, Step][] = [
    ['Received', 'done'],
    ['Parsed', d.extraction?.items.length ? 'done' : st === 'WAITING' ? 'current' : 'warn'],
    ['Address complete', a === 'complete' || a === 'matched' ? 'done' : a ? 'warn' : 'todo'],
    approval(d, st),
    // Highlighted only once an all-clear order is approved and its reply is the next thing to go.
    ['Reply sent', after('SENT', 'ENTERED') ? 'done' : st === 'APPROVED' && d.decision === 'ALL_CLEAR' ? 'current' : 'todo'],
    ['In WMS', st === 'ENTERED' ? 'done' : st === 'SENT' && d.decision === 'ALL_CLEAR' ? 'current' : 'todo'],
  ];
  return (
    <ol className={s.steps} aria-label="Order progress">
      {steps.map(([label, state]) => (
        <li key={label} className={s[`step_${state}`]} aria-current={state === 'current' || state === 'pending' ? 'step' : undefined}>
          <i aria-hidden="true">{STEP_ICON[state]}</i>{label}
        </li>
      ))}
    </ol>
  );
}

/** An earlier email in the thread: folded to one line, so only the latest email is open; its header opens it (text fetched on open). */
function Earlier({ e }: { e: EmailItem }) {
  const [open, setOpen] = useState(false);
  const fetched = useApi<Detail>(open ? `/api/intake/${e.id}` : null);
  const d = fetched.data;
  const name = signer(d?.email.body, e.from);
  return (
    <section className={`${s.card} ${s.earlier}`} data-open={open || undefined}>
      <button type="button" className={s.earlierHead} aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className={s.avatar}>{initials(name)}</span>
        <b>{name}</b>
        <span className={s.earlierSum}>Email {e.id} · {e.preview ?? bare(e.subject)}</span>
        <time>{timeOf(e.receivedAt)}</time>
        <span className={s.chev}><Icon size={12}>{ICON.down}</Icon></span>
      </button>
      {open && (
        <div className={s.earlierBody}>
          <Status loading={!d && fetched.loading} error={fetched.error} />
          {d && <div className={s.body}>{splitBody(d.email.body).text}</div>}
        </div>
      )}
    </section>
  );
}

function ShipTo({ d }: { d: Detail }) {
  const a = d.checks?.address;
  if (!a) return <p className={s.muted}>Not read yet.</p>;
  if (a.status === 'incomplete' || !a.address) {
    return <p className={s.badText}><Icon size={12}>{ICON.alert}</Icon>Missing: {a.missing.map((m) => FIELD[m] ?? m).join(', ') || 'address'}</p>;
  }
  const v = a.validation;
  const ad = a.address;
  return (
    <>
      <div className={s.addr}>
        <Icon size={13}>{ICON.pin}</Icon>
        <address>{ad.line1}{ad.line2 ? `, ${ad.line2}` : ''}<br />{ad.city}, {ad.state} {ad.zip}</address>
      </div>
      {a.status === 'unverified' && (
        <p className={s.warnText}>
          <Icon size={12}>{ICON.alert}</Icon>{v?.issues.map((i) => ISSUE[i] ?? i).join('; ') || 'Not confirmed on the map'}
          {v?.suggestion && <> (map shows {v.suggestion.zip})</>}
        </p>
      )}
      <p className={s.source}>
        From email {d.email.id}{d.email.inReplyTo ? `, completes the address missing in ${d.email.inReplyTo}` : ''}
        {a.status === 'matched' ? ' · saved address' : v && v.confidence !== 'unavailable' ? ` · map: ${v.confidence} confidence` : ''}
      </p>
    </>
  );
}

function Summary({ d, e }: { d: Detail; e: EmailItem | undefined }) {
  const items = d.extraction?.items ?? [];
  const c = d.checks;
  return (
    <section className={`${s.card} ${s.summary}`} aria-label="Order summary">
      <header className={s.cardHead}>
        <h3>Order summary</h3>
        {items.length ? <span className={`${s.chip} ${s.tGood}`}><Icon size={10}>{ICON.check}</Icon>Parsed</span>
          : <span className={`${s.chip} ${s.tBad}`}>Not read</span>}
      </header>
      <div className={s.block}>
        <p className={s.label}>Items</p>
        {items.length ? (
          <table className={s.items}>
            <thead><tr><th scope="col">SKU</th><th scope="col">Qty</th></tr></thead>
            <tbody>{items.map((i) => <tr key={i.sku}><td>{i.sku}</td><td>{i.qty}</td></tr>)}</tbody>
            <tfoot><tr><th scope="row">Total</th><td>{plural(units(items), 'unit')}</td></tr></tfoot>
          </table>
        ) : <p className={s.muted}>No items read from this email.</p>}
      </div>
      <div className={s.block}>
        <p className={s.label}>Ship to</p>
        <ShipTo d={d} />
      </div>
      <dl className={`${s.block} ${s.facts}`}>
        <div><dt>Client</dt><dd>{e ? clientOf(e) : '—'}{e?.tier && <> · {e.tier}</>}</dd></div>
        <div><dt>Promise date</dt><dd>{c?.promise ? <b>{day(c.promise.promiseDate)}</b> : '—'}</dd>
          {c?.promise?.reason && <dd className={s.reason}>{c.promise.reason}</dd>}</div>
        <div><dt>Warehouse</dt><dd>{c?.warehouse?.warehouseId ?? <span className={s.muted}>Not chosen</span>}</dd>
          {c?.warehouse && <dd className={s.reason}>{c.warehouse.reason}</dd>}</div>
        <div><dt>Carrier</dt><dd>{c?.carrier?.carrier ?? <span className={s.muted}>Not chosen</span>}</dd>
          {c?.carrier && <dd className={s.reason}>{c.carrier.reason}</dd>}</div>
      </dl>
    </section>
  );
}

function Readiness({ d }: { d: Detail }) {
  const st = d.email.status;
  const a = d.checks?.address?.status;
  const approved = ['APPROVED', 'SENT', 'ENTERED'].includes(st);
  const rows: { label: string; state: 'ok' | 'pending' | 'bad' | 'todo'; value: string }[] = [
    { label: 'Items and quantities parsed', state: d.extraction?.items.length ? 'ok' : 'bad', value: d.extraction?.items.length ? 'Done' : 'Not read' },
    { label: 'Ship-to address complete', state: a === 'complete' || a === 'matched' ? 'ok' : a === 'unverified' ? 'pending' : 'bad',
      value: a === 'complete' || a === 'matched' ? 'Done' : a === 'unverified' ? 'Check' : a ? 'Missing' : 'Not read' },
    d.decision === 'ALL_CLEAR'
      ? { label: 'Approval', state: approved ? 'ok' : st === 'AWAITING_APPROVAL' ? 'pending' : 'todo', value: approved ? 'Done' : st === 'AWAITING_APPROVAL' ? 'Pending' : '—' }
      : { label: 'Approval', state: 'todo', value: 'Needs full details' },
    { label: 'WMS push', state: st === 'ENTERED' ? 'ok' : 'todo',
      value: st === 'ENTERED' ? 'Done' : d.decision === 'ALL_CLEAR' ? 'After send' : 'Needs all clear' },
  ];
  const icon = { ok: ICON.checkCircle, pending: ICON.clock, bad: ICON.alert, todo: ICON.circle };
  return (
    <section className={`${s.card} ${s.ready}`} aria-label="Readiness">
      <h3>Readiness</h3>
      <ul>
        {rows.map((r) => (
          <li key={r.label} className={s[`r_${r.state}`]}><Icon size={13}>{icon[r.state]}</Icon><span>{r.label}</span><b>{r.value}</b></li>
        ))}
      </ul>
    </section>
  );
}

interface Note { id: number; text: string; tone: 'info' | 'ok' | 'bad' }
const DRAFT_KEY = (id: number) => `rr.intake.draft.${id}`;
const readDraft = (id: number) => { try { return localStorage.getItem(DRAFT_KEY(id)); } catch { return null; } };
const writeDraft = (id: number, text: string | null) => {
  try { if (text === null) localStorage.removeItem(DRAFT_KEY(id)); else localStorage.setItem(DRAFT_KEY(id), text); } catch { /* storage blocked */ }
};
/** The emails this browser has opened, so unread ones stay bold in the list. */
const READ_KEY = 'rr.intake.read';
const loadRead = (): number[] => { try { return JSON.parse(localStorage.getItem(READ_KEY) ?? '[]'); } catch { return []; } };
const saveRead = (ids: Set<number>) => { try { localStorage.setItem(READ_KEY, JSON.stringify([...ids])); } catch { /* storage blocked */ } };

export function IntakeScreen() {
  const list = useApi<Inbox>('/api/intake');
  const [selected, setSelected] = useState<number | null>(null);
  const [pane, setPane] = useState<'email' | 'paste'>('email');
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [folder, setFolder] = useState<Folder>('inbox');
  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState(false);
  const [push, setPush] = useState(true);
  const [read, setRead] = useState<Set<number>>(new Set());
  const detail = useApi<Detail>(selected ? `/api/intake/${selected}` : null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [busy, setBusy] = useState<'fetch' | 'act' | null>(null);
  const [draft, setDraft] = useState({ from: 'orders@client190.example', subject: '[SYNTHETIC] Order', receivedAt: '2026-10-21 08:05', body: '' });
  // Phones show one screen at a time, as the Gmail app does: the list, or the open thread slid in over it.
  const [phone, setPhone] = useState(false);
  const [view, setView] = useState<'list' | 'thread'>('list');
  // REQ-AUTH-11: set when an action found the session ended; holds the sign-in link back to this email.
  const [expired, setExpired] = useState<string | null>(null);
  // REQ-AUTH-10: controls follow the signed-in roles (SPEC-auth §4.3); the API refuses anyway.
  const canFetch = useCan('fetch');
  const canPaste = useCan('paste');
  const canReply = useCan('send_reply');
  const canWms = useCan('send_to_wms');
  const searchRef = useRef<HTMLInputElement>(null);
  const seen = useRef<Set<number> | null>(null);
  const d = detail.data && detail.data.email.id === selected ? detail.data : undefined;
  const emails = list.data?.emails ?? [];
  const threads = toThreads(emails);
  // The reply the operator edits in place: a saved draft or the AI's draft until they type, kept per email.
  const [edit, setEdit] = useState<{ id: number; text: string } | null>(null);
  const reply = d && edit?.id === d.email.id ? edit.text : d?.replyDraft ?? '';
  const setReply = (text: string) => d && setEdit({ id: d.email.id, text });
  const dId = d?.email.id;
  useEffect(() => {
    if (dId === undefined) return;
    const saved = readDraft(dId);
    if (saved !== null) setEdit({ id: dId, text: saved });
  }, [dId]);

  // Back from sign-in (REQ-AUTH-11): /dashboard/intake?email=<id> reopens that email, with its kept draft.
  useEffect(() => {
    const id = Number(new URLSearchParams(window.location.search).get('email'));
    if (Number.isInteger(id) && id > 0) { setSelected(id); setView('thread'); }
  }, []);

  // Open the first thread once the inbox loads, as a mail client does.
  useEffect(() => {
    if (selected === null && threads.length) setSelected(threads[0].latest.id);
  }, [threads, selected]);

  // Read marks live in this browser; loaded after mount so the server render matches.
  useEffect(() => { const saved = loadRead(); if (saved.length) setRead((r) => new Set([...r, ...saved])); }, []);
  const markRead = (ids: number[], value: boolean) => setRead((r) => {
    const next = new Set(r);
    for (const id of ids) if (value) next.add(id); else next.delete(id);
    saveRead(next);
    return next;
  });

  useEffect(() => {
    const m = window.matchMedia?.('(max-width: 760px)');
    if (!m) return;
    const sync = () => setPhone(m.matches);
    sync();
    m.addEventListener?.('change', sync);
    return () => m.removeEventListener?.('change', sync);
  }, []);

  // ⌘K / Ctrl+K jumps to the search box.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Threads that arrive after the first load slide in, highlighted.
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
      if (e instanceof SessionExpired) {
        // Keep the typed reply for this email; nothing is resent until the operator clicks again after signing in.
        if (selected !== null && pane === 'email') writeDraft(selected, reply);
        setExpired(signInAgain(selected !== null ? `/dashboard/intake?email=${selected}` : '/dashboard/intake'));
        return;
      }
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
    setMenu(false);
    setView('thread');
  };
  const back = () => { setView('list'); setMenu(false); };

  // No `user`: the API takes the actor from the signed-in session (REQ-AUTH-07).
  const post = (id: number, action: 'approve' | 'send_reply' | 'send_to_wms') => postJSON<{ status: string }>(`/api/intake/${id}/action`,
    { action, ...(action === 'send_reply' ? { reply: reply.trim() } : {}) });

  /** Runs the actions in order; a refusal stops the rest, and the screen then shows the step that is left. */
  const act = (actions: ('approve' | 'send_reply' | 'send_to_wms')[]) => {
    if (selected === null) return;
    const id = selected;
    run('act', async () => {
      for (const a of actions) await post(id, a);
      if (actions.includes('send_reply')) writeDraft(id, null);
      return `Email ${id}: ${actions.map((a) => ACTION_DONE[a]).join(', ')}.`;
    });
  };

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

  const pasteFor = (id: number | null) => { setReplyTo(id); setPane('paste'); setMenu(false); setView('thread'); };

  // Search matches everything a row shows: number, sender, client, subject, decision, status, priority.
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = (e: EmailItem) => [e.id, e.from, e.clientId, e.clientName, e.tier, e.subject, e.preview, e.decision && DECISION[e.decision],
    STATUS[e.status] ?? e.status, chip(e).text, e.priority && 'priority', e.inReplyTo && `reply to ${e.inReplyTo}`,
    ...(e.items ?? []).map((i) => i.sku)].filter(Boolean).join(' ').toLowerCase();
  const poll = list.data?.lastPoll;
  const folderDef = FOLDERS.find((f) => f.key === folder)!;
  const inFolder = threads.filter((t) => folderDef.match(t.latest));
  const searched = inFolder.filter((t) => terms.every((q) => t.emails.some((e) => haystack(e).includes(q))));
  const shown = searched;
  const thread = threads.find((t) => t.emails.some((e) => e.id === selected));
  const current = thread?.emails.find((e) => e.id === selected);
  // Opening a thread marks all its emails read; "Mark as unread" undoes it until the thread is opened again.
  const threadIds = thread?.emails.map((e) => e.id).join(',');
  useEffect(() => {
    if (threadIds) markRead(threadIds.split(',').map(Number), true);
  }, [selected, threadIds]); // eslint-disable-line react-hooks/exhaustive-deps
  const others = shown.filter((t) => t !== thread && needsAction(t.latest)).length;
  const status = d?.email.status;
  const disabled = busy !== null;
  const allClear = d?.decision === 'ALL_CLEAR';

  // The one next step for this email, as the composer's main button.
  // An incomplete order is never approved: its button sends the request (the API still logs the operator's OK on the reply first).
  // Roles decide which steps the button may take (SPEC-auth §4.2): WMS entry is the supervisor's (Q-AUTH-03).
  const request = d?.decision && d.decision !== 'ALL_CLEAR' ? REQUEST[d.decision] : null;
  const wmsAfter = allClear && push && canWms;
  const primary = !d ? null
    : canReply && status === 'AWAITING_APPROVAL' ? { label: request ?? 'Approve & send', run: () => act(['approve', 'send_reply', ...(wmsAfter ? ['send_to_wms' as const] : [])]) }
      : canReply && status === 'APPROVED' ? { label: request ?? 'Send reply', run: () => act(['send_reply', ...(wmsAfter ? ['send_to_wms' as const] : [])]) }
        : canWms && allClear && (status === 'SENT' || status === 'APPROVED') ? { label: 'Send to WMS', run: () => act(['send_to_wms']) }
          : null;
  const onDraftKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && primary && !disabled && reply.trim()) { e.preventDefault(); primary.run(); }
  };

  return (
    <>
      <h1 className={s.srOnly}>Order emails</h1>
      <section className={s.app} data-view={view}>
        <aside className={s.rail}>
          <p className={s.railHead}>Orders desk</p>
          <nav className={s.folders} aria-label="Mailbox">
            {FOLDERS.map((f) => {
              const n = threads.filter((t) => f.match(t.latest)).length;
              return (
                <button key={f.key} type="button" className={s.folder} aria-pressed={pane === 'email' && folder === f.key}
                  onClick={() => { setFolder(f.key); setPane('email'); }}>
                  <Icon size={14}>{f.icon}</Icon><span>{f.label}</span>{n > 0 && <b>{n}</b>}
                </button>
              );
            })}
          </nav>
          <p className={s.railHead}>Tools</p>
          <div className={s.folders}>
            {canPaste && (
              <button type="button" className={s.folder} aria-pressed={pane === 'paste'} onClick={() => pasteFor(null)}>
                <Icon size={14}>{ICON.clipboard}</Icon><span>Paste an email</span>
              </button>
            )}
          </div>
          <div className={s.synthetic} title="Built on data we generated (SPEC §12.1)">
            <b>Synthetic data</b><span>Generated order emails only. No real orders.</span>
          </div>
        </aside>

        <section className={s.list} aria-label="Threads" inert={phone && view === 'thread'}>
          <div className={s.listHead}>
            <div className={s.listTitle}>
              <div className={s.titleCol}>
                <h2>{folderDef.label}</h2>
                <span>{plural(inFolder.reduce((n, t) => n + t.emails.length, 0), 'email')}</span>
              </div>
              <div className={`${s.titleCol} ${s.syncCol}`}>
                {canFetch && (
                  <button type="button" className={s.sync} aria-label="Sync" onClick={fetchGmail} disabled={disabled}>
                    <span className={busy === 'fetch' ? s.spin : s.iconWrap}><Icon size={13}>{ICON.fetch}</Icon></span>Sync Gmail
                  </button>
                )}
                <span className={s.synced}>
                  <i className={!poll ? s.dotOff : poll.ok === false ? s.dotBad : s.dotOk} aria-hidden="true" />
                  {!poll ? 'Not synced yet' : `${poll.ok === false ? 'Sync failed' : 'Synced'} ${clock(new Date(poll.finishedAt ?? poll.startedAt))}`}
                </span>
              </div>
            </div>
            <label className={s.search}><Icon size={13}>{ICON.search}</Icon>
              <input ref={searchRef} type="search" placeholder="Search emails..." aria-label="Search emails"
                value={query} onChange={(e) => setQuery(e.target.value)} />
              <kbd>⌘K</kbd>
            </label>
          </div>
          <p className={s.hint}>Sorted by priority: Tier 1 and at-risk clients first</p>
          <div className={s.rows}>
            <Status loading={list.loading && !list.data} error={list.error} />
            {list.data && emails.length === 0 && <p className={s.empty}>No order emails yet. Sync or paste one.</p>}
            {emails.length > 0 && shown.length === 0 && (
              <p className={s.empty}>{terms.length ? `No emails match "${query.trim()}" in ${folderDef.label}.` : 'No threads here.'}</p>
            )}
            {shown.map((t) => {
              const e = t.latest;
              const items = [...t.emails].reverse().find((x) => x.items?.length)?.items;
              const c = chip(e);
              const unread = t.emails.some((x) => !read.has(x.id));
              return (
                <button key={t.id} type="button" aria-label={`Open email ${e.id}`} aria-pressed={pane === 'email' && t === thread}
                  data-unread={unread || undefined} className={`${s.row} ${unread ? s.unread : ''} ${t.emails.some((x) => fresh.has(x.id)) ? s.fresh : ''}`}
                  onClick={() => open(e.id)}>
                  {unread && <span className={s.srOnly}>Unread</span>}
                  <span className={s.avatar}>{initials(clientOf(e))}</span>
                  <span className={s.rowMain}>
                    <span className={s.rowTop}>
                      <b className={s.client}>{clientOf(e)}</b>
                      {(e.tier || e.priority) && (
                        <span className={s.tier} title={e.priority ? 'Tier 1 or at-risk client: handled first' : undefined}>{e.tier ?? 'Priority'}</span>
                      )}
                      <time>{timeOf(e.receivedAt)}</time>
                    </span>
                    <span className={s.rowSubject}><span>{bare(e.subject)}</span>{t.emails.length > 1 && <i>{t.emails.length}</i>}</span>
                    {e.preview && <span className={s.preview}>{e.preview}</span>}
                    <span className={s.chips}>
                      <span className={`${s.chip} ${c.tone}`} title={e.decision === 'ALL_CLEAR' ? 'All clear' : undefined}>{c.text}</span>
                      {items && <span className={`${s.chip} ${s.tNeutral}`}>{plural(units(items), 'unit')} · {plural(items.length, 'SKU')}</span>}
                    </span>
                  </span>
                </button>
              );
            })}
            {shown.length > 0 && others === 0 && (
              <p className={s.done}><Icon size={17}>{ICON.check}</Icon>No other threads need you</p>
            )}
          </div>
          {canPaste && <button type="button" className={s.fab} onClick={() => pasteFor(null)}><Icon size={16}>{ICON.plus}</Icon>Paste email</button>}
          {(notes.length > 0 || expired) && (
            <div className={s.log} role="status">
              {expired && (
                <p className={s.logBad} role="alert"><Icon size={11}>{ICON.alert}</Icon>{SESSION_ENDED} <a href={expired}>Sign in again</a></p>
              )}
              {notes.map((n) => (
                <p key={n.id} className={n.tone === 'ok' ? s.logOk : n.tone === 'bad' ? s.logBad : undefined}>
                  <Icon size={11}>{n.tone === 'bad' ? ICON.alert : n.tone === 'ok' ? ICON.check : ICON.info}</Icon>{n.text}
                </p>
              ))}
            </div>
          )}
        </section>

        <section className={s.read} aria-label="Thread" inert={phone && view === 'list'}>
          {pane === 'paste' ? (
            <div className={s.pasteWrap} key="paste">
              <div className={s.pasteForm}>
                <div className={s.pasteTop}>
                  <button type="button" className={`${s.iconBtn} ${s.back}`} aria-label="Back to inbox" onClick={back}><Icon size={16}>{ICON.back}</Icon></button>
                  <h3>{replyTo ? `Paste the client's reply to email ${replyTo}` : 'Paste an email'} <span>(synthetic only)</span></h3>
                  <button type="button" className={s.iconBtn} aria-label="Close" onClick={() => { setPane('email'); if (phone) setView('list'); }}><Icon>{ICON.x}</Icon></button>
                </div>
                <label className={s.field}><span>From</span>
                  <input value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} /></label>
                <label className={s.field}><span>Subject</span>
                  <input value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} /></label>
                <label className={`${s.field} ${s.fieldShort}`}><span>Received at</span>
                  <input value={draft.receivedAt} onChange={(e) => setDraft({ ...draft, receivedAt: e.target.value })} /></label>
                <textarea className={s.textarea} aria-label="Body" placeholder="Paste the email body here" value={draft.body}
                  onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
                <div className={s.pasteFoot}>
                  <button type="button" className={`${s.btn} ${s.btnPrimary}`} onClick={submit} disabled={disabled || !draft.body.trim()}>
                    <Icon size={12}>{ICON.wand}</Icon>Process email
                  </button>
                  <span>{replyTo ? `This will be linked as the reply to email ${replyTo}.` : 'Select an email waiting for an address to paste the client\'s reply to it.'}</span>
                </div>
              </div>
            </div>
          ) : (
            <>
              <Status loading={Boolean(selected) && detail.loading && !d} error={detail.error} />
              {!selected && list.data && <p className={s.empty}>Select a thread to read it.</p>}
              {d && thread && (
                <div className={s.pane} key={thread.id}>
                  <header className={s.threadHead}>
                    <div className={s.titleRow}>
                      <button type="button" className={`${s.iconBtn} ${s.back}`} aria-label="Back to inbox" onClick={back}><Icon size={16}>{ICON.back}</Icon></button>
                      <div className={s.titleBox}>
                        <h2>{bare(thread.emails[0].subject)}{synthetic(thread.emails[0]) && <span className={s.synthBadge}>Synthetic</span>}</h2>
                      </div>
                      <div className={s.headBtns}>
                        <div className={s.menuWrap}>
                          <button type="button" className={s.iconBtn} aria-label="More actions" aria-expanded={menu} onClick={() => setMenu(!menu)}>
                            <Icon size={13}>{ICON.more}</Icon></button>
                          {menu && (
                            <div className={s.menu} role="menu">
                              <button type="button" role="menuitem" onClick={() => { markRead(thread.emails.map((e) => e.id), false); setMenu(false); }}>
                                <Icon size={12}>{ICON.mail}</Icon>Mark as unread</button>
                              {canPaste && <>
                                <button type="button" role="menuitem" onClick={() => pasteFor(d.email.id)}><Icon size={12}>{ICON.clipboard}</Icon>Paste client&apos;s reply</button>
                                <button type="button" role="menuitem" onClick={() => pasteFor(null)}><Icon size={12}>{ICON.clipboard}</Icon>Paste a new email</button>
                              </>}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <Stepper d={d} />
                  </header>

                  <div className={s.threadBody}>
                    <div className={s.conversation}>
                      {thread.emails.filter((e) => e.id !== d.email.id).map((e) => <Earlier key={e.id} e={e} />)}
                      <article className={`${s.card} ${s.message}`}>
                        {(() => {
                          const name = signer(d.email.body, d.email.from);
                          const { text, notes: foot } = splitBody(d.email.body);
                          const a = d.checks?.address;
                          return (
                            <>
                              <div className={s.fromRow}>
                                <span className={s.avatar}>{initials(name)}</span>
                                <div className={s.who}>
                                  <b>{name}</b>
                                  <span>{d.email.from} · to Orders desk</span>
                                </div>
                                <div className={s.when}>
                                  <time>{stamp(d.email.receivedAt)}</time>
                                </div>
                              </div>
                              {status === 'WAITING' && (
                                <p className={s.waiting}><span className={s.spinSlow}><Icon size={12}>{ICON.rotate}</Icon></span>
                                  Email {d.email.id} is waiting: the AI services did not answer. Process it again shortly.</p>
                              )}
                              <div className={s.text}>
                                <Body text={text} address={a && a.status !== 'incomplete' ? a.address : null} />
                                {foot.length > 0 && <p className={s.footnote}>{foot.join(' · ')}</p>}
                              </div>
                            </>
                          );
                        })()}
                      </article>

                      {d.replyDraft && (
                        <section className={`${s.card} ${s.composer}`} aria-label="Compose reply">
                          <div className={s.composerHead}>
                            <b>Reply</b><span className={s.to}>to {d.email.from}</span>
                            {d.decision && (
                              <span className={s.template}>
                                <b className={d.decision === 'ALL_CLEAR' ? s.tGood : d.decision === 'CONFIRM_ADDRESS' ? s.tWarn : s.tBad}>{TEMPLATE[d.decision]}</b>
                              </span>
                            )}
                          </div>
                          <textarea className={s.draft} aria-label="Reply" value={reply} onChange={(e) => setReply(e.target.value)} onKeyDown={onDraftKey}
                            readOnly={!canReply || status === 'SENT' || status === 'ENTERED'} rows={Math.min(12, Math.max(5, reply.split('\n').length + 1))} />
                          <div className={s.composerFoot}>
                            {allClear && canReply && canWms && (status === 'AWAITING_APPROVAL' || status === 'APPROVED') && (
                              <label className={s.check}>
                                <input type="checkbox" checked={push} onChange={(e) => setPush(e.target.checked)} />Push to WMS after sending
                              </label>
                            )}
                            {status === 'ENTERED' && <span className={s.doneNote}><Icon size={12}>{ICON.checkCircle}</Icon>Reply sent and order in the WMS</span>}
                            <div className={s.buttons}>
                              {canReply && status !== 'SENT' && status !== 'ENTERED' && (
                                <button type="button" className={s.btn} onClick={() => { writeDraft(d.email.id, reply); say('Draft saved in this browser.', 'info'); }}>
                                  Save draft</button>
                              )}
                              {canPaste && status === 'SENT' && !allClear && (
                                <button type="button" className={s.btn} onClick={() => pasteFor(d.email.id)}><Icon size={12}>{ICON.clipboard}</Icon>Paste client&apos;s reply</button>
                              )}
                              {primary && (
                                <button type="button" className={`${s.btn} ${s.btnPrimary}`} onClick={primary.run}
                                  disabled={disabled || (primary.label !== 'Send to WMS' && !reply.trim())}>
                                  <Icon size={13}>{primary.label === 'Send to WMS' ? ICON.warehouse : ICON.send}</Icon>{primary.label}
                                </button>
                              )}
                            </div>
                          </div>
                        </section>
                      )}
                    </div>

                    <div className={s.side}>
                      <Summary d={d} e={current} />
                      <Readiness d={d} />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </section>
    </>
  );
}

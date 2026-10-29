'use client';

import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { useCanOpen } from '@/components/auth/UserContext';
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

/** Real late deliveries from the supplied data, one per kind of cause (SPEC §5.1), with what made each late. */
const EXAMPLES = [['delivery:D000213', 'incomplete address, slow carrier lane'], ['delivery:D000559', 'ordered after the 08:00 cut-off']] as const;
/** The selector's last choice: type any other delivery ID. */
const OTHER = 'other';
/** Email orders listed in the selector, newest first as the inbox gives them. */
const EMAILS_LISTED = 6;
/** What a user types for another delivery, as an API ref: "D000123", "d123", "123" or "delivery:D000123"; else null. */
function deliveryRef(text: string): string | null {
  const m = /^(?:delivery:)?d?(\d{1,6})$/i.exec(text.trim());
  return m ? `delivery:D${m[1].padStart(6, '0')}` : null;
}
/** "AWAITING_APPROVAL" -> "awaiting approval". */
const words = (status: string) => status.replace(/_/g, ' ').toLowerCase();
/** Shown for an order's stages that have no events yet. */
const FUTURE = 'Stages 10 to 13 show once the simulated warehouse and carrier events are built.';
const COMMITMENT: Record<string, string> = { same_day: 'same day', next_day: 'next day', standard: 'standard' };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const DAY_MS = 86_400_000;

const word = (n: number) => WORDS[n] ?? String(n);
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const plural = (n: number, w: string) => `${word(n)} ${w}${n === 1 ? '' : 's'}`;
/** "a", "a, and b", "a, b, and c". */
const list = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')}, and ${xs.at(-1)}`);
const isReached = (st: Stage) => st.status === 'done' || st.status === 'failed';
const isPending = (st: Stage) => st.status === 'current' || st.status === 'waiting' || st.status === 'at_risk';

interface When { day: number; month: number; year: number; time: string | null }
/** "2026-04-02 09:56", "2026-04-02" or an ISO time, read as UTC so nothing shifts by time zone; anything else is null. */
function when(at: string | null): When | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(at ?? '');
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  return { day: d, month: mo, year: y, time: m[4] ? `${m[4]}:${m[5]}` : null };
}
const dayStart = (w: When) => Date.UTC(w.year, w.month, w.day);
const dayMonth = (w: When) => `${w.day} ${MONTHS[w.month].slice(0, 3)}`;
const stamp = (w: When) => (w.time ? `${dayMonth(w)} ${w.time}` : dayMonth(w));

/* The hub diorama (Carrier clips/Root Route — Order Journey Map – Order journey — hub diorama.html): one isometric board,
   1040 × 780 design units (public/media/journey-diorama.svg), with the seven places an order passes. Each place holds
   the stages done there; `at` is its spot on the road, `lab` its label (% of the board), `lead` the line between them. */
const BOARD_W = 1040;
const BOARD_H = 780;
type HubId = 'client' | 'intake' | 'plan' | 'wh' | 'dock' | 'transit' | 'delivery';
interface Hub { id: HubId; tag: string; title: string; stages: number[];
  at: [number, number]; lab: [number, number]; lead: [number, number, number, number] }
const HUBS: Hub[] = [
  { id: 'client', tag: 'Start', title: 'Client', stages: [8, 14],
    at: [185.3, 252.6], lab: [1.92, 42.56], lead: [126, 257.2, 126, 332] },
  { id: 'intake', tag: '1–3', title: 'Order intake', stages: [1, 2, 3],
    at: [303.7, 321], lab: [28.85, 14.36], lead: [361.3, 251.9, 361.3, 112] },
  { id: 'plan', tag: '4–7', title: 'Planning', stages: [4, 5, 6, 7],
    at: [435.4, 397], lab: [17.88, 60.77], lead: [377.8, 329, 376, 474] },
  { id: 'wh', tag: '9–10', title: 'Warehouse', stages: [9, 10],
    at: [576.9, 478.7], lab: [63.46, 33.59], lead: [637.8, 410.8, 660, 262] },
  { id: 'dock', tag: 'Pickup, 11', title: 'Carrier dock', stages: [11],
    at: [698.6, 549], lab: [41.35, 82.05], lead: [626.2, 565.9, 620, 640] },
  { id: 'transit', tag: '12', title: 'Last mile', stages: [12],
    at: [780.9, 596.5], lab: [67.31, 88.46], lead: [780.9, 596.5, 780.9, 690] },
  { id: 'delivery', tag: '13', title: 'Delivery address', stages: [13],
    at: [869.8, 647.8], lab: [80.77, 53.85], lead: [932.3, 579.3, 932.3, 420] },
];
const hubOf = (n: number) => HUBS.find((h) => h.stages.includes(n)) ?? HUBS[0];
/** Legs from the dock on are the carrier's tracking. */
const FIRST_TRACK_LEG = 4;

/** Lane advice from the carriers rule (carriers/domain.ts reasonFor),
    e.g. "Carrier E for Northeast standard: 96% on time vs 57% for F; $1.63 more per shipment". */
const LANE = /^Carrier (\w+) for [^:]+: (\d+%) on time(?: vs (\d+%) for (\w+); \$([\d.]+) (more|cheaper) per shipment)?/;
interface LaneFix { carrier: string; best: string; worse?: string; from?: string; usd?: string; more: boolean }
function laneFix(text?: string): LaneFix | null {
  const m = text ? LANE.exec(text) : null;
  return m ? { carrier: m[1], best: m[2], worse: m[3], from: m[4], usd: m[5], more: m[6] !== 'cheaper' } : null;
}

/** What the screen reads off a journey's stages. */
interface Facts {
  j: Journey; st: (n: number) => Stage; late: boolean; fix: LaneFix | null;
  /** Stages that went wrong and have a Root Route rule beside them (the route check is not one). */
  fixes: Stage[]; carrier: string | null; warehouse: string | null;
}
function factsOf(j: Journey): Facts {
  const byN = new Map(j.stages.map((x) => [x.n, x]));
  const st = (n: number): Stage => byN.get(n)
    ?? { n, key: '', label: '', status: 'not_reached', at: null, actor: '—', source: 'real', detail: '' };
  return {
    j, st, late: j.kind === 'delivery' && st(13).status === 'failed', fix: laneFix(st(6).withLateLens),
    fixes: j.stages.filter((x) => x.status === 'failed' && x.withLateLens && x.n !== 12),
    carrier: isReached(st(11)) ? st(11).actor : null,
    warehouse: isReached(st(10)) && st(10).actor !== '—' ? st(10).actor : null,
  };
}
const hubReached = (f: Facts, h: Hub) => h.id === 'client' || h.stages.some((n) => isReached(f.st(n)));
const hubTitle = (f: Facts, h: Hub) => (h.id === 'wh' && f.warehouse ? `Warehouse ${f.warehouse}` : h.title);

type Tone = 'bad' | 'good' | '';
const STATUS: Record<StageStatus, string> = { done: 'Done', current: 'In progress', waiting: 'Waiting', at_risk: 'At risk',
  failed: 'Went wrong here', skipped: 'Not done today', not_reached: 'Not reached' };

/** A stage's status as the steps panel and the timeline list show it; a done synthetic stage says so instead. */
function statusOf(st: Stage): { text: string; cls: string } {
  const synthetic = st.source === 'synthetic' && st.status === 'done';
  return { text: synthetic ? 'Synthetic data' : STATUS[st.status],
    cls: st.status === 'failed' ? s.bad : st.status === 'done' && !synthetic ? s.stDone : isPending(st) ? s.stWait : '' };
}
/** The colour of a stage's dot in the timeline list. */
const DOT: Record<StageStatus, string> = { done: s.dotDone, failed: s.dotBad, current: s.dotWait, waiting: s.dotWait, at_risk: s.dotWait,
  skipped: s.dotSkip, not_reached: s.dotNr };

/** The line under a place's name on the board, as it happened or with Root Route's rules. */
function hubNote(f: Facts, h: Hub, rr: boolean): { text: string; tone: Tone } {
  const { st, fix } = f;
  const stages = h.stages.map(st);
  if (h.id === 'client') {
    const how = f.j.summary.channel === 'Email' ? 'Emailed the order' : `Ordered by ${f.j.summary.channel}`;
    const untold = [st(8).status === 'skipped' && 'the promise', f.late && st(14).status === 'skipped' && 'the delay'].filter(Boolean);
    return { text: untold.length ? `${how}; not told of ${untold.join(' or ')}` : st(8).status === 'done' ? `${how}; told of the promise` : how, tone: '' };
  }
  if (stages.every((x) => x.status === 'not_reached')) return { text: 'Not reached yet', tone: '' };
  const pending = stages.find(isPending);
  if (pending) return { text: `${STATUS[pending.status]}: ${pending.label.toLowerCase()}`, tone: '' };
  const lens = (n: number) => st(n).status === 'failed' && Boolean(st(n).withLateLens);
  const changed = rr && fix;
  switch (h.id) {
    case 'intake':
      if (lens(3)) return rr ? { text: 'Address confirmed first', tone: 'good' } : { text: 'Address incomplete, went ahead', tone: 'bad' };
      break;
    case 'plan': {
      const wrong = [4, 5, 6].filter(lens);
      if (!wrong.length) break;
      const promise = when(/^Promise (\S+)/.exec(st(4).withLateLens ?? '')?.[1] ?? null);
      const text = wrong.map((n) => (rr
        ? { 4: promise ? `Promised ${dayMonth(promise)}` : 'Promise after the cut-off rule', 5: 'Warehouse by the stock rule',
          6: fix ? `Carrier ${fix.carrier}${fix.usd ? `, ${fix.more ? '+' : '−'}$${fix.usd} / shipment` : ''}` : 'Carrier D capped on Fridays' }
        : { 4: 'Same-day promise after the cut-off', 5: `Shipped from ${f.warehouse ?? 'another site'}, not the nearest`,
          6: fix ? `${f.carrier ?? 'Carrier'} on a late lane` : 'Carrier D on a Friday' })[n as 4 | 5 | 6]).join('; ');
      return { text, tone: rr ? 'good' : 'bad' };
    }
    case 'wh': {
      const picked = when(st(10).at);
      if (picked) return { text: `Picked ${dayMonth(picked)}`, tone: '' };
      break;
    }
    case 'dock': {
      if (changed) return { text: `Carrier ${fix.carrier}`, tone: '' };
      const at = when(st(11).at);
      if (at) return { text: `${st(11).actor}, ${stamp(at)}`, tone: '' };
      break;
    }
    case 'transit': {
      if (st(12).status === 'failed') return { text: 'Route over 20% longer than planned', tone: 'bad' };
      if (changed) return { text: `Carrier ${fix.carrier}, ${f.j.summary.destination ?? ''} ${COMMITMENT[f.j.summary.commitment ?? ''] ?? ''}`.trim(), tone: '' };
      const at = when(st(12).at);
      const what = st(12).source === 'synthetic' ? 'Synthetic tracking' : 'Tracking';
      return { text: at ? `${what} from ${stamp(at)}` : what, tone: '' };
    }
    case 'delivery': {
      if (changed) return { text: `Carrier ${fix.carrier} lane, ${fix.best} on time`, tone: 'good' };
      const at = when(st(13).at);
      if (at) return f.late ? { text: `Delivered ${dayMonth(at)} — ${f.j.summary.outcome}`, tone: 'bad' } : { text: `Delivered ${dayMonth(at)}, on time`, tone: '' };
      break;
    }
  }
  const failed = stages.find((x) => x.status === 'failed');
  if (failed) return { text: `${failed.label}: went wrong`, tone: 'bad' };
  if (h.id === 'plan' && f.j.summary.promisedDate) {
    const p = when(f.j.summary.promisedDate);
    if (p) return { text: `${cap(COMMITMENT[f.j.summary.commitment ?? ''] ?? 'Promised')}, promised ${dayMonth(p)}`, tone: '' };
  }
  return { text: stages.every((x) => x.status === 'skipped') ? 'Not done today' : 'Done', tone: '' };
}

/** What went wrong, as a clause; the stage numbers are the decisions before pickup. */
const CAUSE: Record<number, (f: Facts) => string> = {
  3: () => 'the order went ahead with an incomplete address',
  4: () => 'a same-day promise was made after the 08:00 cut-off',
  5: (f) => `it shipped from ${f.warehouse ?? 'a warehouse'} rather than the nearest one`,
  6: (f) => (f.fix ? `it was given to ${f.carrier ?? 'a carrier'} on a lane that runs late` : 'it went with Carrier D on a Friday, when D is overloaded'),
};
/** What Root Route's rule does instead, as a clause. */
const RULE: Record<number, (f: Facts) => string> = {
  3: () => 'the client is asked for the missing address parts before release',
  4: (f) => {
    const p = when(/^Promise (\S+)/.exec(f.st(4).withLateLens ?? '')?.[1] ?? null);
    return p ? `the promise is set for ${dayMonth(p)}, as the order missed the 08:00 cut-off` : 'the promise follows the 08:00 cut-off';
  },
  5: (f) => `the warehouse rule picks the site: ${(f.st(5).withLateLens ?? '').replace(/\.$/, '')}`,
  6: ({ fix, j }) => (fix
    ? `Carrier ${fix.carrier} carries the ${j.summary.destination ?? ''} leg: ${fix.best} on time`
      + (fix.worse ? ` against ${fix.worse} for ${fix.from}` : '') + (fix.usd ? `, for $${fix.usd} ${fix.more ? 'more' : 'less'} per shipment` : '')
    : 'Carrier D is capped on Fridays, and the overflow goes to the next carrier'),
};

function headline(f: Facts, rr: boolean): { title: string; text: string } {
  const { j, st } = f;
  if (j.kind === 'order') {
    const done = j.stages.filter(isReached).length;
    const next = j.stages.find((x) => isPending(x) || x.status === 'not_reached');
    return { title: `${cap(j.summary.outcome)}: ${done} of ${j.stages.length} steps done.`,
      text: `${next ? `Next: ${next.label.toLowerCase()}. ` : ''}${FUTURE}` };
  }
  if (rr) {
    return { title: `The same order, with Root Route’s ${plural(f.fixes.length, 'decision')}.`,
      text: `${cap(list(f.fixes.map((x) => RULE[x.n]?.(f) ?? x.withLateLens ?? '')))}.` };
  }
  const delivered = when(st(13).at);
  const promised = when(j.summary.promisedDate);
  const days = delivered && promised ? Math.round((dayStart(delivered) - dayStart(promised)) / DAY_MS) : 0;
  const on = delivered ? `Delivered ${delivered.day} ${MONTHS[delivered.month]}` : 'Delivered';
  const title = f.late ? `${on}, ${plural(days, 'day')} after the promise.` : `${on}, on time.`;
  const wrong = j.stages.filter((x) => x.status === 'failed' && CAUSE[x.n]);
  const route = st(12).status === 'failed';
  const told = st(8).status === 'skipped'
    ? f.late && st(14).status === 'skipped' ? 'No promise confirmation or delay notice was sent to the client.' : 'No promise confirmation was sent to the client.'
    : '';
  const text = [
    wrong.length ? `${cap(plural(wrong.length, 'decision'))} ${f.late ? 'caused it' : 'went wrong on the way'}: ${list(wrong.map((x) => CAUSE[x.n](f)))}.` : '',
    route ? `The route ${wrong.length ? 'also ' : ''}ran more than 20% over plan.` : '',
    !wrong.length && !route ? 'Nothing went wrong on the way.' : '',
    told,
  ].filter(Boolean).join(' ');
  return { title, text };
}

export function JourneyScreen({ initialRef }: { initialRef: string }) {
  const [ref, setRef] = useState(initialRef);
  const j = useApi<Journey>(`/api/journey/${ref}`);
  // Email orders only for roles that may read the inbox (REQ-AUTH-16); others pick from deliveries.
  const inbox = useApi<Inbox>(useCanOpen('/dashboard/intake') ? '/api/intake' : null);
  const emails = inbox.data?.emails.slice(0, EMAILS_LISTED) ?? [];
  const listed = [...EXAMPLES.map(([r]) => r), ...emails.map((e) => `email:${e.id}`)];
  // "Another delivery ID" shows a box for the ID; it is also how a ref from the URL that is not in the list is shown.
  const [other, setOther] = useState(false);
  const typing = other || !listed.includes(ref);
  const [draft, setDraft] = useState(ref.startsWith('delivery:') ? ref.slice(9) : '');
  const typed = deliveryRef(draft);
  const inspect = () => typed && setRef(typed);

  // Which order: a selector in plain words, and a box for any other delivery ID. It sits at the right of the page head.
  const picker = (
    <div className={s.pick} role="search" aria-label="Choose an order">
      <label className={s.pickLab} htmlFor="oj-order">Order</label>
      <div className={s.select}>
        <select id="oj-order" value={typing ? OTHER : ref}
          onChange={(e) => { const v = e.target.value; setOther(v === OTHER); if (v !== OTHER) setRef(v); }}>
          <optgroup label="Past late deliveries">
            {EXAMPLES.map(([r, why]) => <option key={r} value={r}>Delivery {r.slice(9)} — {why}</option>)}
          </optgroup>
          {emails.length > 0 && (
            <optgroup label="New email orders">
              {emails.map((e) => <option key={e.id} value={`email:${e.id}`}>Email order {e.id} — {words(e.status)}</option>)}
            </optgroup>
          )}
          <option value={OTHER}>Another delivery ID…</option>
        </select>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>
      {typing && (
        <div className={s.searchRow}>
          <label className={s.field}>
            <span className={s.srOnly}>Delivery ID</span>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && inspect()}
              placeholder="Delivery ID, e.g. D000123" spellCheck={false} autoFocus={other} aria-invalid={draft !== '' && !typed} />
          </label>
          <button type="button" className={s.open} onClick={inspect} disabled={!typed}>Inspect</button>
        </div>
      )}
    </div>
  );

  return (
    <div className={s.screen}>
      {j.data ? <JourneyView key={j.data.ref} journey={j.data} picker={picker} /> : <header className={s.top}><div />{picker}</header>}

      {j.error ? (
        <section className={s.nf} role="alert">
          <h2>{ref.startsWith('delivery:') ? `No delivery found with ID ${ref.slice(9)}` : `No order found for ${ref}`}</h2>
          <p>Check the delivery ID, or choose an order from the list.</p>
        </section>
      ) : <Status loading={j.loading} skeleton="block" />}
    </div>
  );
}

/** One order on the hub diorama, full width: the head (what happened, with the order picker beside it), then the board
    under a bar holding the With Root Route toggle. Selecting a place moves the parcel there and opens its stages beside
    its node; the toggle switches all of it to Root Route's rules. */
function JourneyView({ journey, picker }: { journey: Journey; picker: ReactNode }) {
  const f = factsOf(journey);
  const canRR = journey.kind === 'delivery' && f.fixes.length > 0;
  const [withRR, setWithRR] = useState(false);
  const rr = canRR && withRR;
  const [sel, setSel] = useState<HubId>(() => {
    const first = journey.stages.find((x) => x.status === 'failed') ?? journey.stages.find(isPending);
    if (first) return hubOf(first.n).id;
    return [...HUBS].reverse().find((h) => hubReached(f, h))?.id ?? 'client';
  });
  const [open, setOpen] = useState<HubId | null>(null);
  const [hover, setHover] = useState<HubId | null>(null);
  const hoverOn = (id: HubId) => ({ onMouseEnter: () => setHover(id), onMouseLeave: () => setHover(null) });
  /** Selecting a place moves the parcel there and opens its stages; selecting it again closes them. */
  const choose = (id: HubId) => { setSel(id); setOpen(open === id ? null : id); };
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open]);

  const head = headline(f, rr);
  const hub = HUBS.find((h) => h.id === sel) ?? HUBS[0];
  const shown = HUBS.find((h) => h.id === open);
  const pos = (h: Hub) => ({ left: `${(h.at[0] / BOARD_W) * 100}%`, top: `${(h.at[1] / BOARD_H) * 100}%` });
  const commitment = COMMITMENT[journey.summary.commitment ?? ''];
  const id = /\b(ORD-\d+)/.exec(f.st(9).detail)?.[1] ?? (journey.kind === 'order' ? `Email ${journey.ref.slice(6)}` : journey.ref.slice(9));
  const kicker = [id, [journey.summary.destination, commitment].filter(Boolean).join(' ')].filter(Boolean).join(' · ');

  // The road between places: recorded, the carrier's tracking (dashed when synthetic), or not reached yet.
  const track = rr && f.fix ? s.legFix : `${f.late ? s.legLate : s.legRec} ${f.st(12).source === 'synthetic' ? s.legDash : ''}`;
  const legs = HUBS.slice(1).map((h, i) => ({ from: HUBS[i].at, to: h.at,
    cls: !hubReached(f, h) ? s.legAhead : journey.kind === 'delivery' && i >= FIRST_TRACK_LEG ? track : s.legRec }));
  const tracked = journey.kind === 'delivery' && hubReached(f, HUBS[HUBS.length - 1]);

  return (
    <>
      <header className={s.top}>
        <div className={s.headText}>
          <span className={s.kicker}>{kicker}</span>
          <h1>{head.title}</h1>
          <p>{head.text}</p>
        </div>
        {picker}
      </header>

      <section className={s.mapCard} aria-label="Journey map">
        <div className={s.mapBar}>
          <span>{rr ? 'Root Route rules applied to the recorded order data.' : 'Select a stage on the map to view its recorded events.'}</span>
          {canRR && (
            <button type="button" role="switch" aria-checked={rr} className={s.toggle} onClick={() => setWithRR(!rr)}>
              <span className={s.track} aria-hidden="true"><span className={s.knob} /></span>With Root Route
            </button>
          )}
        </div>
        <div className={s.scroll}>
          {/* A click on the empty board (the picture and the road let clicks through) closes the open place. */}
          <div className={s.board} onClick={(e) => e.target === e.currentTarget && setOpen(null)}>
            <div className={s.ground} aria-hidden="true">
              <img src="/media/journey-diorama.svg" alt="" />
              {f.warehouse && (
                <svg viewBox={`0 0 ${BOARD_W} ${BOARD_H}`}>
                  <text className={s.roof} transform="matrix(0.866 0.5 -0.866 0.5 578.5 395.6)">{f.warehouse}</text>
                </svg>
              )}
            </div>
            <svg className={s.route} viewBox={`0 0 ${BOARD_W} ${BOARD_H}`} aria-hidden="true">
              {legs.map((l, i) => <line key={i} className={l.cls} x1={l.from[0]} y1={l.from[1]} x2={l.to[0]} y2={l.to[1]} />)}
              {HUBS.map((h, i) => (
                <circle key={h.id} className={i ? legs[i - 1].cls : s.legRec} cx={h.at[0]} cy={h.at[1]} r="4" />
              ))}
              {HUBS.map((h) => <line key={h.id} className={s.lead} x1={h.lead[0]} y1={h.lead[1]} x2={h.lead[2]} y2={h.lead[3]} />)}
              {/* A ring around the node under the pointer (or whose label is hovered or focused); the wider
                  transparent circle makes the node itself easy to hover and click. */}
              {HUBS.map((h) => (
                <Fragment key={h.id}>
                  <circle className={`${s.halo} ${hover === h.id || open === h.id ? s.haloOn : ''}`} cx={h.at[0]} cy={h.at[1]} r="11" />
                  <circle className={s.nodeHit} cx={h.at[0]} cy={h.at[1]} r="16" onClick={() => choose(h.id)} {...hoverOn(h.id)} />
                </Fragment>
              ))}
            </svg>
            <span className={s.parcel} style={pos(hub)} aria-hidden="true">
              {/* Keyed by place so the ripple starts over each time the parcel arrives somewhere new. */}
              <span key={sel} className={s.ripple} />
            </span>
            {HUBS.map((h) => {
              const note = hubNote(f, h, rr);
              return (
                <button key={h.id} type="button" aria-pressed={sel === h.id} aria-expanded={open === h.id}
                  aria-controls={open === h.id ? `oj-pop-${h.id}` : undefined} onClick={() => choose(h.id)} {...hoverOn(h.id)}
                  onFocus={() => setHover(h.id)} onBlur={() => setHover(null)}
                  className={`${s.hub} ${hubReached(f, h) ? '' : s.hubAhead}`} style={{ left: `${h.lab[0]}%`, top: `${h.lab[1]}%` }}>
                  <span className={s.hubTag}>{h.tag}</span>{' '}
                  <span className={s.hubName}>{hubTitle(f, h)}</span>{' '}
                  <span className={`${s.hubNote} ${note.tone ? s[note.tone] : ''}`}>{note.text}</span>
                </button>
              );
            })}
            <div className={s.legend}>
              <span><svg width="22" height="4" aria-hidden="true"><line className={s.legRec} x1="0" y1="2" x2="22" y2="2" /></svg>Recorded</span>
              {tracked && (
                <span><svg width="22" height="4" aria-hidden="true"><line className={track} x1="0" y1="2" x2="22" y2="2" /></svg>
                  {rr && f.fix ? `Carrier ${f.fix.carrier}` : `${f.late ? 'Late, ' : ''}${f.st(12).source === 'synthetic' ? 'synthetic tracking' : 'tracking'}`}</span>
              )}
              {legs.some((l) => l.cls === s.legAhead) && (
                <span><svg width="22" height="4" aria-hidden="true"><line className={s.legAhead} x1="0" y1="2" x2="22" y2="2" /></svg>Not reached yet</span>
              )}
            </div>

            {/* The open place's stages, beside its node: to the right, or to the left for places on the right of the board. */}
            {shown && (
              <div key={shown.id} id={`oj-pop-${shown.id}`} role="group" aria-label={`${hubTitle(f, shown)}: stages`}
                className={`${s.pop} ${shown.at[0] / BOARD_W > POP_FLIP ? s.popL : s.popR}`} style={pos(shown)}>
                <div className={s.popHead}>
                  <span className={s.hubTag}>{shown.tag}</span>
                  <b>{hubTitle(f, shown)}</b>
                  <button type="button" className={s.popClose} aria-label="Close" onClick={() => setOpen(null)}>×</button>
                </div>
                <ol className={s.tl}>
                  {shown.stages.map(f.st).map((st) => <StageRow key={st.n} st={st} changed={rr && f.fixes.includes(st)} />)}
                </ol>
                {journey.kind === 'order' && shown.stages.some((n) => n >= 10 && n <= 13) && <p className={s.popNote}>{FUTURE}</p>}
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}

/** Places further right than this (share of the board's width) open their stages to the left of the node. */
const POP_FLIP = 0.6;

/** One stage: time on the left, a dot on the rail, what happened on the right. With Root Route, a stage its rules change
    shows the rule, and the record under it. */
function StageRow({ st, changed }: { st: Stage; changed: boolean }) {
  const status = changed ? { text: 'Changed by Root Route', cls: s.good } : statusOf(st);
  const at = when(st.at);
  const who = st.actor && st.actor !== '—' ? st.actor : null;
  return (
    <li>
      <span className={s.tlWhen}>
        {at ? <>{at.time && <b>{at.time}</b>}<small>{dayMonth(at)}</small></>
          : <i>{st.status === 'skipped' ? 'no time recorded' : '—'}</i>}
      </span>
      <span className={`${s.tlDot} ${changed ? s.dotFix : DOT[st.status]}`} />
      <span className={s.tlBody}>
        <span className={s.tlHead}>
          <span className={s.tlN}>{st.n}</span><b>{st.label}</b><span className={status.cls}>{status.text}</span>
        </span>
        {who && <span className={s.tlMeta}>{who}</span>}
        {changed ? (
          <>
            <span className={`${s.tlText} ${s.good}`}>{st.withLateLens}</span>
            <span className={s.tlWas}>As recorded: {st.detail}</span>
          </>
        ) : <span className={s.tlText}>{st.detail || 'Not reached yet.'}</span>}
      </span>
    </li>
  );
}

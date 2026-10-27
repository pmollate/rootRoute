'use client';

import { useState } from 'react';
import { Pill, ScreenHead, Section, Status, SyntheticBadge, Table, type Tone, ui } from '@/components/dashboard/ui';
import { useApi } from '@/hooks/useApi';
import { postJSON } from '@/lib/api';
import s from './intake.module.css';

type Decision = 'ALL_CLEAR' | 'CONFIRM_ADDRESS' | 'MISSING_INFO';
interface EmailItem {
  id: number; source: string; from: string; subject: string; receivedAt: string; clientId: string | null; status: string;
  decision: Decision | null; inReplyTo: number | null; priority: boolean;
}
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

const DECISION: Record<Decision, [string, Tone]> = {
  ALL_CLEAR: ['All clear', 'good'], CONFIRM_ADDRESS: ['Confirm address', 'warn'], MISSING_INFO: ['Missing info', 'bad'],
};
const STATUS: Record<string, string> = {
  RECEIVED: 'Received', WAITING: 'Waiting for AI services', AWAITING_APPROVAL: 'Awaiting approval', APPROVED: 'Approved',
  SENT: 'Reply sent', ENTERED: 'In WMS',
};
const FIELD: Record<string, string> = { 'address.line1': 'street address', 'address.city': 'city', 'address.state': 'state', 'address.zip': 'ZIP code' };
const ISSUE: Record<string, string> = {
  street_not_found: 'street not found on the map', zip_mismatch: 'ZIP code does not match the city', state_mismatch: 'state does not match the city',
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };
const oneLine = (a: Address) => `${a.line1}${a.line2 ? `, ${a.line2}` : ''}, ${a.city}, ${a.state} ${a.zip}`;
const ACTION_DONE: Record<string, string> = { approve: 'Approved', send_reply: 'Reply sent', send_to_wms: 'Sent to WMS' };

/** A fixed message per known refusal: the server's text can carry config names or internals. */
function refusal(e: unknown): string {
  const m = e instanceof Error ? e.message : '';
  if (m.includes('allow-list')) return 'Not sent: this address is not on the test allow-list.';
  if (m.includes('Gmail is not set up')) return 'Not sent: Gmail is not connected yet.';
  return 'Could not do that. Refresh and try again.';
}

function DecisionPill({ decision }: { decision: Decision | null }) {
  if (!decision) return <Pill>Not decided</Pill>;
  const [label, tone] = DECISION[decision];
  return <Pill tone={tone}>{label}</Pill>;
}

function AddressCheck({ a }: { a: NonNullable<Detail['checks']>['address'] }) {
  if (!a) return <>Not read</>;
  if (a.status === 'incomplete') return <>Missing: {a.missing.map((m) => FIELD[m] ?? m).join(', ')}</>;
  if (!a.address) return <>—</>;
  const v = a.validation;
  if (a.status === 'unverified') {
    const issues = v?.issues.map((i) => ISSUE[i] ?? i).join('; ') || 'not confirmed on the map';
    return <>{oneLine(a.address)} · <b>{issues}</b>{v?.suggestion ? ` (map shows ${v.suggestion.zip})` : ''}</>;
  }
  const how = a.status === 'matched' ? 'saved address' : v && v.confidence !== 'unavailable' ? `map: ${v.confidence} confidence` : 'format checked';
  return <>{oneLine(a.address)} <span className={s.muted}>({how})</span></>;
}

export function IntakeScreen() {
  const list = useApi<{ emails: EmailItem[] }>('/api/intake');
  const [selected, setSelected] = useState<number | null>(null);
  const detail = useApi<Detail>(selected ? `/api/intake/${selected}` : null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ from: 'orders@client190.example', subject: '[SYNTHETIC] Order', receivedAt: '2026-10-21 08:05', body: '' });
  const d = detail.data && detail.data.email.id === selected ? detail.data : undefined;
  const answering = d && d.decision !== 'ALL_CLEAR' && d.decision !== null ? d.email.id : null;

  async function run(work: () => Promise<string>) {
    setBusy(true);
    try {
      setMessage(await work());
    } catch (e) {
      setMessage(refusal(e));
    } finally {
      setBusy(false);
      list.reload();
      detail.reload();
    }
  }

  const act = (action: 'approve' | 'send_reply' | 'send_to_wms') => run(async () => {
    await postJSON<{ status: string }>(`/api/intake/${selected}/action`, { action, user: 'ops' });
    return `Email ${selected}: ${ACTION_DONE[action]}.`;
  });

  const fetchGmail = () => run(async () => {
    const r = await postJSON<{ fetched: number }>('/api/intake/fetch', {});
    return `Fetched ${r.fetched} email${r.fetched === 1 ? '' : 's'} from Gmail.`;
  });

  const submit = () => run(async () => {
    const r = await postJSON<{ id: number; decision: Decision | null }>('/api/intake/email',
      { ...draft, ...(answering ? { inReplyTo: answering } : {}) });
    setSelected(r.id);
    setDraft({ ...draft, body: '' });
    return r.decision ? `Email ${r.id}: ${r.decision}` : `Email ${r.id} is waiting: the AI services did not answer. Process it again shortly.`;
  });

  const status = d?.email.status;
  return (
    <>
      <ScreenHead title="Order emails">
        <SyntheticBadge />
      </ScreenHead>
      <p className={s.lede}>
        Each order email is read by the AI with names, phones and emails removed, then checked by rules: the address
        against the email and the map, the promise against the 08:00 cut-off. An operator approves every reply and every
        WMS entry.
      </p>
      <div className={ui.grid2}>
        <Section title="Inbox">
          <div className={s.tools}>
            <button type="button" className={`${ui.button} ${ui.primary}`} onClick={fetchGmail} disabled={busy}>Fetch from Gmail</button>
            <span className={s.muted}>Priority clients (Tier 1 or at risk) are listed first.</span>
          </div>
          <Status loading={list.loading && !list.data} error={list.error} />
          {list.data && (list.data.emails.length === 0
            ? <p className={s.muted}>No order emails yet. Fetch from Gmail or paste one below.</p>
            : <Table rows={list.data.emails} columns={[
              { key: 'id', label: '#', render: (e) => (
                <button type="button" className={s.open} aria-label={`Open email ${e.id}`} aria-pressed={e.id === selected}
                  onClick={() => { setSelected(e.id); setMessage(''); }}>{e.id}</button>) },
              { key: 'from', label: 'From', render: (e) => (
                <span className={s.from}>{e.from}{e.priority && <Pill tone="bad" title="Tier 1 or at-risk client: handled first">Priority</Pill>}
                  {e.inReplyTo && <span className={s.muted}>reply to {e.inReplyTo}</span>}</span>) },
              { key: 'decision', label: 'Decision', render: (e) => <DecisionPill decision={e.decision} /> },
              { key: 'status', label: 'Status', render: (e) => STATUS[e.status] ?? e.status },
            ]} />)}

          <div className={s.form}>
            <h3 className={s.h3}>Paste an email <span className={s.muted}>(synthetic only)</span></h3>
            <div className={s.formRow}>
              <input className={ui.input} aria-label="From" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
              <input className={ui.input} aria-label="Subject" value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
              <input className={ui.input} aria-label="Received at" value={draft.receivedAt} onChange={(e) => setDraft({ ...draft, receivedAt: e.target.value })} />
            </div>
            <textarea className={ui.textarea} aria-label="Body" rows={6} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
            <div className={s.tools}>
              <button type="button" className={ui.button} onClick={submit} disabled={busy || !draft.body.trim()}>Process email</button>
              <span className={s.muted}>{answering ? `This will be linked as the reply to email ${answering}.` : 'Select an email waiting for an address to paste the client\'s reply to it.'}</span>
            </div>
          </div>
          {message && <p className={s.message} role="status">{message}</p>}
        </Section>

        <Section title={selected ? `Email ${selected}` : 'Select an email'}>
          <Status loading={Boolean(selected) && detail.loading && !d} error={detail.error} />
          {d && (
            <div className={s.detail}>
              <div className={s.state}><DecisionPill decision={d.decision} /> <span className={s.muted}>{STATUS[d.email.status] ?? d.email.status} · {d.email.from} · {d.email.receivedAt}</span></div>
              <div className={s.texts}>
                <div><h3 className={s.h3}>Email</h3><pre className={ui.pre}>{d.email.body}</pre></div>
                <div><h3 className={s.h3}>What the AI saw</h3><pre className={ui.pre}>{d.email.redactedBody ?? 'Not sent to the AI yet.'}</pre></div>
              </div>
              <dl className={s.checks}>
                <dt>Items</dt><dd>{d.extraction?.items.length ? d.extraction.items.map((i) => `${i.qty} × ${i.sku}`).join(', ') : 'Not read'}</dd>
                <dt>Address</dt><dd><AddressCheck a={d.checks?.address ?? null} /></dd>
                <dt>Promise</dt><dd>{d.checks?.promise ? <><b>{day(d.checks.promise.promiseDate)}</b>{d.checks.promise.reason ? ` · ${d.checks.promise.reason}` : ''}</> : '—'}</dd>
                <dt>Warehouse</dt><dd>{d.checks?.warehouse?.reason ?? '—'}</dd>
                <dt>Carrier</dt><dd>{d.checks?.carrier?.reason ?? '—'}</dd>
              </dl>
              {d.replyDraft && (
                <div>
                  <h3 className={s.h3}>Reply draft <span className={s.muted}>({d.replySource === 'model' ? 'written by AI from the checked facts' : 'template'})</span></h3>
                  <pre className={`${ui.pre} ${s.draft}`}>{d.replyDraft}</pre>
                </div>
              )}
              <div className={s.actions}>
                <button type="button" className={`${ui.button} ${ui.primary}`} onClick={() => act('approve')} disabled={busy || status !== 'AWAITING_APPROVAL'}>Approve</button>
                <button type="button" className={ui.button} onClick={() => act('send_reply')} disabled={busy || !(status === 'APPROVED' || status === 'ENTERED')}>Send reply</button>
                <button type="button" className={ui.button} onClick={() => act('send_to_wms')}
                  disabled={busy || d.decision !== 'ALL_CLEAR' || !(status === 'APPROVED' || status === 'SENT')}>Send to WMS</button>
              </div>
            </div>
          )}
        </Section>
      </div>
    </>
  );
}

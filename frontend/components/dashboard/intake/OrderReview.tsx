'use client';

import { useState } from 'react';
import { useCan } from '@/components/auth/UserContext';
import { Pill, Status, SyntheticBadge } from '@/components/dashboard/ui';
import { useApi } from '@/hooks/useApi';
import { SESSION_ENDED, SessionExpired, postJSON, signInAgain } from '@/lib/api';
import s from './intake.module.css';

export interface CarrierChoice { carrier: string; status: 'recommended' | 'backup' | 'eligible'; onTime: number | null; reason: string }
export interface ReviewOrder {
  id: number; from: string; clientId: string | null; clientName: string | null; tier: string | null; priority: boolean;
  receivedAt: string; items: { sku: string; qty: number }[]; region: string | null; promiseDate: string | null;
  warehouseId: string | null; carrier: string; carrierReason: string; choices: CarrierChoice[]; blocked: string[];
}

const pct = (x: number | null) => (x === null ? 'no lane data' : `${(x * 100).toFixed(1)}% on time`);
const MIN_REASON = 3;

/**
 * E18 (SPEC §5.3 step 12, §5.7): ALL_CLEAR orders waiting for approval. Approve (optionally with another unblocked
 * carrier and a reason) or reject with a reason. The reply and WMS entry stay on the thread view. Buttons follow the
 * signed-in roles (SPEC-auth §4.3); the API refuses anyway.
 */
export function OrderReview({ onChange }: { onChange?: () => void }) {
  const q = useApi<{ orders: ReviewOrder[] }>('/api/intake/review');
  const canApprove = useCan('approve');
  const canReject = useCan('reject');
  const [pick, setPick] = useState<Record<number, string>>({});
  const [reason, setReason] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [note, setNote] = useState<{ text: string; bad: boolean; link?: string } | null>(null);

  async function act(o: ReviewOrder, action: 'approve' | 'reject') {
    const carrier = pick[o.id] ?? o.carrier;
    const why = (reason[o.id] ?? '').trim();
    const body = action === 'reject' ? { action, reason: why } : carrier !== o.carrier ? { action, carrier, reason: why } : { action };
    setBusy(o.id);
    try {
      await postJSON<{ status: string }>(`/api/intake/${o.id}/action`, body);
      setNote({ text: action === 'reject' ? `Order ${o.id}: rejected.` : `Order ${o.id}: approved with carrier ${carrier}.`, bad: false });
      q.reload();
      onChange?.();
    } catch (e) {
      // The typed reason stays in state, so nothing is lost when the session has ended (REQ-AUTH-11).
      if (e instanceof SessionExpired) setNote({ text: SESSION_ENDED, bad: true, link: signInAgain('/dashboard/intake') });
      else setNote({ text: e instanceof Error && e.message === 'forbidden' ? 'Your role cannot do this.' : 'Could not do that. Refresh and try again.', bad: true });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className={s.review} aria-label="Order review">
      <header className={s.reviewHead}><h2>Order review</h2><SyntheticBadge /></header>
      <p className={s.muted}>All-clear orders waiting for approval, priority clients first. Nothing reaches the WMS before approval.</p>
      <Status loading={q.loading && !q.data} error={q.error} />
      {q.data && q.data.orders.length === 0 && <p className={s.empty}>No all-clear orders are waiting for approval.</p>}
      {q.data?.orders.map((o) => {
        const chosen = pick[o.id] ?? o.carrier;
        const why = (reason[o.id] ?? '').trim();
        const changed = chosen !== o.carrier;
        return (
          <article key={o.id} className={`${s.card} ${s.reviewCard}`} aria-label={`Order ${o.id}`}>
            <p>
              <b>{o.clientName ?? o.clientId ?? o.from}</b>{o.tier && <> · {o.tier}</>}{' '}
              {o.priority && <Pill tone="bad" title="Tier 1 or at-risk client: handled first">Priority</Pill>}
              <span className={s.muted}> · email {o.id} · {o.receivedAt}</span>
            </p>
            <p>
              {o.items.map((i) => `${i.qty} x ${i.sku}`).join(', ')} · {o.region ?? 'region not known'} · promise {o.promiseDate ?? '—'}
              {' '}· warehouse {o.warehouseId ?? '—'}
            </p>
            <label className={s.field}><span>Carrier</span>
              <select aria-label={`Carrier for order ${o.id}`} value={chosen} disabled={!canApprove}
                onChange={(e) => setPick({ ...pick, [o.id]: e.target.value })}>
                {o.choices.map((c) => <option key={c.carrier} value={c.carrier}>{c.carrier} · {c.status} · {pct(c.onTime)}</option>)}
              </select>
            </label>
            <p className={s.muted}>{o.carrierReason}</p>
            {o.blocked.length > 0 && <p className={s.muted}>Blocked on this lane, not offered: {o.blocked.join(', ')}</p>}
            {(canApprove || canReject) && (
              <label className={s.field}><span>Reason</span>
                <input aria-label={`Reason for order ${o.id}`} value={reason[o.id] ?? ''}
                  placeholder={changed ? 'Why this carrier (logged)' : 'Needed to reject'}
                  onChange={(e) => setReason({ ...reason, [o.id]: e.target.value })} />
              </label>
            )}
            <div className={s.buttons}>
              {canReject && (
                <button type="button" className={s.btn} disabled={busy !== null || why.length < MIN_REASON} onClick={() => act(o, 'reject')}>Reject</button>
              )}
              {canApprove && (
                <button type="button" className={`${s.btn} ${s.btnPrimary}`} disabled={busy !== null || (changed && why.length < MIN_REASON)}
                  onClick={() => act(o, 'approve')}>Approve</button>
              )}
            </div>
          </article>
        );
      })}
      {note && (
        <p role="status" className={note.bad ? s.logBad : s.logOk}>{note.text}{note.link && <> <a href={note.link}>Sign in again</a></>}</p>
      )}
    </section>
  );
}

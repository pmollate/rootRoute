'use client';

import { useState } from 'react';
import { useCan } from '@/components/auth/UserContext';
import { Pill, Status, SyntheticBadge } from '@/components/dashboard/ui';
import { useApi } from '@/hooks/useApi';
import { SESSION_ENDED, SessionExpired, postJSON, signInAgain } from '@/lib/api';
import s from './intake.module.css';

export interface CarrierChoice {
  carrier: string; status: 'recommended' | 'backup' | 'eligible'; onTime: number | null; meanRate?: number | null; reason: string;
}
export interface ReviewOrder {
  id: number; from: string; clientId: string | null; clientName: string | null; tier: string | null; priority: boolean;
  receivedAt: string; items: { sku: string; qty: number }[]; region: string | null; promiseDate: string | null;
  warehouseId: string | null; carrier: string; carrierReason: string; choices: CarrierChoice[]; blocked: string[];
  commitment?: string | null; promiseReason?: string | null; warehouseReason?: string | null; warnClient?: boolean;
  addressStatus?: string | null; blockedLanes?: { carrier: string; onTime: number | null }[];
}

const pct = (x: number | null | undefined) => (x == null ? '—' : `${(x * 100).toFixed(1)}%`);
const MIN_REASON = 3;
const SERVICE: Record<string, string> = { same_day: 'Same day', next_day: 'Next day', standard: 'Standard' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** "2026-10-31" as a calendar day (no time zone shift), e.g. "Sat 31 Oct". */
const ymd = (d: string) => { const [y, m, dd] = d.slice(0, 10).split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd)); };
const longDay = (d: string) => { const t = ymd(d); return `${DAYS[t.getUTCDay()]} ${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]}`; };
/** "2026-10-27 16:21" as "27 Oct 16:21". */
const keyed = (at: string) => { const t = ymd(at); return `${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]} ${at.slice(11, 16)}`; };
/** Whole days from the day the order was keyed to the promise date. */
const slack = (at: string, promise: string) => {
  const n = Math.round((ymd(promise).getTime() - ymd(at).getTime()) / 86400_000);
  return n <= 0 ? 'due the day it was keyed' : `${n} day${n === 1 ? '' : 's'} slack`;
};
/** Freight vs the recommended carrier, per shipment, from the lane's mean rates. */
const costDelta = (rate: number | null | undefined, base: number | null | undefined) => {
  if (rate == null || base == null) return 'Cost not known';
  const d = rate - base;
  return Math.abs(d) < 0.005 ? 'Same cost' : `${d > 0 ? '+' : '−'}$${Math.abs(d).toFixed(2)} / shipment`;
};

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
            <header className={s.rvHead}>
              <div className={s.rvWho}>
                <h3>{o.clientName ?? o.clientId ?? o.from}
                  {(o.tier || o.priority) && (
                    <Pill tone={o.priority ? 'bad' : 'neutral'} title={o.priority ? 'Tier 1 or at-risk client: handled first' : undefined}>
                      {[o.tier, o.priority && 'Priority'].filter(Boolean).join(' · ')}
                    </Pill>
                  )}
                </h3>
                <p className={s.rvOrder}>
                  {o.items.map((i) => `${i.qty} × ${i.sku}`).join(', ')} · {o.warehouseId ?? '—'} → {o.region ?? 'region not known'}
                  {o.commitment && <> · {SERVICE[o.commitment] ?? o.commitment}</>}
                </p>
              </div>
              <div className={s.rvPromise}>
                <span>Promise</span>
                <b>{o.promiseDate ? longDay(o.promiseDate) : '—'}</b>
                <small>{o.promiseDate && <>{slack(o.receivedAt, o.promiseDate)} · </>}email {o.id} · keyed {keyed(o.receivedAt)}</small>
              </div>
            </header>

            <div className={s.rvSection}>
              <p className={s.rvLabel}>Fulfil from warehouse</p>
              <p className={s.rvWarehouse}><b>{o.warehouseId ?? 'Not chosen'}</b>{o.warehouseReason && <span>{o.warehouseReason}</span>}</p>
              <div className={s.rvChips}>
                {o.addressStatus && (
                  <span className={`${s.rvChip} ${o.addressStatus === 'complete' || o.addressStatus === 'matched' ? s.tGood : s.tWarn}`}>
                    {o.addressStatus === 'complete' || o.addressStatus === 'matched' ? 'Address checked' : 'Address to check'}
                  </span>
                )}
                {o.commitment && (
                  <span className={`${s.rvChip} ${o.promiseReason ? s.tWarn : s.tGood}`}>
                    {o.commitment === 'standard' ? '08:00 cut-off: n/a (standard)' : o.promiseReason ?? 'Before the 08:00 cut-off'}
                  </span>
                )}
                {o.warnClient && <span className={`${s.rvChip} ${s.tWarn}`}>Farther warehouse: tell the client</span>}
              </div>
            </div>

            <div className={s.rvSection}>
              <div className={s.rvRow}>
                <p className={s.rvLabel} id={`carriers-${o.id}`}>Carrier · on time on {o.warehouseId ?? '—'} → {o.region ?? '—'}</p>
                <span className={s.rvHint}>Cost vs recommended</span>
              </div>
              <div className={s.rvCarriers} role="radiogroup" aria-label={`Carrier for order ${o.id}`}>
                {o.choices.map((c) => {
                  const base = o.choices.find((x) => x.carrier === o.carrier)?.meanRate;
                  return (
                    <button key={c.carrier} type="button" role="radio" aria-checked={chosen === c.carrier} disabled={!canApprove}
                      className={`${s.rvCarrier} ${chosen === c.carrier ? s.rvOn : ''}`}
                      aria-label={`${c.carrier}, ${pct(c.onTime)} on time${c.carrier === o.carrier ? ', recommended' : ''}`}
                      onClick={() => setPick({ ...pick, [o.id]: c.carrier })}>
                      <span className={s.rvTop}><b>{c.carrier}</b>
                        {c.carrier === o.carrier ? <em>Best</em> : c.status === 'backup' ? <em>Backup</em> : null}</span>
                      <strong>{pct(c.onTime)}</strong>
                      <small>{c.carrier === o.carrier ? 'Recommended' : costDelta(c.meanRate, base)}</small>
                    </button>
                  );
                })}
                {(o.blockedLanes ?? o.blocked.map((c) => ({ carrier: c, onTime: null }))).map((b) => (
                  <div key={b.carrier} className={`${s.rvCarrier} ${s.rvBlocked}`} aria-label={`${b.carrier}, blocked on this lane, not offered`}>
                    <span className={s.rvTop}><b>{b.carrier}</b><em>Blocked</em></span>
                    <strong>{pct(b.onTime)}</strong>
                    <small>Blocked on lane</small>
                  </div>
                ))}
              </div>
              <p className={s.rvWhy}>{o.carrierReason}</p>
            </div>

            <footer className={s.rvFoot}>
              {(canApprove || canReject) && (
                <label className={`${s.field} ${s.rvReason}`}><span>Reason {changed ? '(needed: a different carrier is logged)' : '(needed to reject)'}</span>
                  <input aria-label={`Reason for order ${o.id}`} value={reason[o.id] ?? ''}
                    placeholder={changed ? `Why ${chosen} instead of ${o.carrier}` : 'Why this order is rejected'}
                    onChange={(e) => setReason({ ...reason, [o.id]: e.target.value })} />
                </label>
              )}
              <div className={s.buttons}>
                {canReject && (
                  <button type="button" className={s.btn} disabled={busy !== null || why.length < MIN_REASON} onClick={() => act(o, 'reject')}>Reject</button>
                )}
                {canApprove && (
                  <button type="button" className={`${s.btn} ${s.btnPrimary}`} disabled={busy !== null || (changed && why.length < MIN_REASON)}
                    onClick={() => act(o, 'approve')}>Approve {o.warehouseId ? `${o.warehouseId} + ` : ''}{chosen}</button>
                )}
              </div>
            </footer>
          </article>
        );
      })}
      {note && (
        <p role="status" className={note.bad ? s.logBad : s.logOk}>{note.text}{note.link && <> <a href={note.link}>Sign in again</a></>}</p>
      )}
    </section>
  );
}

import { allowList } from '../../core/config.js';
import type { AuthUser, CarrierId, CarrierRecommendation } from '../../core/contracts.js';
import type { GmailClient } from '../../core/gmail.js';
import { restore } from '../../core/pii/redact.js';
import { senderAddress, sendReply } from './mailbox.js';
import type { Repo } from './repo.js';
import { carrierChoices } from './review.js';
import { type Wms, wmsOrder } from './wms.js';

export const ACTIONS = ['approve', 'reject', 'send_reply', 'send_to_wms'] as const;
export type Action = (typeof ACTIONS)[number];
export interface ActionResult { code: 200 | 400 | 403 | 404 | 409 | 503; status?: string; error?: string }
export interface Outbox { gmail: Pick<GmailClient, 'sendMessage'> | null; allow: Set<string> }
/** The Carriers module's override log (`logOverride` in modules/carriers/index.ts), the one writer of override_log. */
export type OverrideLog = (o: { orderRef: string; from: string; to: string; reason: string; user: string }) => Promise<number>;
/** The Carriers module's `recordOrderEvent` (modules/carriers/index.ts), the one writer of order_events (design §7). */
export type OrderEventLog = (o: { orderRef: string; event: 'wms_entered'; detail: Record<string, unknown> }) =>
  Promise<{ code: number; error?: string }>;
/**
 * `edited`: the operator's own reply text (send_reply). `reason`: why an order is rejected, or why its carrier changes.
 * `carrier`: the supervisor's carrier for an ALL_CLEAR order (approve only). `overrides`: where that change is logged.
 * `wms`: the WMS send_to_wms hands the order to (null when WMS_URL is unset); `orderEvents`: where `wms_entered` goes.
 */
export interface ActionOptions {
  edited?: string; reason?: string; carrier?: CarrierId; overrides?: OverrideLog; wms?: Wms | null; orderEvents?: OrderEventLog;
}

const MIN_REASON = 3;

/**
 * E8 / E18 / SEC-03 / SEC-04: nothing leaves without an operator's approval; replies go only to allow-listed addresses,
 * and the names (PII tags) are put back into the reply only now, just before it is sent.
 * A supervisor approves or rejects an ALL_CLEAR order (REQ-INT-14) and may pick another unblocked carrier on approve
 * (REQ-INT-15); the change is logged through the Carriers module, with the approver as the user (AC-AUTH-14).
 * `actor` is the signed-in person from the verified token (REQ-AUTH-07); their name and roles go in the audit payload.
 */
export async function applyAction(repo: Repo, id: number, action: Action, actor: string | AuthUser,
  outbox: Outbox = { gmail: null, allow: allowList }, opts: ActionOptions = {}): Promise<ActionResult> {
  const user = typeof actor === 'string' ? actor : actor.id;
  const who = typeof actor === 'string' ? {} : { name: actor.name, roles: actor.roles };
  const email = await repo.getEmail(id);
  if (!email) return { code: 404, error: 'not found' };
  const x = await repo.latestExtraction(id);
  const reason = opts.reason?.trim() ?? '';

  if (action === 'reject') {
    if (email.status !== 'AWAITING_APPROVAL') return { code: 409, error: `cannot reject from ${email.status}` };
    if (x?.decision !== 'ALL_CLEAR') return { code: 409, error: 'only ALL_CLEAR orders are rejected; other emails wait for the client' };
    if (reason.length < MIN_REASON) return { code: 400, error: 'a rejection needs a reason' };
    await repo.setStatus(id, 'REJECTED');
    await repo.logApproval(id, 'reject', user, { ...who, reason });
    return { code: 200, status: 'REJECTED' };
  }

  if (action === 'approve') {
    if (email.status !== 'AWAITING_APPROVAL') return { code: 409, error: `cannot approve from ${email.status}` };
    const rec = (x?.checks.carrier ?? null) as CarrierRecommendation | null;
    if (opts.carrier && !rec) return { code: 409, error: 'only ALL_CLEAR orders have a carrier to change' };
    const change = x && rec && opts.carrier && opts.carrier !== rec.carrier ? opts.carrier : null;
    if (x && rec && change) {
      if (!carrierChoices(rec).some((c) => c.carrier === change)) return { code: 409, error: `carrier ${change} is not offered on this lane` };
      if (reason.length < MIN_REASON) return { code: 400, error: 'a carrier change needs a reason' };
      if (!opts.overrides) return { code: 503, error: 'the carrier override log is not available' };
      await opts.overrides({ orderRef: `email:${id}`, from: rec.carrier, to: change, reason, user });
      await repo.saveExtraction({ email_id: id, extraction: x.extraction, decision: x.decision,
        checks: { ...x.checks, carrier: { ...rec, carrier: change } }, reply_draft: x.reply_draft, reply_source: x.reply_source });
    }
    await repo.setStatus(id, 'APPROVED');
    await repo.logApproval(id, 'approve', user, change && rec ? { ...who, carrier: change, from: rec.carrier, reason } : who);
    return { code: 200, status: 'APPROVED' };
  }

  // After approval both can happen, in either order: an ALL_CLEAR order goes to the WMS and gets its confirmation.
  // A REJECTED order is in neither list, so both are refused.
  const ready = action === 'send_reply' ? ['APPROVED', 'ENTERED'] : ['APPROVED', 'SENT'];
  if (!ready.includes(email.status)) return { code: 409, error: `${action} needs an approved email (status ${email.status})` };
  if (action === 'send_reply') {
    const to = senderAddress(email.from_addr);
    if (!outbox.allow.has(to)) {
      await repo.logOutbound(id, to, opts.edited ?? x?.reply_draft ?? '', 'refused');
      return { code: 403, error: `${to} is not on the allow-list` };
    }
    if (!outbox.gmail) return { code: 503, error: 'Gmail is not set up (GMAIL_* in .env): reply not sent' };
    const body = opts.edited ?? restore(x?.reply_draft ?? '', email.pii_map ?? {});
    const gmailId = await sendReply(outbox.gmail,
      { to, subject: email.subject, body, threadId: email.thread_id, inReplyTo: email.message_id }, outbox.allow);
    await repo.logOutbound(id, to, body, 'sent', gmailId);
    const status = email.status === 'ENTERED' ? 'ENTERED' : 'SENT';
    await repo.setStatus(id, status);
    await repo.logApproval(id, 'send_reply', user, who);
    return { code: 200, status };
  }
  if (x?.decision !== 'ALL_CLEAR') return { code: 409, error: 'only ALL_CLEAR orders go to the WMS' };
  // Design §5: the order counts as entered only once the WMS has accepted it; without WMS_URL, as before (status only).
  let payload: object = who;
  if (opts.wms) {
    const order = wmsOrder(email, x);
    if (!order) return { code: 409, error: 'the order has no promise, warehouse or carrier to send' };
    if (!opts.orderEvents) return { code: 503, error: 'the order event log is not available' };
    let wmsOrderId: string;
    try {
      ({ wmsOrderId } = await opts.wms.sendOrder(order));
    } catch {
      return { code: 503, error: 'WMS not reachable' };
    }
    const r = await opts.orderEvents({ orderRef: order.orderRef, event: 'wms_entered', detail: { wmsOrderId } });
    // A retry after a lost response finds wms_entered already there: the WMS has the order, so it is entered.
    if (r.code !== 201 && r.code !== 200 && r.error !== 'already recorded') {
      return { code: 503, error: `the WMS entry was not recorded: ${r.error ?? r.code}` };
    }
    payload = { ...who, wmsOrderId };
  }
  await repo.setStatus(id, 'ENTERED');
  await repo.logApproval(id, 'send_to_wms', user, payload);
  return { code: 200, status: 'ENTERED' };
}

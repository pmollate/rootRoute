import { allowList } from '../../core/config.js';
import type { AuthUser, CarrierId, CarrierRecommendation, PromiseResult } from '../../core/contracts.js';
import type { GmailClient } from '../../core/gmail.js';
import { restore } from '../../core/pii/redact.js';
import type { AddressCheck } from './address.js';
import { LINK_PLACEHOLDER, type LinkDeps, mintLink, saveOnApproval } from './link.js';
import { senderAddress, sendReply } from './mailbox.js';
import { replyFactsOf, requiredPhrases, templateReply, withoutLinkPlaceholder } from './reply.js';
import type { EmailRow, ExtractionRow, Repo } from './repo.js';
import { carrierChoices } from './review.js';

export const ACTIONS = ['approve', 'reject', 'send_reply', 'send_to_wms'] as const;
export type Action = (typeof ACTIONS)[number];
export interface ActionResult { code: 200 | 400 | 403 | 404 | 409 | 503; status?: string; error?: string }
export interface Outbox { gmail: Pick<GmailClient, 'sendMessage'> | null; allow: Set<string> }
/** The Carriers module's override log (`logOverride` in modules/carriers/index.ts), the one writer of override_log. */
export type OverrideLog = (o: { orderRef: string; from: string; to: string; reason: string; user: string }) => Promise<number>;
/**
 * `edited`: the operator's own reply text (send_reply). `reason`: why an order is rejected, or why its carrier changes.
 * `carrier`: the supervisor's carrier for an ALL_CLEAR order (approve only). `overrides`: where that change is logged.
 */
export interface ActionOptions { edited?: string; reason?: string; carrier?: CarrierId; overrides?: OverrideLog; link?: LinkDeps }

const MIN_REASON = 3;

/**
 * REQ-LINK-09: a reply holding [CONFIRM_LINK] that gets no link (CONFIRM_LINK off, or no link service) never sends it as
 * text. The placeholder's sentence goes; if that loses a required phrase the text held (a model draft may put the
 * placeholder on the promise line), the fixed template for the same facts is sent instead.
 */
async function withoutLink(repo: Repo, email: EmailRow, x: ExtractionRow | null, text: string): Promise<string> {
  const stripped = withoutLinkPlaceholder(text);
  if (!x) return stripped;
  const from = senderAddress(email.from_addr);
  const client = await repo.clientByDomain(from.split('@')[1] ?? '', from);
  const facts = replyFactsOf({ decision: x.decision, clientName: client?.client_name ?? null, piiMap: email.pii_map ?? {},
    extraction: x.extraction, address: x.checks.address as AddressCheck | null, promise: x.checks.promise as PromiseResult | null });
  const lost = requiredPhrases(facts).some((p) => text.includes(p) && !stripped.includes(p));
  return lost ? restore(templateReply(facts), email.pii_map ?? {}) : stripped;
}

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
    // E19 REQ-LINK-05: a link-confirmed address joins the client's saved addresses only now.
    const saved = opts.link ? await saveOnApproval(opts.link, email, x) : false;
    await repo.logApproval(id, 'approve', user, { ...(change && rec ? { ...who, carrier: change, from: rec.carrier, reason } : who),
      ...(saved ? { savedAddress: 'link' } : {}) });
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
    let body = opts.edited ?? restore(x?.reply_draft ?? '', email.pii_map ?? {});
    // E19 REQ-LINK-01, SEC-LINK-01, -09: only here, after the allow-list and Gmail checks, a CONFIRM_ADDRESS reply's
    // placeholder becomes a new one-time link in the sent text; the stored copy keeps the placeholder, never the token.
    // Text without the placeholder (the operator removed it) is sent as written and mints nothing.
    const link = opts.link?.enabled && x?.decision === 'CONFIRM_ADDRESS' && body.includes(LINK_PLACEHOLDER) ? opts.link : null;
    if (!link && body.includes(LINK_PLACEHOLDER)) body = await withoutLink(repo, email, x, body);
    const sent = link ? await mintLink(link, email, x, user, body) : body;
    let gmailId: string;
    try {
      gmailId = await sendReply(outbox.gmail,
        { to, subject: email.subject, body: sent, threadId: email.thread_id, inReplyTo: email.message_id }, outbox.allow);
    } catch (err) {
      if (link) await link.links.revokeUnused([id], link.now()); // a link nobody received never works
      throw err;
    }
    await repo.logOutbound(id, to, body, 'sent', gmailId);
    const status = email.status === 'ENTERED' ? 'ENTERED' : 'SENT';
    await repo.setStatus(id, status);
    await repo.logApproval(id, 'send_reply', user, who);
    return { code: 200, status };
  }
  if (x?.decision !== 'ALL_CLEAR') return { code: 409, error: 'only ALL_CLEAR orders go to the WMS' };
  await repo.setStatus(id, 'ENTERED');
  await repo.logApproval(id, 'send_to_wms', user, who);
  return { code: 200, status: 'ENTERED' };
}

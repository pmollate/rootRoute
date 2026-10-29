import { allowList } from '../../core/config.js';
import type { AuthUser } from '../../core/contracts.js';
import type { GmailClient } from '../../core/gmail.js';
import { restore } from '../../core/pii/redact.js';
import { senderAddress, sendReply } from './mailbox.js';
import type { Repo } from './repo.js';

export const ACTIONS = ['approve', 'send_reply', 'send_to_wms'] as const;
export type Action = (typeof ACTIONS)[number];
export interface ActionResult { code: 200 | 403 | 404 | 409 | 503; status?: string; error?: string }
export interface Outbox { gmail: Pick<GmailClient, 'sendMessage'> | null; allow: Set<string> }

/**
 * E8 / SEC-03 / SEC-04: nothing leaves without an operator's approval; replies go only to allow-listed addresses,
 * and the names (PII tags) are put back into the reply only now, just before it is sent.
 * `edited` is the operator's own text from the reading pane (names already in place); it replaces the draft.
 * `actor` is the signed-in person from the verified token (REQ-AUTH-07); their name and roles go in the audit payload.
 */
export async function applyAction(repo: Repo, id: number, action: Action, actor: string | AuthUser,
  outbox: Outbox = { gmail: null, allow: allowList }, edited?: string): Promise<ActionResult> {
  const user = typeof actor === 'string' ? actor : actor.id;
  const who = typeof actor === 'string' ? {} : { name: actor.name, roles: actor.roles };
  const email = await repo.getEmail(id);
  if (!email) return { code: 404, error: 'not found' };
  const x = await repo.latestExtraction(id);
  if (action === 'approve') {
    if (email.status !== 'AWAITING_APPROVAL') return { code: 409, error: `cannot approve from ${email.status}` };
    await repo.setStatus(id, 'APPROVED');
    await repo.logApproval(id, 'approve', user, who);
    return { code: 200, status: 'APPROVED' };
  }
  // After approval both can happen, in either order: an ALL_CLEAR order goes to the WMS and gets its confirmation.
  const ready = action === 'send_reply' ? ['APPROVED', 'ENTERED'] : ['APPROVED', 'SENT'];
  if (!ready.includes(email.status)) return { code: 409, error: `${action} needs an approved email (status ${email.status})` };
  if (action === 'send_reply') {
    const to = senderAddress(email.from_addr);
    if (!outbox.allow.has(to)) {
      await repo.logOutbound(id, to, edited ?? x?.reply_draft ?? '', 'refused');
      return { code: 403, error: `${to} is not on the allow-list` };
    }
    if (!outbox.gmail) return { code: 503, error: 'Gmail is not set up (GMAIL_* in .env): reply not sent' };
    const body = edited ?? restore(x?.reply_draft ?? '', email.pii_map ?? {});
    const gmailId = await sendReply(outbox.gmail,
      { to, subject: email.subject, body, threadId: email.thread_id, inReplyTo: email.message_id }, outbox.allow);
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

import { createHash } from 'node:crypto';
import type { CarrierRecommendation, CarriersApi, PromiseResult, WarehouseApi, WarehouseChoice } from '../../core/contracts.js';
import type { GmailClient } from '../../core/gmail.js';
import { LLMError } from '../../core/llm/types.js';
import { PiiError } from '../../core/pii/types.js';
import type { Decision } from './decide.js';
import { senderAddress } from './mailbox.js';
import { type EarlierEmail, type IntakeDeps, readOrder } from './read.js';
import { regionOfState } from './region.js';
import { draftReply, replyFactsOf, templateReply } from './reply.js';
import type { EmailRow, Repo } from './repo.js';

export { mergeExtraction } from './read.js';

export interface IncomingEmail {
  from: string;
  subject: string;
  body: string;
  receivedAt: string;        // local "YYYY-MM-DD HH:mm": the order time (SPEC §5.3)
  inReplyTo?: number;        // pasted reply: the id of the email it answers
  source?: 'gmail' | 'paste';
  gmailId?: string;
  threadId?: string;         // a Gmail message in a thread we already hold is the client's answer
  messageId?: string | null;
}

export interface Deps extends IntakeDeps {
  repo: Repo;
  warehouse: WarehouseApi;
  carriers: CarriersApi;
  gmail: Pick<GmailClient, 'sendMessage' | 'listMessageIds' | 'getMessage'> | null; // null until GMAIL_* is set up
  confirmLink?: boolean; // E19 CONFIRM_LINK=on (REQ-LINK-01, -09); off or absent = no placeholder
}

export interface Processed {
  id: number;
  status: string;
  decision: Decision | null; // null while WAITING
  reason?: string;           // why it is waiting, or UNKNOWN_SENDER
}

/** E16 / REQ-INT-10: the reason returned for an email whose sender domain is not a client's. */
export const UNKNOWN_SENDER = 'unknown sender';

export function emailHash(e: IncomingEmail): string {
  return createHash('sha256').update(`${senderAddress(e.from)}\n${e.body}`).digest('hex');
}

/** The redacted text of the email this one answers, and of the emails before it, for grounding the merged address. */
async function earlierEmail(repo: Repo, email: EmailRow | null): Promise<EarlierEmail | undefined> {
  if (!email) return undefined;
  const extraction = (await repo.latestExtraction(email.id))?.extraction ?? null;
  const texts: string[] = [];
  for (let e: EmailRow | null = email, hops = 0; e && hops < 5; hops += 1) {
    texts.unshift(e.redacted_body ?? '');
    e = e.in_reply_to ? await repo.getEmail(e.in_reply_to) : null;
  }
  return { extraction, source: texts.join('\n') };
}

/**
 * E1-E8: store -> identify -> redact -> extract -> check -> map -> decide -> promise -> warehouse -> carrier -> draft
 * -> await approval. If redaction or the model cannot be reached the email WAITS (nothing unredacted reaches the model);
 * processing it again retries.
 */
export async function processEmail(input: IncomingEmail, deps: Deps): Promise<Processed> {
  const { repo, warehouse, carriers } = deps;
  const hash = emailHash(input);
  const existing = (input.gmailId ? await repo.findByGmailId(input.gmailId) : null) ?? await repo.findByHash(hash);
  if (existing && existing.status !== 'WAITING') {
    return { id: existing.id, status: existing.status, decision: (await repo.latestExtraction(existing.id))?.decision ?? null };
  }

  const from = senderAddress(input.from);
  const client = await repo.clientByDomain(from.split('@')[1] ?? '', from);
  let id: number;
  let answers: EmailRow | null;
  if (existing) {
    id = existing.id;
    answers = existing.in_reply_to ? await repo.getEmail(existing.in_reply_to) : null;
  } else {
    answers = input.inReplyTo ? await repo.getEmail(input.inReplyTo) : input.threadId ? await repo.lastInThread(input.threadId) : null;
    id = await repo.insertEmail({
      source: input.source ?? 'paste', gmail_id: input.gmailId ?? null, thread_id: input.threadId ?? null,
      message_id: input.messageId ?? null, from_addr: from, subject: input.subject, body: input.body, redacted_body: null,
      pii_map: null, received_at: input.receivedAt, in_reply_to: answers?.id ?? null, hash, client_id: client?.client_id ?? null,
    });
  }

  // E16 / REQ-INT-10: an unknown sender is MISSING_INFO at once. No PII call and no model call, so nothing from a
  // stranger reaches an AI service; no automatic reply. The stored draft is the fixed template, for an operator who
  // decides to answer (the allow-list still applies to any send).
  if (!client) {
    const decision = 'MISSING_INFO' as const;
    await repo.saveExtraction({
      email_id: id, extraction: null, decision,
      checks: { address: null, promise: null, warehouse: null, carrier: null },
      reply_draft: templateReply({ decision, clientName: null, contact: null, items: [], promise: null, missing: [],
        candidates: [], address: null, addressIssues: [], suggestion: null }),
      reply_source: 'template',
    });
    await repo.setStatus(id, 'AWAITING_APPROVAL');
    return { id, status: 'AWAITING_APPROVAL', decision, reason: UNKNOWN_SENDER };
  }

  const saved = client ? await repo.savedAddresses(client.client_id) : [];
  let reading;
  try {
    reading = await readOrder(deps, input, client?.client_id ?? null, saved, await earlierEmail(repo, answers));
  } catch (err) {
    const waits = err instanceof PiiError || (err instanceof LLMError && (err.kind === 'transport' || err.kind === 'missing_recording'));
    if (!waits) throw err;
    await repo.setStatus(id, 'WAITING');
    return { id, status: 'WAITING', decision: null, reason: err.message };
  }
  const { redacted, extraction, address, decision } = reading;
  await repo.setRedaction(id, `${redacted.subject}\n\n${redacted.body}`, redacted.replacements);

  const promise: PromiseResult | null = extraction
    ? warehouse.checkPromise(extraction.requested_commitment ?? 'standard', input.receivedAt) : null;
  let warehouseChoice: WarehouseChoice | null = null;
  let carrier: CarrierRecommendation | null = null;
  const region = address?.address ? regionOfState(address.address.state) : null;
  if (decision === 'ALL_CLEAR' && client && region && promise) {
    const nearest = await warehouse.nearestWarehouse(client.client_id, region);
    warehouseChoice = await warehouse.pickWarehouse({ destinationRegion: region, nearestWarehouseId: nearest, stock: {} });
    carrier = await carriers.recommendCarrier({ region, commitment: promise.commitment, slaClause: client.sla_penalty_clause === 'Y' });
  }

  const facts = replyFactsOf({ decision, clientName: client?.client_name ?? null, piiMap: redacted.replacements, extraction,
    address, promise, link: deps.confirmLink });
  const reply = await draftReply(deps.llm, facts);
  await repo.saveExtraction({
    email_id: id, extraction, decision, checks: { address, promise, warehouse: warehouseChoice, carrier },
    reply_draft: reply.text, reply_source: reply.source,
  });
  await repo.setStatus(id, 'AWAITING_APPROVAL');
  return { id, status: 'AWAITING_APPROVAL', decision };
}

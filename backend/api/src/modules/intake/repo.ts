import { pool, query } from '../../core/db/pool.js';
import type { AddressCheck } from './address.js';
import type { Decision } from './decide.js';
import type { LinkRepo, LinkRow } from './link.js';
import type { Extraction, SavedAddress } from './schema.js';

export interface EmailRow {
  id: number;
  source: 'gmail' | 'paste';
  gmail_id: string | null;
  thread_id: string | null;
  message_id: string | null;
  from_addr: string;
  subject: string;
  body: string;
  redacted_body: string | null;               // what the AI model saw
  pii_map: Record<string, string> | null;     // tag -> original value, for restore() after approval
  received_at: string;
  in_reply_to: number | null;
  hash: string;
  client_id: string | null;
  status: string;                             // RECEIVED | WAITING | AWAITING_APPROVAL | APPROVED | SENT | ENTERED | REJECTED
}

export type NewEmail = Omit<EmailRow, 'id' | 'status'>;

/** An inbox row: the email, its latest decision and parsed items, and its client's facts from clients.csv. */
export type ListedEmail = EmailRow & {
  decision: Decision | null; priority: boolean; items: { sku: string; qty: number }[] | null;
  client_name: string | null; account_tier: string | null;
};

export interface ExtractionRow {
  id: number;
  email_id: number;
  extraction: Extraction | null;
  decision: Decision;
  checks: { address: AddressCheck | null; promise: unknown; warehouse: unknown; carrier: unknown };
  reply_draft: string;                        // with PII tags; names go back only when sent
  reply_source: 'model' | 'template';
}

export interface PollRow {
  id: number;
  trigger: 'schedule' | 'button';
  query: string;
  started_at: Date;
  finished_at: Date | null;
  fetched: number;
  processed: number;
  retried: number;
  failed: number;
  ok: boolean | null;
  error: string | null;
}

export type PollResult = Pick<PollRow, 'fetched' | 'processed' | 'retried' | 'failed' | 'ok' | 'error'>;

export interface ClientRow {
  client_id: string; client_name: string; sla_penalty_clause: string; region: string; account_tier: string; account_status: string;
}

export interface Repo {
  /** The sender's own address (client_emails) wins; otherwise the domain (client_domains). */
  clientByDomain(domain: string, address?: string): Promise<ClientRow | null>;
  savedAddresses(clientId: string): Promise<SavedAddress[]>;
  findByHash(hash: string): Promise<EmailRow | null>;
  findByGmailId(gmailId: string): Promise<EmailRow | null>;
  /** The most recent email already stored in a Gmail thread: a new message there is the client's answer to it. */
  lastInThread(threadId: string): Promise<EmailRow | null>;
  getEmail(id: number): Promise<EmailRow | null>;
  insertEmail(e: NewEmail): Promise<number>;
  setStatus(id: number, status: string): Promise<void>;
  setRedaction(id: number, redacted: string, piiMap: Record<string, string>): Promise<void>;
  saveExtraction(r: Omit<ExtractionRow, 'id'>): Promise<void>;
  latestExtraction(emailId: number): Promise<ExtractionRow | null>;
  listEmails(): Promise<ListedEmail[]>;
  logApproval(emailId: number, action: string, user: string, payload?: object): Promise<void>;
  /** Any other audited write: actor is a user id or system:intake (REQ-AUTH-07, SEC-AUTH-10). */
  logAudit(actor: string, action: string, ref: string, payload?: object): Promise<void>;
  logOutbound(emailId: number, to: string, body: string, status: 'sent' | 'refused', gmailId?: string | null): Promise<void>;
  /** Emails parked because PII detection, the model or the map could not be reached; the next poll runs them again. */
  waitingEmails(): Promise<EmailRow[]>;
  /** Start of the last successful Gmail check, in seconds since the epoch; null before the first one. */
  lastPollStart(): Promise<number | null>;
  lastPoll(): Promise<PollRow | null>;
  startPoll(trigger: PollRow['trigger'], query: string): Promise<number>;
  finishPoll(id: number, result: PollResult): Promise<void>;
  /** Runs fn only if no other Gmail check holds the lock (another click, timer or app instance); else null. */
  withPollLock<T>(fn: () => Promise<T>): Promise<T | null>;
}

const POLL_LOCK = 7_301_015; // any fixed number, shared by every instance of the API

/**
 * A client's saved addresses in a stable order: the seed's rows first, in the seed file's order, then addresses confirmed
 * through the E19 link, oldest first. A re-seed gives seed rows new, higher ids than kept link rows; ordering by id alone
 * would move the link rows first and change the candidates in replies, prompts and recordings (REQ-LINK-05).
 */
export const SAVED_ADDRESSES_SQL = `SELECT id, client_id, label, line1, line2, city, state, zip FROM saved_addresses
  WHERE client_id = $1 ORDER BY source = 'link', id`;

const one = async <T extends object>(sql: string, params: unknown[]): Promise<T | null> => (await query<T>(sql, params))[0] ?? null;

export const repo: Repo = {
  clientByDomain: (domain, address = '') => one<ClientRow>(
    `SELECT c.client_id, c.client_name, c.sla_penalty_clause, c.region, c.account_tier, c.account_status
       FROM clients c
       JOIN (SELECT client_id, 0 AS rank FROM client_emails WHERE email = $2
             UNION ALL SELECT client_id, 1 FROM client_domains WHERE domain = $1) m ON m.client_id = c.client_id
      ORDER BY m.rank LIMIT 1`, [domain.toLowerCase(), address.toLowerCase()]),
  savedAddresses: (clientId) => query<SavedAddress>(SAVED_ADDRESSES_SQL, [clientId]),
  findByHash: (hash) => one<EmailRow>('SELECT * FROM intake_emails WHERE hash = $1', [hash]),
  findByGmailId: (gmailId) => one<EmailRow>('SELECT * FROM intake_emails WHERE gmail_id = $1', [gmailId]),
  lastInThread: (threadId) => one<EmailRow>('SELECT * FROM intake_emails WHERE thread_id = $1 ORDER BY id DESC LIMIT 1', [threadId]),
  getEmail: (id) => one<EmailRow>('SELECT * FROM intake_emails WHERE id = $1', [id]),
  async insertEmail(e) {
    const rows = await query<{ id: number }>(
      `INSERT INTO intake_emails (source, gmail_id, thread_id, message_id, from_addr, subject, body, redacted_body, pii_map,
                                  received_at, in_reply_to, hash, client_id, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'RECEIVED') RETURNING id`,
      [e.source, e.gmail_id, e.thread_id, e.message_id, e.from_addr, e.subject, e.body, e.redacted_body,
        e.pii_map && JSON.stringify(e.pii_map), e.received_at, e.in_reply_to, e.hash, e.client_id],
    );
    return rows[0].id;
  },
  async setStatus(id, status) {
    await query('UPDATE intake_emails SET status = $2 WHERE id = $1', [id, status]);
  },
  async setRedaction(id, redacted, piiMap) {
    await query('UPDATE intake_emails SET redacted_body = $2, pii_map = $3 WHERE id = $1', [id, redacted, JSON.stringify(piiMap)]);
  },
  async saveExtraction(r) {
    await query(
      'INSERT INTO intake_extractions (email_id, extraction, decision, checks, reply_draft, reply_source) VALUES ($1,$2,$3,$4,$5,$6)',
      [r.email_id, JSON.stringify(r.extraction), r.decision, JSON.stringify(r.checks), r.reply_draft, r.reply_source],
    );
  },
  latestExtraction: (emailId) =>
    one<ExtractionRow>('SELECT * FROM intake_extractions WHERE email_id = $1 ORDER BY id DESC LIMIT 1', [emailId]),
  /** REQ-PRI-01: Tier 1 and at-risk clients first, then newest first. Same rule as isPriority(). */
  listEmails: () => query<ListedEmail>(
    `SELECT e.*, (SELECT x.decision FROM intake_extractions x WHERE x.email_id = e.id ORDER BY x.id DESC LIMIT 1) AS decision,
            (SELECT x.extraction -> 'items' FROM intake_extractions x WHERE x.email_id = e.id ORDER BY x.id DESC LIMIT 1) AS items,
            coalesce(c.account_tier = 'Tier 1' OR c.account_status = 'threatening_to_leave', false) AS priority,
            c.client_name, c.account_tier
       FROM intake_emails e LEFT JOIN clients c ON c.client_id = e.client_id
      ORDER BY priority DESC, e.id DESC LIMIT 200`, []),
  async logApproval(emailId, action, user, payload = {}) {
    await repo.logAudit(user, action, `email:${emailId}`, payload);
  },
  async logAudit(actor, action, ref, payload = {}) {
    await query('INSERT INTO audit_log (actor, action, ref, payload) VALUES ($1,$2,$3,$4)', [actor, action, ref, JSON.stringify(payload)]);
  },
  async logOutbound(emailId, to, body, status, gmailId = null) {
    await query('INSERT INTO outbound_messages (email_id, to_addr, body, gmail_id, status) VALUES ($1,$2,$3,$4,$5)',
      [emailId, to, body, gmailId, status]);
  },
  waitingEmails: () => query<EmailRow>("SELECT * FROM intake_emails WHERE status = 'WAITING' ORDER BY id", []),
  async lastPollStart() {
    const row = await one<{ s: number }>(
      'SELECT extract(epoch FROM started_at)::float8 AS s FROM intake_polls WHERE ok ORDER BY started_at DESC LIMIT 1', []);
    return row ? Math.floor(row.s) : null;
  },
  lastPoll: () => one<PollRow>(
    `SELECT id, trigger, query, started_at, finished_at, fetched, processed, retried, failed, ok, error
       FROM intake_polls ORDER BY id DESC LIMIT 1`, []),
  async startPoll(trigger, q) {
    return (await query<{ id: number }>('INSERT INTO intake_polls (trigger, query) VALUES ($1,$2) RETURNING id', [trigger, q]))[0].id;
  },
  async finishPoll(id, r) {
    await query(
      `UPDATE intake_polls SET finished_at = now(), fetched = $2, processed = $3, retried = $4, failed = $5, ok = $6, error = $7
        WHERE id = $1`, [id, r.fetched, r.processed, r.retried, r.failed, r.ok, r.error]);
  },
  // A session lock lives on one connection, so it is taken and released on a dedicated client.
  async withPollLock(fn) {
    const client = await pool.connect();
    try {
      const { rows } = await client.query<{ ok: boolean }>('SELECT pg_try_advisory_lock($1) AS ok', [POLL_LOCK]);
      if (!rows[0].ok) return null;
      try {
        return await fn();
      } finally {
        await client.query('SELECT pg_advisory_unlock($1)', [POLL_LOCK]);
      }
    } finally {
      client.release();
    }
  },
};

/** Migration 103 (E19). Only the token's hash is ever read or written (SEC-LINK-01). */
export const linkRepo: LinkRepo = {
  async orderEmailIds(emailId) {
    const rows = await query<{ id: number }>(
      `WITH RECURSIVE up AS (
         SELECT id, in_reply_to FROM intake_emails WHERE id = $1
         UNION ALL SELECT e.id, e.in_reply_to FROM intake_emails e JOIN up ON e.id = up.in_reply_to),
       down AS (
         SELECT id FROM up WHERE in_reply_to IS NULL
         UNION ALL SELECT e.id FROM intake_emails e JOIN down ON e.in_reply_to = down.id)
       SELECT id FROM down ORDER BY id`, [emailId]);
    return rows.map((r) => r.id);
  },
  async revokeUnused(ids, at) {
    return (await query<{ id: number }>(
      `UPDATE address_confirm_tokens SET revoked_at = $2
        WHERE email_id = ANY($1::int[]) AND used_at IS NULL AND revoked_at IS NULL RETURNING id`, [ids, at])).length;
  },
  async insert(l) {
    return (await query<{ id: number }>(
      `INSERT INTO address_confirm_tokens (token_hash, email_id, issued_at, expires_at, issued_by, prefill, synthetic)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [l.token_hash, l.email_id, l.issued_at, l.expires_at, l.issued_by, JSON.stringify(l.prefill), l.synthetic]))[0].id;
  },
  byHash: (h) => one<LinkRow>('SELECT * FROM address_confirm_tokens WHERE token_hash = $1', [h]),
  async countLookup(id) {
    return (await query<{ n: number }>(
      'UPDATE address_confirm_tokens SET map_lookups = map_lookups + 1 WHERE id = $1 RETURNING map_lookups AS n', [id]))[0].n;
  },
  async setReading(id, reading) {
    await query('UPDATE address_confirm_tokens SET map_reading = $2 WHERE id = $1', [id, JSON.stringify(reading)]);
  },
  // Single use under concurrency: the WHERE clause, not a read-then-write, decides who confirms (SEC-LINK-02).
  async markUsed(id, address, pin, reading, at) {
    return (await query<{ id: number }>(
      `UPDATE address_confirm_tokens SET used_at = $5, confirmed_address = $2, lat = $3, lon = $4, map_reading = $6
        WHERE id = $1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > $5 RETURNING id`,
      [id, JSON.stringify(address), pin.lat, pin.lon, at, reading && JSON.stringify(reading)])).length === 1;
  },
  async newestFor(ids) {
    const rows = await query<LinkRow>(
      'SELECT DISTINCT ON (email_id) * FROM address_confirm_tokens WHERE email_id = ANY($1::int[]) ORDER BY email_id, id DESC', [ids]);
    return new Map(rows.map((r) => [r.email_id, r]));
  },
  async saveAddress(a) {
    await query(
      `INSERT INTO saved_addresses (client_id, label, line1, line2, city, state, zip, synthetic, source, lat, lon, email_id, confirmed_at)
       VALUES ($1,'Confirmed by client link',$2,$3,$4,$5,$6,$7,'link',$8,$9,$10,$11)`,
      [a.clientId, a.address.line1, a.address.line2, a.address.city, a.address.state, a.address.zip, a.synthetic,
        a.pin.lat, a.pin.lon, a.emailId, a.confirmedAt]);
  },
};

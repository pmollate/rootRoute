import { query } from '../../core/db/pool.js';
import type { AddressCheck } from './address.js';
import type { Decision } from './decide.js';
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
  status: string;                             // RECEIVED | WAITING | AWAITING_APPROVAL | APPROVED | SENT | ENTERED
}

export type NewEmail = Omit<EmailRow, 'id' | 'status'>;

export interface ExtractionRow {
  id: number;
  email_id: number;
  extraction: Extraction | null;
  decision: Decision;
  checks: { address: AddressCheck | null; promise: unknown; warehouse: unknown; carrier: unknown };
  reply_draft: string;                        // with PII tags; names go back only when sent
  reply_source: 'model' | 'template';
}

export interface ClientRow {
  client_id: string; client_name: string; sla_penalty_clause: string; region: string; account_tier: string; account_status: string;
}

export interface Repo {
  clientByDomain(domain: string): Promise<ClientRow | null>;
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
  listEmails(): Promise<(EmailRow & { decision: Decision | null; priority: boolean })[]>;
  logApproval(emailId: number, action: string, user: string): Promise<void>;
  logOutbound(emailId: number, to: string, body: string, status: 'sent' | 'refused', gmailId?: string | null): Promise<void>;
}

const one = async <T extends object>(sql: string, params: unknown[]): Promise<T | null> => (await query<T>(sql, params))[0] ?? null;

export const repo: Repo = {
  clientByDomain: (domain) => one<ClientRow>(
    `SELECT c.client_id, c.client_name, c.sla_penalty_clause, c.region, c.account_tier, c.account_status
       FROM client_domains d JOIN clients c ON c.client_id = d.client_id WHERE d.domain = $1`, [domain.toLowerCase()]),
  savedAddresses: (clientId) =>
    query<SavedAddress>('SELECT id, client_id, label, line1, line2, city, state, zip FROM saved_addresses WHERE client_id = $1 ORDER BY id', [clientId]),
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
  listEmails: () => query<EmailRow & { decision: Decision | null; priority: boolean }>(
    `SELECT e.*, (SELECT x.decision FROM intake_extractions x WHERE x.email_id = e.id ORDER BY x.id DESC LIMIT 1) AS decision,
            coalesce(c.account_tier = 'Tier 1' OR c.account_status = 'threatening_to_leave', false) AS priority
       FROM intake_emails e LEFT JOIN clients c ON c.client_id = e.client_id
      ORDER BY priority DESC, e.id DESC LIMIT 200`, []),
  async logApproval(emailId, action, user) {
    await query('INSERT INTO audit_log (actor, action, ref, payload) VALUES ($1,$2,$3,$4)', [user, action, `email:${emailId}`, '{}']);
  },
  async logOutbound(emailId, to, body, status, gmailId = null) {
    await query('INSERT INTO outbound_messages (email_id, to_addr, body, gmail_id, status) VALUES ($1,$2,$3,$4,$5)',
      [emailId, to, body, gmailId, status]);
  },
};

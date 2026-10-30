import type { ClientRow, EmailRow, ExtractionRow, PollRow, Repo } from '../../src/modules/intake/repo.js';
import type { SavedAddress } from '../../src/modules/intake/schema.js';

/** In-memory stand-in for the intake repo, so pipeline logic is tested without Postgres. */
export function memoryRepo(clients: Record<string, ClientRow>, saved: SavedAddress[]) {
  const emails: EmailRow[] = [];
  const extractions: ExtractionRow[] = [];
  const outbound: { emailId: number; to: string; body: string; status: string; gmailId: string | null }[] = [];
  const audit: { emailId?: number; ref: string; action: string; user: string; payload?: object }[] = [];
  const polls: PollRow[] = [];
  const lock = { held: false };
  let clock = Date.UTC(2026, 9, 28, 10, 0); // poll start times; tests move it with `advance`
  const repo: Repo = {
    clientByDomain: async (domain, address = '') => clients[address.toLowerCase()] ?? clients[domain] ?? null,
    savedAddresses: async (clientId) => saved.filter((s) => s.client_id === clientId),
    findByHash: async (hash) => emails.find((e) => e.hash === hash) ?? null,
    findByGmailId: async (gmailId) => emails.find((e) => e.gmail_id === gmailId) ?? null,
    lastInThread: async (threadId) => [...emails].reverse().find((e) => e.thread_id === threadId) ?? null,
    getEmail: async (id) => emails.find((e) => e.id === id) ?? null,
    insertEmail: async (e) => { const id = emails.length + 1; emails.push({ ...e, id, status: 'RECEIVED' }); return id; },
    setStatus: async (id, status) => { emails.find((e) => e.id === id)!.status = status; },
    setRedaction: async (id, redacted, piiMap) => {
      const e = emails.find((x) => x.id === id)!;
      e.redacted_body = redacted;
      e.pii_map = piiMap;
    },
    saveExtraction: async (r) => { extractions.push({ ...r, id: extractions.length + 1 }); },
    latestExtraction: async (id) => [...extractions].reverse().find((x) => x.email_id === id) ?? null,
    listEmails: async () => emails.map((e) => ({ ...e, decision: null, priority: false, items: null, client_name: null,
      account_tier: null })),
    logApproval: async (emailId, action, user, payload) => { audit.push({ emailId, ref: `email:${emailId}`, action, user, payload }); },
    logAudit: async (user, action, ref, payload) => { audit.push({ ref, action, user, payload }); },
    logOutbound: async (emailId, to, body, status, gmailId = null) => { outbound.push({ emailId, to, body, status, gmailId }); },
    replySent: async (emailId) => outbound.some((o) => o.emailId === emailId && o.status === 'sent'),
    waitingEmails: async () => emails.filter((e) => e.status === 'WAITING'),
    lastPollStart: async () => {
      const ok = polls.filter((p) => p.ok).at(-1);
      return ok ? Math.floor(ok.started_at.getTime() / 1000) : null;
    },
    lastPoll: async () => polls.at(-1) ?? null,
    startPoll: async (trigger, query) => {
      polls.push({ id: polls.length + 1, trigger, query, started_at: new Date(clock), finished_at: null, fetched: 0,
        processed: 0, retried: 0, failed: 0, ok: null, error: null });
      return polls.length;
    },
    finishPoll: async (id, r) => { Object.assign(polls[id - 1], r, { finished_at: new Date(clock) }); },
    withPollLock: async (fn) => {
      if (lock.held) return null;
      lock.held = true;
      try {
        return await fn();
      } finally {
        lock.held = false;
      }
    },
  };
  const advance = (minutes: number) => { clock += minutes * 60_000; };
  return { repo, emails, extractions, outbound, audit, polls, lock, advance };
}

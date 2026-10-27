import type { ClientRow, EmailRow, ExtractionRow, Repo } from '../../src/modules/intake/repo.js';
import type { SavedAddress } from '../../src/modules/intake/schema.js';

/** In-memory stand-in for the intake repo, so pipeline logic is tested without Postgres. */
export function memoryRepo(clients: Record<string, ClientRow>, saved: SavedAddress[]) {
  const emails: EmailRow[] = [];
  const extractions: ExtractionRow[] = [];
  const outbound: { emailId: number; to: string; body: string; status: string; gmailId: string | null }[] = [];
  const audit: { emailId: number; action: string; user: string }[] = [];
  const repo: Repo = {
    clientByDomain: async (domain) => clients[domain] ?? null,
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
    listEmails: async () => emails.map((e) => ({ ...e, decision: null, priority: false })),
    logApproval: async (emailId, action, user) => { audit.push({ emailId, action, user }); },
    logOutbound: async (emailId, to, body, status, gmailId = null) => { outbound.push({ emailId, to, body, status, gmailId }); },
  };
  return { repo, emails, extractions, outbound, audit };
}

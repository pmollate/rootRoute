import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { pool, query } from '../../src/core/db/pool.js';
import { setDeps } from '../../src/modules/intake/deps.js';
import { buildApp } from '../../src/server.js';
import { hasDb } from '../db.js';
import { loadFixtures } from '../intake/fixtures.js';

// The real chain over HTTP with recorded Azure answers (PII, model, map) and B's and C's real warehouse and carrier code.
describe.skipIf(!hasDb)('intake routes (needs test database)', () => {
  let app: FastifyInstance;
  const fx = Object.fromEntries(loadFixtures().map((f) => [f.gold.id, f]));
  const post = (url: string, payload: object, key = 'test-key') =>
    app.inject({ method: 'POST', url, payload, headers: { 'x-api-key': key } });
  const paste = (id: string) => post('/api/intake/email', { from: fx[id].gold.from, subject: fx[id].subject, body: fx[id].body,
    receivedAt: fx[id].gold.received_at });

  beforeAll(async () => {
    await query('TRUNCATE intake_extractions, outbound_messages, intake_emails, recommendations RESTART IDENTITY CASCADE');
    setDeps({ gmail: null });
    app = await buildApp();
  });
  afterAll(() => pool.end());

  it('AC-INT-06: C190 without street and ZIP gets CONFIRM_ADDRESS and a draft offering its saved addresses', async () => {
    const r = (await paste('34')).json();
    expect(r).toMatchObject({ status: 'AWAITING_APPROVAL', decision: 'CONFIRM_ADDRESS' });
    const d = (await app.inject({ method: 'GET', url: `/api/intake/${r.id}` })).json();
    expect(d.checks.address.missing).toEqual(['address.line1', 'address.zip']);
    for (const phrase of ['street address', 'ZIP code', '55 Trinity Ave SW', '400 S Orange Ave', '25 Oct 2026']) {
      expect(d.replyDraft).toContain(phrase);
    }
    expect(d.email.redactedBody).not.toContain('Sam Kowalski');
    expect(d.replyDraft).toContain('Hello Sam Kowalski,');
  });

  it('an ALL_CLEAR order gets a warehouse and a carrier, and goes to the WMS only after approval (AC-SEC-04)', async () => {
    const r = (await paste('02')).json();
    expect(r.decision).toBe('ALL_CLEAR');
    const d = (await app.inject({ method: 'GET', url: `/api/intake/${r.id}` })).json();
    expect(d.checks.warehouse.warehouseId).toMatch(/^W\d$/);
    expect(d.checks.carrier.carrier).toMatch(/^[A-F]$/);
    const act = (action: string) => post(`/api/intake/${r.id}/action`, { action, user: 'ops' });
    expect((await act('send_to_wms')).statusCode).toBe(409);
    expect((await act('approve')).json()).toEqual({ status: 'APPROVED' });
    expect((await act('send_to_wms')).json()).toEqual({ status: 'ENTERED' });
  });

  it('lists priority clients first, and dedupes a pasted email', async () => {
    const again = (await paste('34')).json();
    const list = (await app.inject({ method: 'GET', url: '/api/intake' })).json().emails;
    expect(list).toHaveLength(2);
    // C190 (Tier 1, threatening to leave) first, although the fixture 02 email is newer.
    expect(list.map((e: { id: number; priority: boolean }) => [e.id, e.priority])).toEqual([[again.id, true], [2, false]]);
  });

  it('AC-SEC-03: no reply to an address off the allow-list; writes need the key', async () => {
    const r = (await paste('02')).json(); // client004: approved and in the WMS above, not on the allow-list
    const refused = await post(`/api/intake/${r.id}/action`, { action: 'send_reply', user: 'ops' });
    expect(refused.statusCode).toBe(403);
    const log = await query<{ status: string }>('SELECT status FROM outbound_messages WHERE email_id = $1', [r.id]);
    expect(log.map((x) => x.status)).toEqual(['refused']);
    const own = (await paste('34')).json();
    await post(`/api/intake/${own.id}/action`, { action: 'approve', user: 'ops' });
    expect((await post(`/api/intake/${own.id}/action`, { action: 'send_reply', user: 'ops' })).statusCode).toBe(503);
    expect((await post('/api/intake/email', {}, 'wrong')).statusCode).toBe(401);
  });

  it('AC-INT-08: "Fetch from Gmail" runs the poll: stores new mail once, records each check, and the list shows the last one', async () => {
    await query('TRUNCATE intake_polls RESTART IDENTITY');
    expect((await post('/api/intake/fetch', {})).statusCode).toBe(503); // Gmail not set up
    const f = fx['29'];
    const msg = { id: 'g-29', threadId: 't-29', internalDate: String(Date.UTC(2026, 9, 28, 13, 0)), payload: {
      mimeType: 'text/plain', headers: [{ name: 'From', value: f.gold.from }, { name: 'Subject', value: f.subject },
        { name: 'Message-ID', value: '<g-29@client.example>' }], body: { data: Buffer.from(f.body).toString('base64url') } } };
    const queries: string[] = [];
    setDeps({ gmail: { listMessageIds: async (q: string) => { queries.push(q); return ['g-29']; }, getMessage: async () => msg,
      sendMessage: async () => 'out' } });
    try {
      const first = (await post('/api/intake/fetch', {})).json();
      expect(first).toMatchObject({ fetched: 1, processed: 1, ok: true });
      const again = (await post('/api/intake/fetch', {})).json();
      expect(again).toMatchObject({ fetched: 1, processed: 0, ok: true });
      expect(queries[1]).toMatch(/^in:inbox -from:me after:\d+$/);
      const stored = await query('SELECT id FROM intake_emails WHERE gmail_id = $1', ['g-29']);
      expect(stored).toHaveLength(1);
      const polls = await query<{ trigger: string; ok: boolean }>('SELECT trigger, ok FROM intake_polls ORDER BY id');
      expect(polls).toEqual([{ trigger: 'button', ok: true }, { trigger: 'button', ok: true }]);
      const list = (await app.inject({ method: 'GET', url: '/api/intake' })).json();
      expect(list.pollMinutes).toBe(0); // INTAKE_POLL_MINUTES=0 in tests
      expect(list.lastPoll).toMatchObject({ trigger: 'button', processed: 0, ok: true });
    } finally {
      setDeps({ gmail: null });
    }
  });
});

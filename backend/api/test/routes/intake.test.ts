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
    await query('TRUNCATE intake_extractions, outbound_messages, intake_emails RESTART IDENTITY CASCADE');
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
    const r = (await paste('02')).json();
    await post(`/api/intake/${r.id}/action`, { action: 'approve', user: 'ops' });
    expect((await post(`/api/intake/${r.id}/action`, { action: 'send_reply', user: 'ops' })).statusCode).toBe(409);
    const own = (await paste('34')).json();
    await post(`/api/intake/${own.id}/action`, { action: 'approve', user: 'ops' });
    expect((await post(`/api/intake/${own.id}/action`, { action: 'send_reply', user: 'ops' })).statusCode).toBe(503);
    expect((await post('/api/intake/email', {}, 'wrong')).statusCode).toBe(401);
  });
});

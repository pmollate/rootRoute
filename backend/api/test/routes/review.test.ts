import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { pool, query } from '../../src/core/db/pool.js';
import { setDeps } from '../../src/modules/intake/deps.js';
import { buildApp } from '../../src/server.js';
import { hasDb } from '../db.js';
import { loadFixtures } from '../intake/fixtures.js';
import { AUTH_ON, bearer } from '../token.js';

interface Choice { carrier: string }
interface Order { id: number; carrier: string; choices: Choice[]; blocked: string[] }

// Fixture 02 (client004, WA, ALL_CLEAR) through the real chain: recorded PII/model/map answers, B's and C's real code.
describe.skipIf(!hasDb)('order review over HTTP (needs test database)', () => {
  let app: FastifyInstance;
  const f = loadFixtures().find((x) => x.gold.id === '02')!;
  const desk = () => bearer({ sub: 'u1', name: 'Una Desk', roles: ['order_desk'] });
  const paste = async () => (await app.inject({ method: 'POST', url: '/api/intake/email', headers: await desk(),
    payload: { from: f.gold.from, subject: f.subject, body: f.body, receivedAt: f.gold.received_at } })).json() as { id: number; decision: string };
  const act = async (id: number, payload: object, headers?: Record<string, string>) =>
    app.inject({ method: 'POST', url: `/api/intake/${id}/action`, headers: headers ?? await desk(), payload });
  const review = async () => ((await app.inject({ method: 'GET', url: '/api/intake/review', headers: await desk() })).json() as { orders: Order[] }).orders;

  // Email ids restart at 1 in every test, and override_log (C's table) keeps rows from earlier runs: read only newer rows.
  let since = 0;
  beforeAll(async () => { setDeps({ gmail: null }); app = await buildApp({ auth: AUTH_ON }); });
  beforeEach(async () => {
    await query('TRUNCATE intake_extractions, outbound_messages, intake_emails RESTART IDENTITY CASCADE');
    since = (await query<{ m: number }>('SELECT coalesce(max(id), 0)::int AS m FROM override_log'))[0].m;
  });
  afterAll(async () => { await app.close(); await pool.end(); });

  it('AC-INT-15, AC-AUTH-14: unblocked carriers only; order_desk approves another carrier, logged once with that user', async () => {
    const r = await paste();
    expect(r.decision).toBe('ALL_CLEAR');
    const o = (await review()).find((x) => x.id === r.id)!;
    const offered = o.choices.map((c) => c.carrier);
    for (const b of o.blocked) expect(offered).not.toContain(b);
    if (o.blocked[0]) expect((await act(r.id, { action: 'approve', carrier: o.blocked[0], reason: 'cheaper' })).statusCode).toBe(409);
    const other = o.choices.find((c) => c.carrier !== o.carrier)!;
    expect((await act(r.id, { action: 'approve', carrier: other.carrier, reason: 'client asked for this carrier' })).json())
      .toEqual({ status: 'APPROVED' });
    const rows = await query<{ from_carrier: string; to_carrier: string; user_name: string }>(
      'SELECT from_carrier, to_carrier, user_name FROM override_log WHERE order_ref = $1 AND id > $2', [`email:${r.id}`, since]);
    expect(rows).toEqual([{ from_carrier: o.carrier, to_carrier: other.carrier, user_name: 'u1' }]);
    const d = (await app.inject({ method: 'GET', url: `/api/intake/${r.id}`, headers: await desk() })).json();
    expect(d.checks.carrier.carrier).toBe(other.carrier);
    expect((await review()).map((x) => x.id)).not.toContain(r.id);
  });

  it('AC-INT-14: reject with a reason sets REJECTED, audit_log has the reason and user, and the WMS refuses it', async () => {
    const r = await paste();
    expect((await act(r.id, { action: 'reject' })).statusCode).toBe(400);
    expect((await act(r.id, { action: 'reject', reason: 'client cancelled by phone' })).json()).toEqual({ status: 'REJECTED' });
    const [row] = await query<{ actor: string; reason: string }>(
      "SELECT actor, payload->>'reason' AS reason FROM audit_log WHERE ref = $1 AND action = 'reject' ORDER BY id DESC LIMIT 1", [`email:${r.id}`]);
    expect(row).toEqual({ actor: 'u1', reason: 'client cancelled by phone' });
    const wms = await act(r.id, { action: 'send_to_wms' }, await bearer({ sub: 'w1', roles: ['warehouse_supervisor'] }));
    expect(wms.statusCode).toBe(409);
  });

  it('REQ-AUTH-05: leadership cannot reject', async () => {
    const r = await paste();
    const lead = await bearer({ sub: 'boss', roles: ['leadership'] });
    expect((await act(r.id, { action: 'reject', reason: 'no' }, lead)).statusCode).toBe(403);
  });
});

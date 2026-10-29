import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { PERMISSIONS, ROLES, rolesFor } from '../../src/core/permissions.js';
import { pool, query } from '../../src/core/db/pool.js';
import { ACTIONS } from '../../src/modules/intake/actions.js';
import { setDeps } from '../../src/modules/intake/deps.js';
import { buildApp } from '../../src/server.js';
import { hasDb } from '../db.js';
import { loadFixtures } from '../intake/fixtures.js';
import { AUTH_ON, bearer } from '../token.js';

afterAll(() => pool.end());

describe('permission matrix (SPEC-auth §4.2)', () => {
  it('AC-AUTH-06: every registered route, and every action of /intake/:id/action, has an entry', async () => {
    const routes: string[] = [];
    const a = await buildApp({ auth: AUTH_ON, onRoute: (method, url) => routes.push(`${method} ${url}`) });
    await a.close();
    expect(routes.length).toBeGreaterThan(20);
    const missing = routes.filter((r) => !(r in PERMISSIONS));
    expect(missing, 'routes with no entry in core/permissions.ts').toEqual([]);
    const byAction = PERMISSIONS['POST /api/intake/:id/action'];
    expect(typeof byAction === 'object' && 'byAction' in byAction).toBe(true);
    for (const action of ACTIONS) expect(rolesFor('POST', '/api/intake/:id/action', { action }), action).not.toBeNull();
  });

  it('AC-AUTH-06: a route added without an entry is refused for an admin, and the check above names it', async () => {
    const routes: string[] = [];
    const a = await buildApp({ auth: AUTH_ON, onRoute: (method, url) => routes.push(`${method} ${url}`) });
    a.post('/api/zz-unlisted', async () => ({ ok: true }));
    const r = await a.inject({ method: 'POST', url: '/api/zz-unlisted', headers: await bearer({ sub: 'a1', roles: ['admin'] }) });
    expect(r.statusCode).toBe(403);
    expect(routes.filter((x) => !(x in PERMISSIONS))).toEqual(['POST /api/zz-unlisted']);
    await a.close();
  });

  it('REQ-AUTH-05: the matrix matches SPEC-auth §4.2, including Q-AUTH-03 (send_to_wms) and default deny', () => {
    const who = (method: string, url: string, body?: object) => rolesFor(method, url, body);
    expect(who('GET', '/api/overview')).toEqual(ROLES);
    expect(who('GET', '/api/health')).toBe('public');
    expect(who('POST', '/api/mcp')).toBe('public');
    expect(who('POST', '/api/intake/:id/action', { action: 'approve' })).toEqual(['order_desk', 'admin']);
    expect(who('POST', '/api/intake/:id/action', { action: 'reject' })).toEqual(['order_desk', 'admin']);
    expect(who('POST', '/api/intake/:id/action', { action: 'send_reply' })).toEqual(['order_desk', 'admin']);
    expect(who('POST', '/api/intake/:id/action', { action: 'send_to_wms' })).toEqual(['warehouse_supervisor', 'admin']);
    expect(who('POST', '/api/intake/:id/action', { action: 'drop_table' })).toBeNull();
    expect(who('POST', '/api/intake/:id/action', {})).toBeNull();
    expect(who('POST', '/api/intake/email')).toEqual(['order_desk', 'admin']);
    expect(who('POST', '/api/intake/fetch')).toEqual(['order_desk', 'admin']);
    expect(who('POST', '/api/orders')).toEqual(['order_desk', 'admin']);
    expect(who('POST', '/api/recommend')).toEqual(['carrier_manager', 'admin']);
    expect(who('POST', '/api/overrides')).toEqual(['carrier_manager', 'admin']);
    expect(who('POST', '/api/complaints/:id/triage')).toEqual(['customer_support', 'admin']);
    expect(who('POST', '/api/alerts/run')).toEqual(['customer_support', 'admin']);
    expect(who('DELETE', '/api/overrides')).toBeNull();
    expect(who('GET', '/api/not-a-route')).toBeNull();
    for (const [key, p] of Object.entries(PERMISSIONS)) {
      if (p === 'public' || !('roles' in p)) continue;
      if (key.startsWith('POST ')) expect(p.roles, key).not.toContain('leadership');
    }
  });

  it('AC-AUTH-14: an order_desk user cannot override a carrier directly', async () => {
    const a = await buildApp({ auth: AUTH_ON });
    const r = await a.inject({ method: 'POST', url: '/api/overrides', headers: await bearer({ sub: 'u1', roles: ['order_desk'] }),
      payload: { orderRef: 'ORD-1', from: 'E', to: 'A', reason: 'client asked for A' } });
    expect(r.statusCode).toBe(403);
    await a.close();
  });
});

describe.skipIf(!hasDb)('roles and actors over HTTP (needs test database)', () => {
  let app: FastifyInstance;
  const fx = Object.fromEntries(loadFixtures().map((f) => [f.gold.id, f]));
  const as = async (sub: string, roles: string[], name = sub) => bearer({ sub, name, roles });
  const paste = async (id: string) => (await app.inject({ method: 'POST', url: '/api/intake/email',
    headers: await as('desk', ['order_desk']), payload: { from: fx[id].gold.from, subject: fx[id].subject, body: fx[id].body,
      receivedAt: fx[id].gold.received_at } })).json() as { id: number; decision: string };
  const act = async (id: number, action: string, headers: Record<string, string>, extra: object = {}) =>
    app.inject({ method: 'POST', url: `/api/intake/${id}/action`, headers, payload: { action, ...extra } });
  const counts = async () => (await query<{ e: number; a: number; o: number }>(
    `SELECT (SELECT count(*) FROM intake_emails)::int AS e, (SELECT count(*) FROM audit_log)::int AS a,
            (SELECT count(*) FROM override_log)::int AS o`))[0];

  beforeAll(async () => {
    await query('TRUNCATE intake_extractions, outbound_messages, intake_emails RESTART IDENTITY CASCADE');
    setDeps({ gmail: null });
    app = await buildApp({ auth: AUTH_ON });
  });
  afterAll(() => app.close());

  it('AC-AUTH-05: leadership cannot approve or override, and no row changes', async () => {
    const r = await paste('02');
    expect(r.decision).toBe('ALL_CLEAR');
    const before = await counts();
    const lead = await as('boss', ['leadership']);
    expect((await act(r.id, 'approve', lead)).statusCode).toBe(403);
    const o = await app.inject({ method: 'POST', url: '/api/overrides', headers: lead,
      payload: { orderRef: `email:${r.id}`, from: 'E', to: 'A', reason: 'client asked for A' } });
    expect(o.json()).toEqual({ error: 'forbidden' });
    expect(await counts()).toEqual(before);
    const [{ status }] = await query<{ status: string }>('SELECT status FROM intake_emails WHERE id = $1', [r.id]);
    expect(status).toBe('AWAITING_APPROVAL');
  });

  it('AC-AUTH-05, AC-AUTH-07: order_desk approves (actor from the token, body user ignored) but cannot send to the WMS; a supervisor can', async () => {
    const [{ id }] = await query<{ id: number }>("SELECT id FROM intake_emails WHERE status = 'AWAITING_APPROVAL' ORDER BY id LIMIT 1");
    const desk = await as('u1', ['order_desk'], 'Una Desk');
    expect((await act(id, 'approve', desk, { user: 'someone-else' })).json()).toEqual({ status: 'APPROVED' });
    expect((await act(id, 'send_to_wms', desk)).statusCode).toBe(403);
    expect((await act(id, 'send_to_wms', await as('w1', ['warehouse_supervisor'], 'Wes Site'))).json()).toEqual({ status: 'ENTERED' });
    const rows = await query<{ actor: string; action: string; name: string; roles: string[] }>(
      `SELECT actor, action, payload->>'name' AS name, payload->'roles' AS roles FROM audit_log
        WHERE ref = $1 AND action IN ('approve', 'send_to_wms') ORDER BY id`, [`email:${id}`]);
    expect(rows).toEqual([
      { actor: 'u1', action: 'approve', name: 'Una Desk', roles: ['order_desk'] },
      { actor: 'w1', action: 'send_to_wms', name: 'Wes Site', roles: ['warehouse_supervisor'] },
    ]);
  });

  it('AC-AUTH-07: a demo user is recorded as demo:<email>; an override takes its actor from the token', async () => {
    const h = await as('demo:demo-carrier_manager@latelens.test', ['carrier_manager'], 'Demo carrier manager');
    const r = await app.inject({ method: 'POST', url: '/api/overrides', headers: h,
      payload: { orderRef: 'ORD-9', from: 'E', to: 'A', reason: 'client asked for A', user: 'spoofed' } });
    expect(r.statusCode).toBe(200);
    const [row] = await query<{ user_name: string }>('SELECT user_name FROM override_log WHERE id = $1', [r.json().id]);
    expect(row.user_name).toBe('demo:demo-carrier_manager@latelens.test');
  });

  it('REQ-AUTH-07: writes with no actor column (pasted email, triage, recommendation, alerts) add an audit_log row', async () => {
    const support = await as('s1', ['customer_support']);
    expect((await app.inject({ method: 'POST', url: '/api/complaints/CMP001/triage', headers: support })).statusCode).toBe(200);
    await app.inject({ method: 'POST', url: '/api/recommend', headers: await as('c1', ['carrier_manager']),
      payload: { region: 'Northeast', commitment: 'next_day', slaClause: false, date: '2026-09-10' } });
    const rows = await query<{ actor: string; action: string }>(
      "SELECT actor, action FROM audit_log WHERE action IN ('paste_email', 'triage', 'recommend') ORDER BY id");
    expect(rows).toEqual(expect.arrayContaining([{ actor: 'desk', action: 'paste_email' }, { actor: 'c1', action: 'recommend' }]));
    expect(rows).toEqual(expect.arrayContaining([{ actor: 's1', action: 'triage' }]));
  });
});

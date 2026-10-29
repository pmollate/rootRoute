import { afterAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { checkAuthSettings, verifyToken } from '../src/core/auth.js';
import { pool } from '../src/core/db/pool.js';
import { buildApp } from '../src/server.js';
import { AUTH_ON, SECRET, bearer, logSink, noneToken, token } from './token.js';

const apps: FastifyInstance[] = [];
async function app(opts: Parameters<typeof buildApp>[0] = {}) {
  const a = await buildApp(opts);
  apps.push(a);
  return a;
}
afterAll(async () => {
  for (const a of apps) await a.close();
  await pool.end();
});

describe('internal token (SPEC-auth §5.2)', () => {
  it('AC-SEC-AUTH-03: accepts only HS256 with our secret, iss latelens-web, aud latelens-api, life ≤ 60 s', async () => {
    const ok = await verifyToken(await token({ sub: 'u1', name: 'Una', roles: ['order_desk'] }), SECRET);
    expect(ok).toEqual({ id: 'u1', name: 'Una', roles: ['order_desk'], demo: false });
    const now = Math.floor(Date.now() / 1000);
    for (const bad of [
      await token({ sub: 'u1' }, { aud: 'someone-else' }),
      await token({ sub: 'u1' }, { iss: 'someone-else' }),
      await token({ sub: 'u1' }, { alg: 'HS512' }),
      await token({ sub: 'u1' }, { iat: now, exp: now + 61 }),
      await token({ sub: 'u1' }, { secret: 'another-secret-another-secret-0123456789' }),
      await token({ sub: 'u1' }, { iat: now - 120, exp: now - 60 }),
      noneToken('u1', ['admin']),
      'not-a-token',
    ]) expect(await verifyToken(bad, SECRET)).toBeNull();
  });

  it('AC-AUTH-03, AC-AUTH-07: only the six role ids count; a demo user is demo:<email>', async () => {
    const u = await verifyToken(await token({ sub: 'demo:demo-admin@latelens.test', roles: ['admin', 'superuser'] }), SECRET);
    expect(u).toMatchObject({ id: 'demo:demo-admin@latelens.test', roles: ['admin'], demo: true });
  });
});

describe('fail-closed start-up (SEC-AUTH-09)', () => {
  it('AC-SEC-AUTH-09: with AUTH_REQUIRED=on, a missing or 16-byte INTERNAL_AUTH_SECRET stops the app, naming the setting only', async () => {
    expect(() => checkAuthSettings({ required: true })).toThrow(/INTERNAL_AUTH_SECRET/);
    const short = '0123456789abcdef';
    expect(() => checkAuthSettings({ required: true, secret: short })).toThrow(/INTERNAL_AUTH_SECRET/);
    try {
      checkAuthSettings({ required: true, secret: short });
    } catch (e) {
      expect((e as Error).message).not.toContain(short);
    }
    await expect(buildApp({ auth: { required: true, secret: short } })).rejects.toThrow(/INTERNAL_AUTH_SECRET/);
    expect(() => checkAuthSettings({ required: false })).not.toThrow();
    expect(() => checkAuthSettings(AUTH_ON)).not.toThrow();
  });
});

describe('AUTH_REQUIRED=on', () => {
  it('AC-AUTH-04: no token, an expired token or one signed with another secret → 401 on every route; health stays open', async () => {
    const a = await app({ auth: AUTH_ON });
    const now = Math.floor(Date.now() / 1000);
    const headers = [
      {},
      await bearer({ sub: 'u1', roles: ['admin'] }, { iat: now - 120, exp: now - 60 }),
      await bearer({ sub: 'u1', roles: ['admin'] }, { secret: 'another-secret-another-secret-0123456789' }),
      { authorization: `Bearer ${noneToken('u1', ['admin'])}` },
    ];
    for (const [method, url] of [['GET', '/api/overview'], ['GET', '/api/intake/1'], ['POST', '/api/intake/1/action'],
      ['POST', '/api/overrides'], ['POST', '/api/recommend'], ['POST', '/api/complaints/X/triage'], ['POST', '/api/alerts/run'],
      ['GET', '/api/journey/delivery:D000213']] as const) {
      for (const h of headers) {
        const r = await a.inject({ method, url, headers: h, payload: method === 'POST' ? { action: 'approve' } : undefined });
        expect(r.statusCode, `${method} ${url}`).toBe(401);
        expect(r.json()).toEqual({ error: 'unauthorized' });
      }
    }
    expect((await a.inject({ method: 'GET', url: '/api/health' })).statusCode).toBe(200);
  });

  it('AC-AUTH-13: with AUTH_REQUIRED=on the shared x-api-key alone is refused', async () => {
    const a = await app({ auth: AUTH_ON });
    const r = await a.inject({ method: 'POST', url: '/api/alerts/run', headers: { 'x-api-key': 'test-key' }, payload: { asOf: '2026-09-18' } });
    expect(r.statusCode).toBe(401);
  });

  it('AC-AUTH-03: a signed-in user with no LateLens role gets 403 on every call', async () => {
    const a = await app({ auth: AUTH_ON });
    const h = await bearer({ sub: 'u9', roles: ['guest'] });
    expect((await a.inject({ method: 'GET', url: '/api/overview', headers: h })).statusCode).toBe(403);
    expect((await a.inject({ method: 'POST', url: '/api/alerts/run', headers: h, payload: { asOf: '2026-09-18' } })).json())
      .toEqual({ error: 'forbidden' });
  });

  it('AC-SEC-AUTH-13: no Access-Control-Allow-Origin for any origin', async () => {
    const a = await app({ auth: AUTH_ON });
    const h = { origin: 'https://evil.example' };
    const r = await a.inject({ method: 'GET', url: '/api/health', headers: h });
    expect(r.headers['access-control-allow-origin']).toBeUndefined();
    const pre = await a.inject({ method: 'OPTIONS', url: '/api/overrides', headers: { ...h, 'access-control-request-method': 'POST' } });
    expect(pre.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('AC-SEC-AUTH-06: 401 and 403 are logged with the user and route, never the token', async () => {
    const sink = logSink();
    const a = await app({ auth: AUTH_ON, logStream: sink.stream });
    const h = await bearer({ sub: 'u2', roles: ['leadership'] });
    await a.inject({ method: 'GET', url: '/api/overview' });
    await a.inject({ method: 'POST', url: '/api/alerts/run', headers: h, payload: { asOf: '2026-09-18' } });
    const events = sink.lines.filter((l) => String(l.event ?? '').startsWith('auth_'));
    expect(events.map((l) => [l.event, l.user ?? null, l.route])).toEqual([
      ['auth_unauthorized', null, 'GET /api/overview'],
      ['auth_forbidden', 'u2', 'POST /api/alerts/run'],
    ]);
    expect(JSON.stringify(sink.lines)).not.toContain(h.authorization.slice(7));
  });
});

describe('AUTH_REQUIRED=off (the default)', () => {
  it('AC-AUTH-13: the x-api-key path works as before and each request "on" would refuse logs auth_would_deny', async () => {
    const sink = logSink();
    const a = await app({ logStream: sink.stream });
    const r = await a.inject({ method: 'POST', url: '/api/alerts/run', headers: { 'x-api-key': 'test-key' }, payload: {} });
    expect(r.statusCode).toBe(400); // past the auth check: the body is checked next, as before
    expect((await a.inject({ method: 'POST', url: '/api/alerts/run', headers: { 'x-api-key': 'wrong' }, payload: {} })).statusCode).toBe(401);
    const denied = sink.lines.filter((l) => l.event === 'auth_would_deny');
    expect(denied.map((l) => [l.route, l.status])).toEqual([['POST /api/alerts/run', 401], ['POST /api/alerts/run', 401]]);
  });

  it('AC-AUTH-13: CORS stays on as before', async () => {
    const a = await app();
    const r = await a.inject({ method: 'GET', url: '/api/health', headers: { origin: 'http://localhost:3000' } });
    expect(r.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });
});

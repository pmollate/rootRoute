// @vitest-environment node
// jose's key check needs Node's Uint8Array, not jsdom's.
import { jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { describe, expect, it, vi } from 'vitest';
import { RateLimiter, checkDemo, parseDemoUsers } from './demo';
import { signInternalToken } from './internalToken';
import { proxy, type ProxySettings } from './proxy';
import { PAGE_ROLES, ROLES, can, canOpen, toRoles } from './roles';
import { safeReturnPath } from './safeNext';
import { checkWebAuthEnv } from './startup';

const SECRET = 'test-internal-auth-secret-0123456789abcdef';

describe('return path after sign-in (SEC-AUTH-12)', () => {
  it('AC-SEC-AUTH-12: only a same-origin relative path is kept; anything else goes to /dashboard', () => {
    expect(safeReturnPath('/dashboard/journey?ref=delivery:D000213')).toBe('/dashboard/journey?ref=delivery:D000213');
    expect(safeReturnPath('/')).toBe('/');
    for (const bad of ['https://evil.example/x', '//evil.example', '/\\evil.example', 'javascript:alert(1)', 'dashboard',
      '', null, undefined, '/login', '/login?next=/x', '/%2F%2Fevil.example']) {
      expect(safeReturnPath(bad), String(bad)).toBe('/dashboard');
    }
  });
});

describe('roles (SPEC-auth §4.1, §4.3)', () => {
  it('AC-AUTH-03: only the six role ids count', () => {
    expect(toRoles(['admin', 'superuser', 'leadership', 'admin'])).toEqual(['leadership', 'admin']);
    expect(toRoles('admin')).toEqual([]);
  });

  it('AC-AUTH-10: buttons follow the §4.2 matrix; leadership can do nothing; without a session nothing is hidden', () => {
    expect(can(['leadership'], 'approve')).toBe(false);
    expect(can(['order_desk'], 'approve')).toBe(true);
    expect(can(['order_desk'], 'send_to_wms')).toBe(false);
    expect(can(['warehouse_supervisor'], 'send_to_wms')).toBe(true);
    expect(can(['carrier_manager'], 'override')).toBe(true);
    expect(can(['customer_support'], 'triage')).toBe(true);
    expect(can(['admin'], 'paste')).toBe(true);
    expect(can(null, 'approve')).toBe(true);
  });
});

describe('page access (SPEC-auth §4.4)', () => {
  it('AC-AUTH-15: each role opens only the screens in its page matrix; admin opens all; no session hides nothing', () => {
    const opens = (role: (typeof ROLES)[number]) => Object.keys(PAGE_ROLES).filter((p) => canOpen([role], p)).map((p) => p.slice(11));
    expect(opens('order_desk')).toEqual(['overview', 'intake', 'journey']);
    expect(opens('warehouse_supervisor')).toEqual(['overview', 'intake', 'warehouses', 'journey', 'replay']);
    expect(opens('carrier_manager')).toEqual(['overview', 'carriers', 'journey', 'replay']);
    expect(opens('customer_support')).toEqual(['overview', 'complaints', 'journey']);
    expect(opens('leadership')).toEqual(['overview', 'warehouses', 'carriers', 'journey', 'replay']);
    expect(opens('admin')).toEqual(Object.keys(PAGE_ROLES).map((p) => p.slice(11)));
    expect(canOpen(null, '/dashboard/complaints')).toBe(true);
  });

  it('AC-AUTH-15: sub-paths follow their screen; pages that are not a screen are open to any role', () => {
    expect(canOpen(['order_desk'], '/dashboard/carriers/x')).toBe(false);
    expect(canOpen(['order_desk'], '/dashboard/carriersx')).toBe(true); // not a screen: 404s on its own
    for (const p of ['/', '/dashboard', '/dashboard/forbidden']) expect(canOpen(['order_desk'], p), p).toBe(true);
  });
});

describe('demo accounts (SEC-AUTH-05)', () => {
  const hash = bcrypt.hashSync('right-password', 4);
  const users = parseDemoUsers(JSON.stringify([
    { email: 'demo-order_desk@rootroute.test', name: 'Demo order desk', roles: ['order_desk', 'root'], hash },
  ]));

  it('parses the account list and drops unknown roles; bad JSON gives no accounts', () => {
    expect(users).toEqual([{ email: 'demo-order_desk@rootroute.test', name: 'Demo order desk', roles: ['order_desk'], hash }]);
    expect(parseDemoUsers('not json')).toEqual([]);
    expect(parseDemoUsers(undefined)).toEqual([]);
  });

  it('AC-SEC-AUTH-05: right password signs in; unknown email and wrong password give the same answer', async () => {
    const limiter = new RateLimiter();
    expect(await checkDemo(users, 'DEMO-order_desk@rootroute.test', 'right-password', '1.1.1.1', limiter))
      .toEqual({ ok: true, user: { id: 'demo:demo-order_desk@rootroute.test', name: 'Demo order desk', roles: ['order_desk'], demo: true } });
    expect(await checkDemo(users, 'demo-order_desk@rootroute.test', 'wrong', '1.1.1.1', limiter)).toEqual({ ok: false, reason: 'invalid' });
    expect(await checkDemo(users, 'nobody@rootroute.test', 'right-password', '1.1.1.1', limiter)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('AC-SEC-AUTH-05: after 5 failures from one IP in a minute the 6th is refused without checking the password', async () => {
    let now = 0;
    const limiter = new RateLimiter(5, 60_000, () => now);
    for (let i = 0; i < 5; i++) expect((await checkDemo(users, 'x@rootroute.test', 'bad', '2.2.2.2', limiter)).ok).toBe(false);
    const compare = vi.spyOn(bcrypt, 'compare');
    expect(await checkDemo(users, 'demo-order_desk@rootroute.test', 'right-password', '2.2.2.2', limiter))
      .toEqual({ ok: false, reason: 'rate_limited' });
    expect(compare).not.toHaveBeenCalled();
    expect((await checkDemo(users, 'demo-order_desk@rootroute.test', 'right-password', '3.3.3.3', limiter)).ok).toBe(true);
    now = 61_000;
    expect((await checkDemo(users, 'demo-order_desk@rootroute.test', 'right-password', '2.2.2.2', limiter)).ok).toBe(true);
    compare.mockRestore();
  });
});

describe('internal token (SPEC-auth §5.2)', () => {
  it('AC-SEC-AUTH-03: HS256, iss latelens-web, aud latelens-api, 60 s life, sub/name/roles', async () => {
    const t = await signInternalToken({ id: 'u1', name: 'Una', roles: ['order_desk'] }, SECRET);
    const { payload, protectedHeader } = await jwtVerify(t, new TextEncoder().encode(SECRET),
      { issuer: 'latelens-web', audience: 'latelens-api' });
    expect(protectedHeader.alg).toBe('HS256');
    expect(payload).toMatchObject({ sub: 'u1', name: 'Una', roles: ['order_desk'] });
    expect(payload.exp! - payload.iat!).toBe(60);
  });
});

describe('proxy /api/[...path] (SEC-AUTH-04, -08)', () => {
  const on: ProxySettings = { required: true, apiUrl: 'http://api.internal:3001', appOrigin: 'https://web.example',
    internalSecret: SECRET, apiKey: 'shared-key' };
  const off: ProxySettings = { ...on, required: false };
  const user = { id: 'u1', name: 'Una', roles: ['order_desk' as const], demo: false };
  const api = () => vi.fn(async (_url: string, _init: RequestInit) =>
    new Response(JSON.stringify({ status: 'APPROVED' }), { status: 200, headers: { 'content-type': 'application/json', 'set-cookie': 'x=1' } }));
  const post = (headers: Record<string, string> = {}) => new Request('https://web.example/api/intake/7/action?x=1',
    { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ action: 'approve' }) });

  it('forwards to API_URL with its own fresh token, dropping the browser\'s Authorization, x-api-key and Cookie', async () => {
    const fetch = api();
    const r = await proxy(post({ origin: 'https://web.example', authorization: 'Bearer forged', 'x-api-key': 'k', cookie: 'authjs=1' }),
      ['intake', '7', 'action'], { session: user, settings: on, fetch });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ status: 'APPROVED' });
    expect(r.headers.get('set-cookie')).toBeNull();
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('http://api.internal:3001/api/intake/7/action?x=1');
    const h = new Headers(init!.headers);
    expect(h.get('cookie')).toBeNull();
    expect(h.get('x-api-key')).toBeNull();
    const auth = h.get('authorization')!;
    expect(auth).not.toBe('Bearer forged');
    const { payload } = await jwtVerify(auth.slice(7), new TextEncoder().encode(SECRET), { audience: 'latelens-api' });
    expect(payload.sub).toBe('u1');
  });

  it('AC-SEC-AUTH-04: a POST with a foreign or missing Origin gets 403 bad_origin and the API is not called', async () => {
    for (const headers of [{ origin: 'https://evil.example' }, {}] as Record<string, string>[]) {
      const fetch = api();
      const r = await proxy(post(headers), ['intake', '7', 'action'], { session: user, settings: on, fetch });
      expect(r.status).toBe(403);
      expect(await r.json()).toEqual({ error: 'bad_origin' });
      expect(fetch).not.toHaveBeenCalled();
    }
  });

  it('AC-SEC-AUTH-08: dot segments and encoded slashes are refused', async () => {
    for (const path of [['..', 'internal'], ['intake', '%2F..'], ['.'], ['intake', 'a/b']]) {
      const fetch = api();
      const r = await proxy(new Request('https://web.example/api/x'), path, { session: user, settings: on, fetch });
      expect(r.status, path.join('/')).toBe(400);
      expect(fetch).not.toHaveBeenCalled();
    }
  });

  it('AC-AUTH-11: with AUTH_REQUIRED=on and no session, 401 session_expired without calling the API', async () => {
    const fetch = api();
    const r = await proxy(post({ origin: 'https://web.example' }), ['intake', '7', 'action'], { session: null, settings: on, fetch });
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: 'session_expired' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('AC-AUTH-13: with AUTH_REQUIRED=off and no session, the server adds the shared key, never the browser', async () => {
    const fetch = api();
    await proxy(post({ origin: 'https://web.example', 'x-api-key': 'browser' }), ['overrides'], { session: null, settings: off, fetch });
    const h = new Headers(fetch.mock.calls[0][1]!.headers);
    expect(h.get('x-api-key')).toBe('shared-key');
    expect(h.get('authorization')).toBeNull();
  });

  it('AC-SEC-AUTH-01: the response carries no token', async () => {
    const fetch = api();
    const r = await proxy(new Request('https://web.example/api/overview'), ['overview'], { session: user, settings: on, fetch });
    const text = await r.text();
    const sent = new Headers(fetch.mock.calls[0][1]!.headers).get('authorization')!.slice(7);
    expect(text).not.toContain(sent);
    expect([...r.headers.values()].join(' ')).not.toContain(sent);
  });
});

describe('fail-closed start-up (SEC-AUTH-09)', () => {
  it('AC-SEC-AUTH-09: with AUTH_REQUIRED=on, a missing AUTH_SECRET or short INTERNAL_AUTH_SECRET stops the web app, naming the setting only', () => {
    expect(() => checkWebAuthEnv({})).not.toThrow();
    expect(() => checkWebAuthEnv({ AUTH_REQUIRED: 'on', AUTH_SECRET: 'x'.repeat(32) })).toThrow(/INTERNAL_AUTH_SECRET/);
    expect(() => checkWebAuthEnv({ AUTH_REQUIRED: 'on', AUTH_SECRET: 'x', INTERNAL_AUTH_SECRET: 'short-secret-16b' }))
      .toThrow(/^(?!.*short-secret-16b).*INTERNAL_AUTH_SECRET/);
    expect(() => checkWebAuthEnv({ AUTH_REQUIRED: 'on', INTERNAL_AUTH_SECRET: SECRET })).toThrow(/AUTH_SECRET/);
    expect(() => checkWebAuthEnv({ AUTH_REQUIRED: 'on', AUTH_SECRET: 'x'.repeat(32), INTERNAL_AUTH_SECRET: SECRET })).not.toThrow();
  });
});

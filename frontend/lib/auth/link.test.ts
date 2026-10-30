// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RateLimiter } from './demo';
import { LINK_HEADERS, linkGate, linkRoutePattern } from './linkGate';
import { isOpen } from './open';
import { proxy, type ProxySettings } from './proxy';

const TOKEN = 'A'.repeat(43);
const on: ProxySettings = { required: true, apiUrl: 'http://api.internal:3001', appOrigin: 'https://web.example',
  internalSecret: 'test-internal-auth-secret-0123456789abcdef', apiKey: 'shared-key' };
const api = () => vi.fn(async (_url: string, _init: RequestInit) => new Response('{}', { status: 200 }));

describe('E19 address link at the web app (SEC-LINK-04, -05, -07)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('AC-SEC-LINK-05: only /confirm/<token> is added to the open pages, and only with CONFIRM_LINK on', () => {
    expect(isOpen(`/confirm/${TOKEN}`, true)).toBe(true);
    for (const p of ['/confirmx', '/confirm', `/confirm/${TOKEN}/x`, '/dashboard']) expect(isOpen(p, true), p).toBe(false);
    expect(isOpen(`/confirm/${TOKEN}`, false)).toBe(false);
    // the pages open before E19 stay open, with the flag either way
    for (const p of ['/', '/login', '/no-access', '/maintenance', '/api/overview']) expect(isOpen(p, false), p).toBe(true);
  });

  it('AC-SEC-LINK-05: the proxy forwards /api/confirm/* without a session and adds no key or internal token', async () => {
    for (const settings of [on, { ...on, required: false }]) {
      const fetch = api();
      const r = await proxy(new Request(`https://web.example/api/confirm/${TOKEN}`), ['confirm', TOKEN], { session: null, settings, fetch });
      expect(r.status).toBe(200);
      expect(fetch.mock.calls[0][0]).toBe(`http://api.internal:3001/api/confirm/${TOKEN}`);
      const h = new Headers(fetch.mock.calls[0][1]!.headers);
      expect([h.get('authorization'), h.get('x-api-key')]).toEqual([null, null]);
    }
    // even with a session, the link route gets no internal token: the token in the path is the only credential
    const fetch = api();
    await proxy(new Request(`https://web.example/api/confirm/${TOKEN}`), ['confirm', TOKEN],
      { session: { id: 'u1', name: 'U', roles: ['admin'], demo: true }, settings: on, fetch });
    expect(new Headers(fetch.mock.calls[0][1]!.headers).get('authorization')).toBeNull();
    const other = api();
    expect((await proxy(new Request('https://web.example/api/overview'), ['overview'], { session: null, settings: on, fetch: other })).status).toBe(401);
    // REQ-LINK-16: the pin look-up is a link route too (no session, no key); it counts in the per-IP limit
    const look = api();
    expect((await proxy(new Request(`https://web.example/api/confirm/${TOKEN}/lookup`), ['confirm', TOKEN, 'lookup'],
      { session: null, settings: on, fetch: look })).status).toBe(200);
    expect(new Headers(look.mock.calls[0][1]!.headers).get('x-api-key')).toBeNull();
    expect(linkGate(`/api/confirm/${TOKEN}/lookup`, '9.9.9.9', true, new RateLimiter(1, 60_000, () => 0)).kind).toBe('pass');
    // any other deeper path is not a link route
    expect((await proxy(new Request(`https://web.example/api/confirm/${TOKEN}/x`), ['confirm', TOKEN, 'x'],
      { session: null, settings: on, fetch: other })).status).toBe(401);
  });

  it('AC-SEC-LINK-12, REQ-LINK-18, -19: /code and /verify are link routes; x-link-verify is forwarded on link routes only', async () => {
    const VT = 'V'.repeat(43);
    const headers = { origin: 'https://web.example', 'content-type': 'application/json', 'x-link-verify': VT };
    for (const sub of ['code', 'verify', 'lookup', null]) {
      const fetch = api();
      const segs = sub ? ['confirm', TOKEN, sub] : ['confirm', TOKEN];
      const url = `https://web.example/api/${segs.join('/')}`;
      const r = await proxy(new Request(url, { method: 'POST', headers, body: '{}' }), segs, { session: null, settings: on, fetch });
      expect(r.status, String(sub)).toBe(200);
      const h = new Headers(fetch.mock.calls[0][1]!.headers);
      expect([h.get('x-link-verify'), h.get('authorization'), h.get('x-api-key')]).toEqual([VT, null, null]);
      expect(linkGate(new URL(url).pathname, '9.9.9.9', true, new RateLimiter(1, 60_000, () => 0)).kind).toBe('pass');
    }
    const get = api();
    await proxy(new Request(`https://web.example/api/confirm/${TOKEN}`, { headers: { 'x-link-verify': VT } }), ['confirm', TOKEN], { session: null, settings: on, fetch: get });
    expect(new Headers(get.mock.calls[0][1]!.headers).get('x-link-verify')).toBe(VT);
    // on any other route the header is dropped
    const other = api();
    await proxy(new Request('https://web.example/api/overview', { headers: { 'x-link-verify': VT } }), ['overview'],
      { session: { id: 'u1', name: 'U', roles: ['admin'], demo: true }, settings: on, fetch: other });
    expect(new Headers(other.mock.calls[0][1]!.headers).get('x-link-verify')).toBeNull();
    // a malformed header is not forwarded
    const odd = api();
    await proxy(new Request(`https://web.example/api/confirm/${TOKEN}`, { headers: { 'x-link-verify': 'not a token' } }), ['confirm', TOKEN], { session: null, settings: on, fetch: odd });
    expect(new Headers(odd.mock.calls[0][1]!.headers).get('x-link-verify')).toBeNull();
  });

  it('AC-SEC-LINK-07, SEC-LINK-01: a cross-origin confirm POST gets 403 bad_origin, never reaches the API, and the log holds no token', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const fetch = api();
    const r = await proxy(new Request(`https://web.example/api/confirm/${TOKEN}`, { method: 'POST', headers: { origin: 'https://evil.example' }, body: '{}' }),
      ['confirm', TOKEN], { session: null, settings: on, fetch });
    expect([r.status, await r.json()]).toEqual([403, { error: 'bad_origin' }]);
    expect(fetch).not.toHaveBeenCalled();
    const lines = log.mock.calls.map((c) => String(c[0]));
    expect(lines.some((l) => l.includes('/api/confirm/[token]'))).toBe(true);
    expect(lines.some((l) => l.includes(TOKEN))).toBe(false);
  });

  it('AC-SEC-LINK-04: the 11th request from one IP in a minute is refused; another IP is not; a minute later it passes', () => {
    let t = 0;
    const limiter = new RateLimiter(10, 60_000, () => t);
    for (let i = 0; i < 10; i += 1) expect(linkGate(`/api/confirm/${TOKEN}`, '1.1.1.1', true, limiter).kind).toBe('pass');
    expect(linkGate(`/confirm/${TOKEN}`, '1.1.1.1', true, limiter).kind).toBe('rate_limited');
    expect(linkGate(`/confirm/${TOKEN}`, '2.2.2.2', true, limiter).kind).toBe('pass');
    t = 60_000;
    expect(linkGate(`/confirm/${TOKEN}`, '1.1.1.1', true, limiter).kind).toBe('pass');
  });

  it('AC-LINK-09, AC-SEC-LINK-07: off → 404; on → frame-ancestors none and no referrer; other paths untouched', () => {
    const limiter = new RateLimiter(10);
    expect(linkGate(`/confirm/${TOKEN}`, 'ip', false, limiter).kind).toBe('not_found');
    expect(linkGate(`/api/confirm/${TOKEN}`, 'ip', false, limiter).kind).toBe('not_found');
    expect(linkGate(`/confirm/${TOKEN}`, 'ip', true, limiter)).toEqual({ kind: 'pass',
      headers: { 'Content-Security-Policy': "frame-ancestors 'none'", 'Referrer-Policy': 'no-referrer' } });
    expect(LINK_HEADERS['Referrer-Policy']).toBe('no-referrer');
    for (const p of ['/dashboard', '/confirmx', '/api/overview']) expect(linkGate(p, 'ip', true, limiter).kind, p).toBe('not_link');
  });

  it('SEC-LINK-01: a link path is logged by its pattern, never with the token', () => {
    expect(linkRoutePattern(`/confirm/${TOKEN}`)).toBe('/confirm/[token]');
    expect(linkRoutePattern(`/api/confirm/${TOKEN}`)).toBe('/api/confirm/[token]');
    expect(linkRoutePattern(`/confirm/${TOKEN}/x`)).toBe('/confirm/[token]');
    expect(linkRoutePattern('/api/overview')).toBe('/api/overview');
  });
});

describe('E19 no Maps credential in the browser (SEC-LINK-08)', () => {
  const root = fileURLToPath(new URL('../..', import.meta.url));
  /** Every .ts/.tsx/.mjs file under the web app's source folders (not node_modules or .next). */
  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      if (['node_modules', '.next', 'public', 'test-results', 'playwright-report'].includes(name)) return [];
      if (statSync(p).isDirectory()) return sources(p);
      return /\.(ts|tsx|mjs)$/.test(name) ? [p] : [];
    });
  }

  it('AC-SEC-LINK-08: no NEXT_PUBLIC_ Maps variable in .env.example or the web app source', () => {
    const NEXT_PUBLIC_MAPS = /NEXT_PUBLIC_[A-Z_]*MAPS/;
    expect(readFileSync(join(root, '..', '.env.example'), 'utf8')).not.toMatch(NEXT_PUBLIC_MAPS);
    const self = fileURLToPath(import.meta.url);
    const hits = sources(root).filter((f) => f !== self && NEXT_PUBLIC_MAPS.test(readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });

  it('AC-SEC-LINK-08: the confirm page code never reads AZURE_MAPS_KEY', () => {
    const files = [...sources(join(root, 'components', 'confirm')), ...sources(join(root, 'app', 'confirm')),
      ...sources(join(root, 'app', 'confirm-map')), ...sources(join(root, 'lib', 'confirm'))].filter((f) => !/\.test\.tsx?$/.test(f));
    expect(files.length).toBeGreaterThan(0);
    expect(files.filter((f) => readFileSync(f, 'utf8').includes('AZURE_MAPS_KEY'))).toEqual([]);
  });
});

// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadLink } from './load';

const TOKEN = 'A'.repeat(43);
const VIEW = { address: { city: 'Newark' }, pin: null, expiresAt: '2026-10-31T10:22:00.000Z', synthetic: true,
  map: { kind: 'sas', token: 't', expiresAt: '2026-10-31T10:22:00.000Z' } };
const answer = (status: number, body: unknown = {}) => vi.fn(async (_u: string | URL | Request, _i?: RequestInit) =>
  new Response(JSON.stringify(body), { status }));

describe('the page\'s server-side load (E19)', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('AC-SEC-LINK-05: asks API_URL directly with no key, internal token or cookie, and never caches', async () => {
    vi.stubEnv('API_URL', 'http://api.internal:3001/');
    vi.stubEnv('API_KEY', 'shared-key');
    const f = answer(200, VIEW);
    expect(await loadLink(TOKEN, f as unknown as typeof fetch)).toEqual(VIEW);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe(`http://api.internal:3001/api/confirm/${TOKEN}`);
    expect(init?.cache).toBe('no-store');
    expect([...new Headers(init?.headers).keys()]).toEqual(['accept']);
  });

  it('AC-LINK-07: the API\'s 404 becomes null (the page\'s one invalid-link 404); a path-breaking token stays one segment', async () => {
    const f = answer(404, { error: 'link_invalid' });
    expect(await loadLink('../overview', f as unknown as typeof fetch)).toBeNull();
    expect(String(f.mock.calls[0][0])).toMatch(/\/api\/confirm\/\.\.%2Foverview$/);
  });

  it('an API failure (5xx or no answer) is an error, not "link no longer valid"', async () => {
    await expect(loadLink(TOKEN, answer(500) as unknown as typeof fetch)).rejects.toThrow('confirm link API answered 500');
    await expect(loadLink(TOKEN, vi.fn(async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch)).rejects.toThrow();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionExpired, getJSON, postJSON } from './api';

const respond = (status: number, body: object) =>
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: status < 400, status, json: async () => body }) as Response));

afterEach(() => { vi.unstubAllGlobals(); });

describe('dashboard API client (SPEC-auth §5.1)', () => {
  it('AC-SEC-AUTH-01: calls go to the same-origin /api path, with no key and no API host', async () => {
    respond(200, { ok: true });
    await getJSON('/api/overview');
    await postJSON('/api/overrides', { orderRef: 'X' });
    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit | undefined][];
    expect(calls.map(([url]) => url)).toEqual(['/api/overview', '/api/overrides']);
    const headers = new Headers(calls[1][1]?.headers);
    expect(headers.get('x-api-key')).toBeNull();
    expect(headers.get('content-type')).toBe('application/json');
  });

  it('AC-AUTH-11: a 401 session_expired from the proxy becomes SessionExpired, for reads and writes', async () => {
    respond(401, { error: 'session_expired' });
    await expect(postJSON('/api/intake/1/action', { action: 'send_reply' })).rejects.toBeInstanceOf(SessionExpired);
    await expect(getJSON('/api/intake')).rejects.toBeInstanceOf(SessionExpired);
  });

  it('a 403 keeps the API\'s error code for the screen to word', async () => {
    respond(403, { error: 'forbidden' });
    await expect(postJSON('/api/alerts/run', {})).rejects.toThrow('forbidden');
  });
});

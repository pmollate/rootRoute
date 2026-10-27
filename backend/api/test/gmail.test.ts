import { describe, expect, it } from 'vitest';
import { GmailClient } from '../src/core/gmail.js';

type Call = { url: string; method: string; body: string };

/** A fake Google: answers the token endpoint and then each Gmail call with the next canned response. */
function fakeGoogle(responses: { status?: number; body: object }[]) {
  const calls: Call[] = [];
  const fetch = async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method ?? 'GET', body: String(init?.body ?? '') });
    if (String(url).startsWith('https://oauth2.googleapis.com/')) {
      return new Response(JSON.stringify({ access_token: 'at', expires_in: 3600 }), { status: 200 });
    }
    const next = responses.shift() ?? { body: {} };
    return new Response(JSON.stringify(next.body), { status: next.status ?? 200 });
  };
  return { calls, gmail: new GmailClient({ clientId: 'id', clientSecret: 'secret', refreshToken: 'rt' }, fetch) };
}

describe('Gmail client', () => {
  it('refreshes the access token once and pages through results up to max', async () => {
    const { calls, gmail } = fakeGoogle([
      { body: { messages: [{ id: 'a' }, { id: 'b' }], nextPageToken: 'p2' } },
      { body: { messages: [{ id: 'c' }, { id: 'd' }] } },
    ]);
    expect(await gmail.listMessageIds('in:inbox', 3)).toEqual(['a', 'b', 'c']);
    expect(calls.filter((c) => c.url.includes('oauth2')).length).toBe(1);
    expect(calls[2].url).toContain('pageToken=p2');
  });

  it('inserts a message as base64url with CRLF line ends, dated by its Date header', async () => {
    const { calls, gmail } = fakeGoogle([{ body: { id: 'm1' } }]);
    expect(await gmail.insertMessage('Subject: x\n\nhello')).toBe('m1');
    const insert = calls[1];
    expect(insert.url).toContain('/messages?internalDateSource=dateHeader');
    const { raw, labelIds } = JSON.parse(insert.body) as { raw: string; labelIds: string[] };
    expect(Buffer.from(raw, 'base64url').toString()).toBe('Subject: x\r\n\r\nhello');
    expect(labelIds).toEqual(['INBOX', 'UNREAD']);
  });

  it('explains an expired refresh token', async () => {
    const fetch = async () => new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 });
    const gmail = new GmailClient({ clientId: 'id', clientSecret: 's', refreshToken: 'old' }, fetch);
    await expect(gmail.profile()).rejects.toThrow(/gmail:auth/);
  });
});

import { describe, expect, it } from 'vitest';
import type { GmailMessage } from '../../src/core/gmail.js';
import { parseGmailMessage, toLocalTimestamp } from '../../src/modules/intake/mailbox.js';

const b64 = (s: string) => Buffer.from(s).toString('base64url');
const headers = [
  { name: 'From', value: 'Dana Whitfield <Orders@Client190.example>' },
  { name: 'Subject', value: 'Re: [SYNTHETIC] Order 34' },
  { name: 'Message-ID', value: '<reply-1@client190.example>' },
  { name: 'In-Reply-To', value: '<latelens-34@latelens.example>' },
];

describe('mailbox', () => {
  it('reads the plain-text part of a multipart message and the local arrival time', () => {
    const m: GmailMessage = {
      id: 'g1', threadId: 't1', internalDate: String(Date.UTC(2026, 9, 27, 13, 15)),
      payload: { mimeType: 'multipart/alternative', headers, parts: [
        { mimeType: 'text/plain', body: { data: b64('Street is 400 S Orange Ave, ZIP 32801') } },
        { mimeType: 'text/html', body: { data: b64('<p>ignored</p>') } },
      ] },
    };
    expect(parseGmailMessage(m, 'America/New_York')).toEqual({
      gmailId: 'g1', threadId: 't1', messageId: '<reply-1@client190.example>', inReplyTo: '<latelens-34@latelens.example>',
      from: 'orders@client190.example', subject: 'Re: [SYNTHETIC] Order 34',
      body: 'Street is 400 S Orange Ave, ZIP 32801', receivedAt: '2026-10-27 09:15',
    });
  });

  it('falls back to HTML with the tags removed', () => {
    const m: GmailMessage = { id: 'g2', threadId: 't2', internalDate: '0', payload: { mimeType: 'text/html', headers,
      body: { data: b64('<p>Ship to: 600 4th Ave<br>Seattle, WA 98104</p><ul><li>HX-291: 29</li></ul>') } } };
    expect(parseGmailMessage(m, 'UTC').body).toBe('Ship to: 600 4th Ave\nSeattle, WA 98104\nHX-291: 29');
  });

  it('converts across the daylight-saving change', () => {
    expect(toLocalTimestamp(Date.UTC(2026, 10, 2, 13, 0), 'America/New_York')).toBe('2026-11-02 08:00');
  });
});

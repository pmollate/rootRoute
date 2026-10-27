import { describe, expect, it } from 'vitest';
import type { GmailMessage } from '../../src/core/gmail.js';
import { parseGmailMessage, replyMessage, sendReply, toLocalTimestamp } from '../../src/modules/intake/mailbox.js';

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

describe('sending a reply', () => {
  const reply = { to: 'Orders@Client190.example', subject: '[SYNTHETIC] Order 34', body: 'Hello,\nplease confirm.',
    threadId: 't1', inReplyTo: '<sd02-34@latelens.synthetic>' };

  it('builds a reply in the same thread with In-Reply-To and References', () => {
    const eml = replyMessage(reply);
    expect(eml).toContain('To: Orders@Client190.example');
    expect(eml).toContain('Subject: Re: [SYNTHETIC] Order 34');
    expect(eml).toContain('In-Reply-To: <sd02-34@latelens.synthetic>');
    expect(eml).toContain('References: <sd02-34@latelens.synthetic>');
    expect(eml.endsWith('\n\nHello,\nplease confirm.')).toBe(true);
    expect(replyMessage({ ...reply, subject: 'Re: x' })).toContain('Subject: Re: x\n');
  });

  it('AC-SEC-03 (unit): sends only to the allow-list', async () => {
    const sent: { raw: string; threadId: string | null }[] = [];
    const gmail = { sendMessage: async (raw: string, threadId: string | null) => { sent.push({ raw, threadId }); return 'm9'; } };
    const allow = new Set(['orders@client190.example']);
    expect(await sendReply(gmail, reply, allow)).toBe('m9');
    expect(sent[0].threadId).toBe('t1');
    await expect(sendReply(gmail, { ...reply, to: 'someone@else.example' }, allow)).rejects.toThrow(/allow-list/);
    expect(sent).toHaveLength(1);
  });
});

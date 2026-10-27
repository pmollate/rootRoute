import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { LocalTimestamp } from '../../core/contracts.js';
import type { GmailClient, GmailMessage, GmailPart } from '../../core/gmail.js';

/** Shared with the fixture generator. [HALCYON_TIMEZONE] until the team confirms it (SPEC §12). */
export const MAILBOX_TIMEZONE = (JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../../synthetic-data/reference/mailbox.json', import.meta.url)), 'utf8'),
) as { timezone: string }).timezone;

/** Recent mail in the demo inbox that we did not send ourselves. */
export const DEFAULT_QUERY = 'in:inbox -from:me newer_than:14d';

export interface InboundEmail {
  gmailId: string;
  threadId: string;
  messageId: string | null;  // RFC 822 Message-ID
  inReplyTo: string | null;  // set when a client answers one of our replies
  from: string;              // bare address, lower case
  subject: string;
  body: string;              // plain text
  receivedAt: LocalTimestamp; // the order time (SPEC §5.3)
}

export function toLocalTimestamp(ms: number, timeZone: string): LocalTimestamp {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
      minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms)).map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

export function senderAddress(from: string): string {
  return (/<([^>]+)>/.exec(from)?.[1] ?? from).trim().toLowerCase();
}

function findPart(part: GmailPart, mimeType: string): GmailPart | null {
  if (part.mimeType === mimeType && part.body?.data) return part;
  for (const p of part.parts ?? []) {
    const found = findPart(p, mimeType);
    if (found) return found;
  }
  return null;
}

const decode = (data: string) => Buffer.from(data, 'base64url').toString('utf8');

/** The text/plain part, else the HTML part with tags removed. */
export function bodyText(payload: GmailPart): string {
  const plain = findPart(payload, 'text/plain');
  if (plain?.body?.data) return decode(plain.body.data);
  const html = findPart(payload, 'text/html');
  if (!html?.body?.data) return '';
  return decode(html.body.data)
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function parseGmailMessage(m: GmailMessage, timeZone = MAILBOX_TIMEZONE): InboundEmail {
  const header = (name: string) =>
    m.payload.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? null;
  return {
    gmailId: m.id,
    threadId: m.threadId,
    messageId: header('Message-ID'),
    inReplyTo: header('In-Reply-To'),
    from: senderAddress(header('From') ?? ''),
    subject: header('Subject') ?? '',
    body: bodyText(m.payload),
    receivedAt: toLocalTimestamp(Number(m.internalDate), timeZone),
  };
}

/** One at a time, to stay well inside Gmail's per-user rate limit. */
export async function fetchRecentEmails(gmail: Pick<GmailClient, 'listMessageIds' | 'getMessage'>, query = DEFAULT_QUERY,
  max = 50): Promise<InboundEmail[]> {
  const out: InboundEmail[] = [];
  for (const id of await gmail.listMessageIds(query, max)) out.push(parseGmailMessage(await gmail.getMessage(id)));
  return out;
}

export interface OutboundReply {
  to: string;
  subject: string;           // the client's subject; "Re: " is added once
  body: string;              // plain text, with names already restored after approval
  threadId: string | null;   // Gmail thread of the client's email
  inReplyTo: string | null;  // the client's Message-ID
}

/** An RFC 822 reply that Gmail and the client's mail program file in the same conversation. */
export function replyMessage(r: OutboundReply): string {
  const subject = /^re:/i.test(r.subject) ? r.subject : `Re: ${r.subject}`;
  const headers = [`To: ${r.to}`, `Subject: ${subject}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8'];
  if (r.inReplyTo) headers.push(`In-Reply-To: ${r.inReplyTo}`, `References: ${r.inReplyTo}`);
  return `${headers.join('\n')}\n\n${r.body}`;
}

/** SEC-03: outbound email goes only to addresses on ALLOW_LIST; anything else is refused before Gmail is called. */
export async function sendReply(gmail: Pick<GmailClient, 'sendMessage'>, r: OutboundReply, allow: Set<string>): Promise<string> {
  const to = senderAddress(r.to);
  if (!allow.has(to)) throw new Error(`${to} is not on the allow-list (ALLOW_LIST): reply not sent`);
  return gmail.sendMessage(replyMessage(r), r.threadId);
}

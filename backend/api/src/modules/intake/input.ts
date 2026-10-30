import { z } from 'zod';
import { config } from '../../core/config.js';
import { senderAddress } from './mailbox.js';
import { ACTIONS } from './actions.js';
import { POLL_MAX } from './poll.js';

/**
 * REQ-INT-16: the intake POST bodies, each with a readable message per field (the paste form shows them as they are).
 * A refusal is `{ error, fields }`: `fields` maps a field to its message, `error` is those messages in one line.
 */

/** RFC 5321 allows 254 characters for the address; 320 leaves room for a display name ("Sam Kowalski <…>"). */
export const FROM_MAX = 320;
export const limits = () => ({ bodyChars: config.INTAKE_MAX_BODY_CHARS, subjectChars: config.INTAKE_MAX_SUBJECT_CHARS, fromChars: FROM_MAX });

const n = (x: number) => x.toLocaleString('en-US');
/** One @, no spaces or angle brackets, and a dot in the domain: what the pipeline needs to find the client's domain. */
const ADDRESS = /^[^\s@<>]+@[^\s@<>.]+(\.[^\s@<>.]+)+$/;
const LOCAL_TIME = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/;

/** "YYYY-MM-DD HH:mm" that is a real calendar date and a 24-hour time (no 30 February, no 24:00). */
export function isLocalTime(s: string): boolean {
  const m = LOCAL_TIME.exec(s);
  if (!m) return false;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const day = new Date(Date.UTC(y, mo - 1, d));
  return day.getUTCFullYear() === y && day.getUTCMonth() === mo - 1 && day.getUTCDate() === d && h < 24 && mi < 60;
}

/** A string field: `missing` when absent, `text` when not a string. */
const text = (missing: string, wrongType: string) =>
  z.string({ error: (iss) => (iss.input === undefined ? missing : wrongType) });

const NOT_OBJECT = 'Send the email as a JSON object with from, subject, body and receivedAt.';
const RECEIVED_AT = 'Received at must look like 2026-09-14 09:30 (a real date, 24-hour time).';

export const EmailBody = z.object({
  from: text('From is missing.', 'From must be text.')
    .refine((s) => s.trim().length > 0, 'From is empty.')
    .refine((s) => s.length <= FROM_MAX, `From is longer than ${n(FROM_MAX)} characters.`)
    .refine((s) => !s.trim() || s.length > FROM_MAX || ADDRESS.test(senderAddress(s)), 'From must be an email address, like orders@client190.example.'),
  // An email may have no subject; the form always sends one.
  subject: z.string({ error: 'Subject must be text.' }).default('')
    .refine((s) => s.length <= config.INTAKE_MAX_SUBJECT_CHARS, `The subject is longer than ${n(config.INTAKE_MAX_SUBJECT_CHARS)} characters.`),
  // Whitespace only counts as empty. The body itself is kept as sent (it is hashed for dedupe and shown to the operator).
  body: text('The email body is missing.', 'The email body must be text.')
    .refine((s) => s.trim().length > 0, 'The email body is empty.')
    .refine((s) => s.length <= config.INTAKE_MAX_BODY_CHARS, `The email body is longer than ${n(config.INTAKE_MAX_BODY_CHARS)} characters.`),
  receivedAt: text('Received at is missing.', RECEIVED_AT).refine(isLocalTime, RECEIVED_AT),
  inReplyTo: z.number({ error: 'In reply to must be an email number.' }).int('In reply to must be an email number.')
    .positive('In reply to must be an email number.').optional(),
}, { error: NOT_OBJECT });

// `reply`: the operator's edited reply text (send_reply only); without it the stored draft is sent.
// `reason`: why an order is rejected, or why its carrier changes. `carrier`: the supervisor's pick on approve (E18).
// No `user`: the actor comes from the verified token (REQ-AUTH-07); an old client's `user` is ignored by the schema.
export const ActionBody = z.object({
  action: z.enum(ACTIONS, { error: (iss) => (iss.input === undefined ? 'The action is missing.' : 'Unknown action.') }),
  reply: z.string({ error: 'The reply must be text.' }).trim().min(1, 'The reply is empty.').max(5000, 'The reply is longer than 5,000 characters.').optional(),
  reason: z.string({ error: 'The reason must be text.' }).trim().min(1, 'The reason is empty.').max(500, 'The reason is longer than 500 characters.').optional(),
  carrier: z.enum(['A', 'B', 'C', 'D', 'E', 'F'], { error: 'Carrier must be one of A to F.' }).optional(),
}, { error: 'Send the action as a JSON object.' });

const MAX = `Max must be a whole number from 1 to ${POLL_MAX}.`;
export const FetchBody = z.object({
  query: z.string({ error: 'Query must be text.' }).optional(),
  max: z.number({ error: MAX }).int(MAX).min(1, MAX).max(POLL_MAX, MAX).default(POLL_MAX),
}, { error: 'Send the request as a JSON object.' });

export interface InputError { error: string; fields: Record<string, string> }

/** The first message per field, in schema order; a refusal of the whole body has no field. */
export function readable(err: z.ZodError): InputError {
  const fields: Record<string, string> = {};
  let whole: string | null = null;
  for (const issue of err.issues) {
    const key = issue.path[0];
    if (key === undefined) whole ??= issue.message;
    else if (!(String(key) in fields)) fields[String(key)] = issue.message;
  }
  return { error: whole ?? Object.values(fields).join(' '), fields };
}

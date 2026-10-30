// E19 one-time address link (SPEC §5.17, owner A): the pure rules. No AI model anywhere in this flow.
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { LocalTimestamp } from '../../core/contracts.js';
import { MAILBOX_TIMEZONE } from './mailbox.js';
import { isUsState } from './region.js';

/** REQ-LINK-01: the reply draft's placeholder; send_reply replaces it in the sent text only (A17). */
export const LINK_PLACEHOLDER = '[CONFIRM_LINK]';

/**
 * SEC-02 / REQ-LINK-09: email content is untrusted, so a client cannot plant the placeholder (in an address, a name or
 * an item) and have it sent as text or turned into a link. Removes it from an untrusted value; other values unchanged.
 */
export function neutralisePlaceholder(value: string): string {
  return value.includes(LINK_PLACEHOLDER) ? value.split(LINK_PLACEHOLDER).join(' ').replace(/\s{2,}/g, ' ').trim() : value;
}

/** SEC-LINK-01: 32 bytes from the OS's cryptographic source, base64url (43 characters). Only its hash is stored. */
export const newToken = (): string => randomBytes(32).toString('base64url');
export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');
/** SEC-LINK-11: what a log line may carry instead of the token. */
export const hashPrefix = (hash: string): string => hash.slice(0, 8);
export const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

// Design settings (SPEC §5.17), not data. Q-LINK-03 (margin, floor, time zone) is open: these are the SPEC defaults.
export const CUTOFF_HOUR = 8;          // the 08:00 pick-list cut-off (CONTRACTS §3)
export const MARGIN_HOURS = 2;         // the link stops 2 h before the cut-off
export const FLOOR_HOURS = 1;          // ...and lasts at least 1 h
export const SECOND_CONFIRM_M = 500;   // REQ-LINK-03
export const MAX_MAP_LOOKUPS = 20;     // SEC-LINK-04

const HOUR_MS = 3_600_000;
const LOCAL = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/;

/** A wall-clock "YYYY-MM-DD HH:mm" read as if it were UTC (ms); only used to compare and shift wall-clock readings. */
function wallMs(local: string): number {
  const m = LOCAL.exec(local);
  if (!m) throw new Error(`not a local timestamp: ${local}`);
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
}

/** The wall clock in `timeZone` at instant `ms`, read as if it were UTC (ms). */
function wallAt(ms: number, timeZone: string): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
}

/** The instant of a wall-clock time in `timeZone`, by that IANA zone's own daylight-saving rules (SEC-LINK-02). */
export function localToInstant(local: LocalTimestamp, timeZone: string): Date {
  const wall = wallMs(local);
  const first = wall - (wallAt(wall, timeZone) - wall);   // correct by the offset near the guess
  const at = wall - (wallAt(first, timeZone) - first);     // and again by the offset at the corrected instant
  // A time in the spring-forward gap (02:30 on the day clocks go forward) does not exist: move it forward by the gap,
  // as clocks do (02:30 EST -> 03:30 EDT), rather than back. A repeated time (fall back) takes the first, EDT.
  return new Date(at + (wall - wallAt(at, timeZone)));
}

const dateOf = (wall: number) => new Date(wall).toISOString().slice(0, 10);
const DAY_MS = 24 * HOUR_MS;

/**
 * SEC-LINK-02 lifetime, on instants (SPEC §5.17 "Time arithmetic"): the earlier of `hours` after sending and
 * MARGIN_HOURS before the order's cut-off. The cut-off is 08:00 in `timeZone` on the pick-list date (the arrival date if
 * the email arrived before 08:00, else the next day), turned into an instant by the zone's rules. While that cut-off is
 * less than MARGIN_HOURS + FLOOR_HOURS after sending, the next day's 08:00 is used, so a link lasts at least FLOOR_HOURS.
 * `receivedAt` is the email's arrival wall-clock time in `timeZone` (as stored); `sentAt` is the instant the reply went.
 */
export function linkExpiry(receivedAt: LocalTimestamp, sentAt: Date, hours: number, timeZone = MAILBOX_TIMEZONE): Date {
  const arrivalDay = wallMs(`${receivedAt.slice(0, 10)} 00:00`);
  let day = arrivalDay + (wallMs(receivedAt) - arrivalDay < CUTOFF_HOUR * HOUR_MS ? 0 : DAY_MS); // the pick-list date
  const sent = sentAt.getTime();
  const sentDay = wallMs(`${dateOf(wallAt(sent, timeZone))} 00:00`);
  if (day < sentDay) day = sentDay; // a link sent days after the email: no earlier date's cut-off can be ahead of it
  const cutoffOf = (d: number) => localToInstant(`${dateOf(d)} ${String(CUTOFF_HOUR).padStart(2, '0')}:00`, timeZone).getTime();
  while (cutoffOf(day) - sent < (MARGIN_HOURS + FLOOR_HOURS) * HOUR_MS) day += DAY_MS;
  return new Date(Math.min(sent + hours * HOUR_MS, cutoffOf(day) - MARGIN_HOURS * HOUR_MS));
}

/** Great-circle distance in metres (REQ-LINK-03: the API measures it, never the browser). */
export function distanceM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** SEC-LINK-10: the confirm body. Anything else is 400 and the link stays unused. */
const NO_CONTROL = (s: string) => !/\p{Cc}/u.test(s); // SEC-LINK-10: no CR/LF or other control characters
const text = (max: number) => z.string().trim().min(1).max(max).refine(NO_CONTROL, 'no control characters');
export const ConfirmBody = z.object({
  address: z.object({
    line1: text(100), line2: z.string().trim().max(100).refine(NO_CONTROL, 'no control characters').nullish().transform((v) => v || null), city: text(100),
    state: z.string().trim().toUpperCase().refine(isUsState, 'US state code'), zip: z.string().trim().regex(/^\d{5}(-\d{4})?$/),
  }).strict(),
  pin: z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }).strict(),
  checkId: z.string().max(100).optional(),
}).strict();
export type ConfirmInput = z.infer<typeof ConfirmBody>;

/** REQ-LINK-03: a second Confirm is needed when the pin moved > 500 m, the ZIP changed, or there was no start pin. */
export function needsSecondConfirm(start: { pin: { lat: number; lon: number } | null; zip?: string | null }, input: ConfirmInput): boolean {
  if (!start.pin) return true;
  if ((start.zip ?? '') !== input.address.zip) return true;
  return distanceM(start.pin, input.pin) > SECOND_CONFIRM_M;
}

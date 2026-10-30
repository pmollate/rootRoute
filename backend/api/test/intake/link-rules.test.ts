import { describe, expect, it } from 'vitest';
import {
  ConfirmBody, distanceM, hashPrefix, hashToken, linkExpiry, localToInstant, needsSecondConfirm, newToken, TOKEN_SHAPE,
} from '../../src/modules/intake/linkRules.js';

const ADDRESS = { line1: '400 S Orange Ave', line2: null, city: 'Orlando', state: 'FL', zip: '32801' };
const START = { lat: 28.537664, lon: -81.37965 };
/** A point `m` metres north of START (1° latitude ≈ 111,195 m). */
const north = (m: number) => ({ lat: START.lat + m / 111_195, lon: START.lon });
const NY = 'America/New_York';
const at = (iso: string) => new Date(iso);
const iso = (d: Date) => d.toISOString();

describe('E19 link rules', () => {
  it('AC-SEC-LINK-01: a token is 43 base64url characters from 32 random bytes; the stored hash is its SHA-256 hex', () => {
    const t = newToken();
    expect(t).toMatch(TOKEN_SHAPE);
    expect(Buffer.from(t, 'base64url')).toHaveLength(32);
    expect(newToken()).not.toBe(t);
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(hashPrefix(hashToken(t))).toBe(hashToken(t).slice(0, 8));
  });

  // America/New_York is EDT (UTC-4) on 29-31 Oct 2026 and EST (UTC-5) from 02:00 on 1 Nov 2026.
  it('AC-SEC-LINK-02: arrived 05:00, sent 05:10: the cut-off is under 3 h away, so 24 h after sending wins', () => {
    expect(iso(linkExpiry('2026-10-29 05:00', at('2026-10-29T09:10:00Z'), 24, NY))).toBe('2026-10-30T09:10:00.000Z');
  });

  it('AC-SEC-LINK-02: arrived 09:00, sent 09:30: 06:00 the next day (2 h before the 08:00 cut-off)', () => {
    expect(iso(linkExpiry('2026-10-29 09:00', at('2026-10-29T13:30:00Z'), 24, NY))).toBe('2026-10-30T10:00:00.000Z');
  });

  it("AC-SEC-LINK-02: sent 07:30 for that day's 08:00 cut-off: 06:00 the next day", () => {
    expect(iso(linkExpiry('2026-10-29 07:00', at('2026-10-29T11:30:00Z'), 24, NY))).toBe('2026-10-30T10:00:00.000Z');
  });

  it('AC-SEC-LINK-02: across the end of daylight saving the link lasts exactly 24 hours of real time', () => {
    const sent = at('2026-10-31T09:10:00Z'); // 05:10 EDT
    const expires = linkExpiry('2026-10-31 05:00', sent, 24, NY);
    expect(iso(expires)).toBe('2026-11-01T09:10:00.000Z'); // 04:10 EST
    expect(expires.getTime() - sent.getTime()).toBe(24 * 3_600_000);
  });

  it("SEC-LINK-02: the day after daylight saving ends, the 08:00 EST cut-off is 13:00Z, so the link stops at 11:00Z", () => {
    // arrived 1 Nov 09:00 EST, sent 09:30 EST: cut-off 2 Nov 08:00 EST = 13:00Z, minus 2 h
    expect(iso(linkExpiry('2026-11-01 09:00', at('2026-11-01T14:30:00Z'), 24, NY))).toBe('2026-11-02T11:00:00.000Z');
  });

  it('SEC-LINK-02: a link sent days after the email uses the next cut-off at least 3 hours away, and lasts at least 1 hour', () => {
    // sent 29 Oct 14:00 EDT: next cut-off 30 Oct 08:00 EDT (12:00Z), stop at 10:00Z
    expect(iso(linkExpiry('2026-09-25 10:00', at('2026-10-29T18:00:00Z'), 24, NY))).toBe('2026-10-30T10:00:00.000Z');
    // sent 30 Oct 05:30 EDT: that day's cut-off is 2.5 h away, so 31 Oct's; 24 h after sending is sooner
    expect(iso(linkExpiry('2026-09-25 10:00', at('2026-10-30T09:30:00Z'), 24, NY))).toBe('2026-10-31T09:30:00.000Z');
    // sent exactly 3 h before a cut-off: that cut-off stands and the link lasts exactly the 1-hour floor
    const sent = at('2026-10-30T09:00:00Z'); // 05:00 EDT
    expect(linkExpiry('2026-10-29 09:00', sent, 24, NY).getTime() - sent.getTime()).toBe(3_600_000);
  });

  it('SEC-LINK-02: a shorter lifetime setting wins when it is sooner', () => {
    expect(iso(linkExpiry('2026-10-29 09:00', at('2026-10-29T13:30:00Z'), 4, NY))).toBe('2026-10-29T17:30:00.000Z');
  });

  it("SEC-LINK-02: a local time converts to its instant with the zone's own daylight-saving rules", () => {
    expect(localToInstant('2026-10-30 06:00', 'UTC').toISOString()).toBe('2026-10-30T06:00:00.000Z');
    expect(localToInstant('2026-10-30 06:00', 'America/Chicago').toISOString()).toBe('2026-10-30T11:00:00.000Z');
    expect(localToInstant('2026-10-31 08:00', NY).toISOString()).toBe('2026-10-31T12:00:00.000Z'); // EDT
    expect(localToInstant('2026-11-01 08:00', NY).toISOString()).toBe('2026-11-01T13:00:00.000Z'); // EST
    expect(localToInstant('2026-03-08 08:00', NY).toISOString()).toBe('2026-03-08T12:00:00.000Z'); // EDT again
    expect(localToInstant('2026-03-08 02:30', NY).toISOString()).toBe('2026-03-08T07:30:00.000Z'); // gap: 03:30 EDT
    expect(localToInstant('2026-11-01 01:30', NY).toISOString()).toBe('2026-11-01T05:30:00.000Z'); // repeated: first (EDT)
  });

  it('AC-SEC-LINK-10: address text with CR/LF or other control characters is refused; line2 may be left out', () => {
    for (const bad of [{ line1: '1 Main St\r\nBcc: x@y' }, { city: 'Orlando\u0000' }, { line2: 'Apt\n2' }]) {
      expect(ConfirmBody.safeParse({ address: { ...ADDRESS, ...bad }, pin: START }).success, JSON.stringify(bad)).toBe(false);
    }
    const { line2: _omit, ...noLine2 } = ADDRESS as typeof ADDRESS & { line2?: unknown };
    expect(ConfirmBody.parse({ address: noLine2, pin: START }).address.line2).toBeNull();
  });

  it('AC-LINK-03: 600 m or a changed ZIP or no start pin needs a second Confirm; 400 m with the same ZIP does not', () => {
    const body = (pin: { lat: number; lon: number }, zip = '32801') => ConfirmBody.parse({ address: { ...ADDRESS, zip }, pin });
    expect(Math.round(distanceM(START, north(600)))).toBe(600);
    expect(needsSecondConfirm({ pin: START, zip: '32801' }, body(north(600)))).toBe(true);
    expect(needsSecondConfirm({ pin: START, zip: '32801' }, body(north(400)))).toBe(false);
    expect(needsSecondConfirm({ pin: START, zip: '32801' }, body(START, '32803'))).toBe(true);
    expect(needsSecondConfirm({ pin: null, zip: null }, body(START))).toBe(true);
  });

  it('AC-SEC-LINK-10: state XX, ZIP 1234, a 101-character city, latitude 91 and unknown keys are refused', () => {
    const bad = [{ state: 'XX' }, { zip: '1234' }, { city: 'x'.repeat(101) }, { line1: 'x'.repeat(101) }, { line2: 'x'.repeat(101) }];
    for (const b of bad) expect(ConfirmBody.safeParse({ address: { ...ADDRESS, ...b }, pin: START }).success, JSON.stringify(b)).toBe(false);
    expect(ConfirmBody.safeParse({ address: ADDRESS, pin: { lat: 91, lon: 0 } }).success).toBe(false);
    expect(ConfirmBody.safeParse({ address: ADDRESS, pin: { lat: 0, lon: -181 } }).success).toBe(false);
    expect(ConfirmBody.safeParse({ address: ADDRESS, pin: START, notMoved: true }).success).toBe(false);
    expect(ConfirmBody.safeParse({ address: { ...ADDRESS, zip: '32801-1234' }, pin: START }).success).toBe(true);
  });
});

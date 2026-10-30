import { describe, expect, it } from 'vitest';
import { createMapCredentials, getLinkDeps, setLinkDeps } from '../../src/modules/intake/linkDeps.js';
import { MAILBOX_TIMEZONE } from '../../src/modules/intake/mailbox.js';
import { allowList, Env } from '../../src/core/config.js';

describe('E19 link deps (A18)', () => {
  it('REQ-LINK-09: off by default; 24 h; the mailbox time zone; overrides for tests', () => {
    const d = getLinkDeps();
    expect(d.enabled).toBe(false);
    expect(d.hours).toBe(24);
    expect(d.timeZone).toBe(MAILBOX_TIMEZONE);
    setLinkDeps({ enabled: true, timeZone: 'UTC' });
    expect(getLinkDeps()).toMatchObject({ enabled: true, timeZone: 'UTC', hours: 24 });
    setLinkDeps({ enabled: false });
    expect(getLinkDeps()).toMatchObject({ enabled: false, timeZone: 'UTC' });
  });

  it('AC-LINK-17: CONFIRM_LINK_CODE defaults to on (empty too); the code goes out through ALLOW_LIST', () => {
    const base = { DATABASE_URL: 'postgres://x', API_KEY: 'k' };
    expect(Env.parse(base).CONFIRM_LINK_CODE).toBe('on');
    expect(Env.parse({ ...base, CONFIRM_LINK_CODE: '' }).CONFIRM_LINK_CODE).toBe('on');
    expect(Env.parse({ ...base, CONFIRM_LINK_CODE: 'off' }).CONFIRM_LINK_CODE).toBe('off');
    expect(getLinkDeps().outbox?.allow).toBe(allowList);
  });

  // The azure-maps issuer and its missing settings are tested without .env in maps-sas.test.ts.
  it('AC-SEC-LINK-08: the recorded issuer gives a SAS credential expiring with the link', async () => {
    const at = new Date('2026-10-31T06:00:00Z');
    expect(await createMapCredentials('recorded').issue(at)).toEqual({ kind: 'sas', token: 'recorded', expiresAt: at.toISOString() });
  });
});

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkConfirmLink, config, Env } from '../../src/core/config.js';

const API = fileURLToPath(new URL('../../', import.meta.url));

/** Loads the API's config in a fresh process, as `npm start` would, with these settings over the test ones. */
function loadConfig(env: Record<string, string>) {
  return spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', "await import('./src/core/config.ts')"],
    { cwd: API, env: { ...process.env, ...env }, encoding: 'utf8', timeout: 30_000 });
}

describe('E19 settings (REQ-LINK-09)', () => {
  it('AC-LINK-09: CONFIRM_LINK defaults to off and the lifetime to 24 hours', () => {
    expect(config.CONFIRM_LINK).toBe('off');
    const base = { DATABASE_URL: 'postgres://x', API_KEY: 'k' };
    expect(Env.parse(base)).toMatchObject({ CONFIRM_LINK: 'off', CONFIRM_LINK_HOURS: 24 });
    expect(Env.parse({ ...base, CONFIRM_LINK: '' }).CONFIRM_LINK).toBe('off');
    expect(Env.safeParse({ ...base, CONFIRM_LINK: 'yes' }).success).toBe(false);
    expect(Env.safeParse({ ...base, CONFIRM_LINK_HOURS: '0' }).success).toBe(false);
  });

  it('AC-LINK-09: with CONFIRM_LINK=on and no AUTH_URL the check names AUTH_URL; on with AUTH_URL passes; off passes', () => {
    expect(() => checkConfirmLink({ CONFIRM_LINK: 'on', AUTH_URL: undefined })).toThrow(/AUTH_URL/);
    expect(() => checkConfirmLink({ CONFIRM_LINK: 'on', AUTH_URL: 'https://latelens.example' })).not.toThrow();
    expect(() => checkConfirmLink({ CONFIRM_LINK: 'off', AUTH_URL: undefined })).not.toThrow();
  });

  it('AC-LINK-09: with CONFIRM_LINK=on AUTH_URL must be an origin only (the link is <AUTH_URL>/confirm/<token>)', () => {
    for (const ok of ['https://latelens.example', 'https://latelens.example/', 'http://localhost:3000']) {
      expect(() => checkConfirmLink({ CONFIRM_LINK: 'on', AUTH_URL: ok })).not.toThrow();
    }
    for (const bad of ['https://latelens.example/app', 'https://latelens.example/?x=1', 'https://latelens.example/#top', 'https://u:p@latelens.example']) {
      expect(() => checkConfirmLink({ CONFIRM_LINK: 'on', AUTH_URL: bad })).toThrow(/AUTH_URL must be an origin/);
    }
    expect(() => checkConfirmLink({ CONFIRM_LINK: 'off', AUTH_URL: 'https://latelens.example/app' })).not.toThrow();
  });

  it('AC-LINK-09: given CONFIRM_LINK=on and AUTH_URL unset, the API exits at start with an error naming AUTH_URL; with AUTH_URL it starts', () => {
    const bad = loadConfig({ CONFIRM_LINK: 'on', AUTH_URL: '' });
    expect(bad.status).not.toBe(0);
    expect(bad.stderr).toContain('CONFIRM_LINK=on needs AUTH_URL');
    const on = loadConfig({ CONFIRM_LINK: 'on', AUTH_URL: 'https://latelens.example' });
    expect(on.stderr).toBe('');
    expect(on.status).toBe(0); // A17: send_reply replaces the placeholder, so on with AUTH_URL starts
    const off = loadConfig({ CONFIRM_LINK: 'off', AUTH_URL: 'https://latelens.example' });
    expect(off.stderr).toBe('');
    expect(off.status).toBe(0);
  }, 60_000);
});

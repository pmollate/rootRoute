import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { appEnv } from '../src/core/config.js';

const ROOT = new URL('../../../', import.meta.url);
const read = (name: string) => readFileSync(new URL(`config/environments/${name}.env`, ROOT), 'utf8');

describe('dev, test and prod configuration (rubric 7.1)', () => {
  it('APP_ENV wins; otherwise NODE_ENV production or test; otherwise development', () => {
    expect(appEnv({ APP_ENV: 'production', NODE_ENV: 'test' })).toBe('production');
    expect(appEnv({ NODE_ENV: 'production' })).toBe('production');
    expect(appEnv({ NODE_ENV: 'test' })).toBe('test');
    expect(appEnv({})).toBe('development');
  });

  it('each environment has its own file, and none holds a secret', () => {
    for (const name of ['development', 'test', 'production']) {
      const text = read(name);
      expect(text).toContain(`APP_ENV=${name}`);
      expect(text).not.toMatch(/^(API_KEY|AZURE_\w*KEY|AUTH_SECRET|INTERNAL_AUTH_SECRET|GMAIL_\w*SECRET|GMAIL_REFRESH_TOKEN|MCP_TOKEN)=/m);
    }
    expect(read('test')).toMatch(/^LLM_PROVIDER=recorded$/m);
    expect(read('test')).toMatch(/^INTAKE_POLL_MINUTES=0$/m);
  });

  it('in test, test.env beats the root .env and a real variable beats both', () => {
    const run = (env: NodeJS.ProcessEnv) => execFileSync(process.execPath, ['--import', 'tsx', '-e',
      "import('./src/core/config.ts').then(() => console.log(process.env.APP_ENV, process.env.INTAKE_POLL_MINUTES))"],
    { cwd: new URL('../', import.meta.url), env: { PATH: process.env.PATH, API_KEY: 'k', DATABASE_URL: 'postgres://x', ...env }, encoding: 'utf8' }).trim();
    // test.env sets 0; it comes before the root .env (which may say 10), and a real variable still wins.
    expect(run({ NODE_ENV: 'test' })).toBe('test 0');
    expect(run({ NODE_ENV: 'test', INTAKE_POLL_MINUTES: '5' })).toBe('test 5');
  });
});

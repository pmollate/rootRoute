import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { pool, query } from '../../src/core/db/pool.js';
import { buildApp } from '../../src/server.js';
import { hasDb } from '../db.js';
import { AUTH_ON, bearer } from '../token.js';

describe.skipIf(!hasDb)('settings routes (needs test database)', () => {
  let app: FastifyInstance;
  const as = (roles: string[]) => bearer({ sub: `u-${roles.join('-')}`, name: 'Test user', roles });
  const set = async (enabled: unknown, roles: string[]) => app.inject({ method: 'POST', url: '/api/settings/auto-advance',
    headers: await as(roles), payload: { enabled } });
  const audits = async () => (await query<{ n: number }>(
    "SELECT count(*)::int AS n FROM audit_log WHERE action = 'set_auto_advance'"))[0].n;

  beforeAll(async () => {
    await query("DELETE FROM app_settings WHERE key = 'auto_advance'");
    app = await buildApp({ auth: AUTH_ON });
  });
  afterAll(async () => {
    // Leave it off: other route tests approve orders and expect APPROVED.
    await query("DELETE FROM app_settings WHERE key = 'auto_advance'");
    await app.close();
    await pool.end();
  });

  it('AC-SET-01: off by default, and every role can read it', async () => {
    for (const r of ['order_desk', 'leadership', 'admin']) {
      const res = await app.inject({ method: 'GET', url: '/api/settings', headers: await as([r]) });
      expect(res.json(), r).toEqual({ autoAdvance: false });
    }
  });

  it('AC-SET-01: only an admin can change it, with one audit row; a refusal writes nothing', async () => {
    const before = await audits();
    for (const r of ['order_desk', 'warehouse_supervisor', 'carrier_manager', 'customer_support', 'leadership']) {
      expect((await set(true, [r])).statusCode, r).toBe(403);
    }
    expect(await audits()).toBe(before);
    expect((await set('yes', ['admin'])).statusCode).toBe(400);
    expect((await set(true, ['admin'])).json()).toEqual({ autoAdvance: true });
    expect(await audits()).toBe(before + 1);
    const [row] = await query<{ actor: string; enabled: boolean }>(
      `SELECT actor, (payload->>'enabled')::boolean AS enabled FROM audit_log
        WHERE action = 'set_auto_advance' ORDER BY id DESC LIMIT 1`);
    expect(row).toEqual({ actor: 'u-admin', enabled: true });
    const read = await app.inject({ method: 'GET', url: '/api/settings', headers: await as(['order_desk']) });
    expect(read.json()).toEqual({ autoAdvance: true });
  });
});

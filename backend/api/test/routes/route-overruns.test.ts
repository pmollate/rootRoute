import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { rolesFor } from '../../src/core/permissions.js';
import { pool } from '../../src/core/db/pool.js';
import { buildApp } from '../../src/server.js';
import { runTool, toolByName } from '../../src/modules/mcp/tools.js';
import { hasDb } from '../db.js';
import { AUTH_ON, bearer } from '../token.js';

afterAll(() => pool.end());

describe('route overruns: who may read (SPEC-auth §4.4)', () => {
  it('AC-ROUTE-06: same roles as GET /api/carriers; order_desk is refused before the handler', async () => {
    expect(rolesFor('GET', '/api/routes/overruns')).toEqual(rolesFor('GET', '/api/carriers'));
    const a = await buildApp({ auth: AUTH_ON });
    for (const role of ['order_desk', 'warehouse_supervisor', 'customer_support']) {
      const r = await a.inject({ method: 'GET', url: '/api/routes/overruns', headers: await bearer({ sub: 'u1', roles: [role] }) });
      expect([role, r.statusCode]).toEqual([role, 403]);
    }
    await a.close();
  });
});

describe.skipIf(!hasDb)('GET /api/routes/overruns (needs test database)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const { query } = await import('../../src/core/db/pool.js');
    await query(`DO $$ BEGIN IF to_regclass('route_overruns_hidden') IS NOT NULL AND to_regclass('route_overruns') IS NULL THEN ALTER TABLE route_overruns_hidden RENAME TO route_overruns; END IF; END $$`);
    app = await buildApp();
  });

  it('AC-ROUTE-06: serves route_overruns in the CONTRACTS §6 shape', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/routes/overruns' });
    expect(res.statusCode).toBe(200);
    const r = res.json();
    expect(r.all).toMatchObject({ value: 'all', n: 48_340, nMeasured: 47_001, nOverrun: 2_880, nBlank: 1_339, standsOut: false });
    expect(r.all.pointsLost).toBeGreaterThan(0);
    expect(r.slices.map((s: { slice: string }) => s.slice)).toEqual(['carrier', 'region', 'warehouse', 'stops_band', 'weekday', 'month']);
    const carrier = r.slices[0];
    expect(carrier.rows.map((x: { value: string }) => x.value)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
    expect(carrier.rows.reduce((s: number, x: { nOverrun: number }) => s + x.nOverrun, 0)).toBe(2_880);
    expect(carrier.rows.every((x: { pointsLost: number | null }) => x.pointsLost === null)).toBe(true);
    expect(carrier.minRate).toBeLessThan(carrier.maxRate);
    expect(carrier.spreadPts).toBeCloseTo(100 * (carrier.maxRate - carrier.minRate), 6);
  });

  it('AC-ROUTE-06: a missing table (before the first pipeline run) answers 503, not 500', async () => {
    const { query } = await import('../../src/core/db/pool.js');
    const { clearCache } = await import('../../src/core/cache.js');
    await query(`DO $$ BEGIN IF to_regclass('route_overruns_hidden') IS NOT NULL AND to_regclass('route_overruns') IS NULL THEN ALTER TABLE route_overruns_hidden RENAME TO route_overruns; END IF; END $$`);
    await query('ALTER TABLE route_overruns RENAME TO route_overruns_hidden');
    try {
      clearCache();
      const res = await app.inject({ method: 'GET', url: '/api/routes/overruns' });
      expect(res.statusCode).toBe(503);
      expect(res.json()).toEqual({ error: 'route overruns not computed yet: run the pipeline' });
    } finally {
      await query('ALTER TABLE route_overruns_hidden RENAME TO route_overruns');
      clearCache();
    }
  });

  it('AC-ROUTE-07: the route_overruns tool returns the same data, or one slice', async () => {
    const t = toolByName('route_overruns')!;
    const all = await runTool(t, {}) as { all: { nOverrun: number }; slices: { slice: string }[] };
    expect(all.all.nOverrun).toBe(2_880);
    expect(all.slices).toHaveLength(6);
    const one = await runTool(t, { slice: 'carrier' }) as { all: { nOverrun: number }; slices: { slice: string }[] };
    expect(one.slices.map((x) => x.slice)).toEqual(['carrier']);
    expect(one.all.nOverrun).toBe(2_880);
  });
});

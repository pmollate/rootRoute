import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { clearCache } from '../../src/core/cache.js';
import { rolesFor } from '../../src/core/permissions.js';
import { pool, query } from '../../src/core/db/pool.js';
import { buildApp } from '../../src/server.js';
import { hasDb } from '../db.js';
import { AUTH_ON, bearer } from '../token.js';

afterAll(() => pool.end());

/** Put route_demo back if an earlier run crashed between the two ALTERs (the shared test DB would stay broken). */
const restoreRouteDemo = () => query(`DO $$ BEGIN IF to_regclass('route_demo_hidden') IS NOT NULL AND to_regclass('route_demo') IS NULL THEN ALTER TABLE route_demo_hidden RENAME TO route_demo; END IF; END $$`);

describe('route demo: who may read (SPEC-auth §4.4)', () => {
  it('AC-RDEMO-04: the Labs roles, as GET /api/compare; order_desk and customer_support are refused', async () => {
    for (const url of ['/api/labs/route-demo', '/api/labs/route-demo/:deliveryId']) expect(rolesFor('GET', url)).toEqual(rolesFor('GET', '/api/compare'));
    const a = await buildApp({ auth: AUTH_ON });
    for (const role of ['order_desk', 'customer_support']) {
      const r = await a.inject({ method: 'GET', url: '/api/labs/route-demo/D000001', headers: await bearer({ sub: 'u1', roles: [role] }) });
      expect([role, r.statusCode]).toEqual([role, 403]);
    }
    await a.close();
  });

  it('AC-RDEMO-06: no assistant, MCP or core analytics code reads route_demo', () => {
    const root = fileURLToPath(new URL('../../', import.meta.url));
    const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
    const files = [...walk(join(root, 'src/modules/mcp')), ...walk(join(root, 'src/modules/assistant')),
      ...walk(join(root, '../analytics/core'))].filter((f) => /\.(ts|py|md)$/.test(f));
    expect(files.length).toBeGreaterThan(5);
    expect(files.filter((f) => readFileSync(f, 'utf8').includes('route_demo'))).toEqual([]);
  });
});

describe.skipIf(!hasDb)('GET /api/labs/route-demo (needs test database)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { await restoreRouteDemo(); clearCache(); app = await buildApp(); });

  it('AC-RDEMO-04: the three examples, then one route in the §6 shape', async () => {
    const ex = (await app.inject({ method: 'GET', url: '/api/labs/route-demo' })).json();
    expect(ex.synthetic).toBe(true);
    expect(ex.examples.map((e: { kind: string }) => e.kind).sort()).toEqual(['no_distance', 'on_plan', 'overrun']);
    const r = (await app.inject({ method: 'GET', url: '/api/labs/route-demo/D000001' })).json();
    expect(r).toMatchObject({ synthetic: true, deliveryId: 'D000001', nStops: 10, plannedKm: 71.7, actualKm: 74.4, overran: false });
    expect(r.stops).toHaveLength(10);
    expect([...r.optimisedOrder].sort((a: number, b: number) => a - b)).toEqual([...Array(10).keys()]);
    expect(r.optimisedKm).toBeLessThanOrEqual(r.plannedKm + 0.01);
  });

  it('AC-RDEMO-04: 400 for a bad id, 404 for an unknown one, 503 when the table is missing', async () => {
    for (const id of ['D1', 'x', 'D0000001']) {
      const r = await app.inject({ method: 'GET', url: `/api/labs/route-demo/${id}` });
      expect([id, r.statusCode, r.json()]).toEqual([id, 400, { error: 'bad_delivery_id' }]);
    }
    const nf = await app.inject({ method: 'GET', url: '/api/labs/route-demo/D999999' });
    expect([nf.statusCode, nf.json()]).toEqual([404, { error: 'not_found' }]);
    await restoreRouteDemo();
    await query('ALTER TABLE route_demo RENAME TO route_demo_hidden');
    try {
      clearCache();
      for (const url of ['/api/labs/route-demo', '/api/labs/route-demo/D000001']) {
        expect((await app.inject({ method: 'GET', url })).statusCode, url).toBe(503);
      }
    } finally {
      await query('ALTER TABLE route_demo_hidden RENAME TO route_demo');
      clearCache();
    }
  });

  it('AC-RDEMO-04: an empty examples answer is not cached; it fills in once rows exist', async () => {
    await restoreRouteDemo();
    await query('ALTER TABLE route_demo RENAME TO route_demo_hidden');
    try {
      await query('CREATE TABLE route_demo (LIKE route_demo_hidden)');
      clearCache();
      expect((await app.inject({ method: 'GET', url: '/api/labs/route-demo' })).statusCode).toBe(503);
      await query('DROP TABLE route_demo');
      await query('ALTER TABLE route_demo_hidden RENAME TO route_demo');
      const r = await app.inject({ method: 'GET', url: '/api/labs/route-demo' });
      expect([r.statusCode, r.json().examples.length]).toEqual([200, 3]);
    } finally {
      await query(`DO $$ BEGIN IF to_regclass('route_demo_hidden') IS NOT NULL THEN DROP TABLE IF EXISTS route_demo; ALTER TABLE route_demo_hidden RENAME TO route_demo; END IF; END $$`);
      clearCache();
    }
  });
});

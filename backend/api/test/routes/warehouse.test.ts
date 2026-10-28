import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { pool } from '../../src/core/db/pool.js';
import { diagnosisApi, warehouseApi } from '../../src/modules/warehouse/index.js';
import { buildApp } from '../../src/server.js';
import { hasDb } from '../db.js';

describe.skipIf(!hasDb)('warehouse & diagnosis routes (needs test database)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => pool.end());
  const get = async (url: string) => (await app.inject({ method: 'GET', url })).json();

  it('AC-UI-01 (data): overview shows 71.0% on-time', async () => {
    const o = await get('/api/overview');
    expect(o.onTime).toBeCloseTo(0.71, 3);
    expect(o).toMatchObject({ late: 14019, penaltiesUsd: 872460, atRiskAccounts: 9 });
  });

  it('serves causes and replay per segment, and rejects unknown segments', async () => {
    expect((await get('/api/causes?segment=email')).causes.length).toBeGreaterThan(5);
    const replay = await get('/api/replay?segment=all');
    expect(replay.scenarios.find((s: { scenario: string }) => s.scenario === 'adopt_all').onTime).toBeCloseTo(0.92, 3);
    expect((await app.inject({ method: 'GET', url: '/api/causes?segment=nope' })).statusCode).toBe(400);
  });

  it('AC-PEN-01 and second pick through the API', async () => {
    expect((await get('/api/penalties/unpaid')).count).toBe(2002);
    const w = await get('/api/warehouses');
    expect(w.secondPick.movedOrders).toBe(2414);
    expect(w.secondPick.onTime).toBeCloseTo(0.734, 3);
    expect(w.distances).toContainEqual({ warehouseId: 'W5', region: 'Midwest', miles: 1600 });
  });

  it('AC-DIAG-06: attribution sums to the late rate; one KPI per cause', async () => {
    const a = await get('/api/attribution');
    expect(a.causes.reduce((s: number, c: { pointsLost: number }) => s + c.pointsLost, 0)).toBeCloseTo(0.29, 2);
    expect(a.causes[0].cause).toBe('f_lane');
    const k = await get('/api/cause-kpis');
    expect(new Set(k.kpis.map((x: { cause: string }) => x.cause))).toEqual(new Set(['f_addr', 'f_lane', 'f_stock', 'f_cutoff', 'f_route', 'none']));
  });

  it('contract: nearestWarehouse and getDeliveryCauses read the Python tables', async () => {
    expect(['W1', 'W2']).toContain(await warehouseApi.nearestWarehouse('C003', 'Midwest'));
    expect(await warehouseApi.nearestWarehouse('C003', 'West')).toBe('W5');
    const c = await diagnosisApi.getDeliveryCauses('D000002');
    expect(c?.stages).toContain('Fulfilment');
  });

  it('AC-NFR-01: read endpoints answer within 2 s at p95', async () => {
    const times: number[] = [];
    for (let i = 0; i < 20; i += 1) {
      const t = performance.now();
      await app.inject({ method: 'GET', url: '/api/overview' });
      times.push(performance.now() - t);
    }
    expect(times.sort((a, b) => a - b)[18]).toBeLessThan(2000);
  });
});

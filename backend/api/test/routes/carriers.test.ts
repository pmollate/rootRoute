import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { pool, query } from '../../src/core/db/pool.js';
import { buildApp } from '../../src/server.js';
import { hasDb } from '../db.js';

describe.skipIf(!hasDb)('carrier routes (needs test database)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => pool.end());

  it('AC-CAR-03 through the API', async () => {
    const r = (await app.inject({ method: 'GET', url: '/api/carriers?region=Northeast&commitment=next_day' })).json();
    expect(r.recommendation.reason).toBe('Carrier E for Northeast next-day: 97% on time vs 55% for F; $1.62 more per shipment');
  });

  it('AC-CAR-06: an override is logged with order, from, to, reason and user', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/overrides', headers: { 'x-api-key': 'test-key' },
      payload: { orderRef: 'ORD-1', from: 'E', to: 'A', reason: 'client asked for A', user: 'ops' } });
    expect(res.statusCode).toBe(200);
    const [row] = await query('SELECT order_ref, from_carrier, to_carrier, reason, user_name FROM override_log WHERE id = $1', [res.json().id]);
    expect(row).toEqual({ order_ref: 'ORD-1', from_carrier: 'E', to_carrier: 'A', reason: 'client asked for A', user_name: 'ops' });
  });
});

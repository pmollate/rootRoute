import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { pool, query } from '../../src/core/db/pool.js';
import { buildApp } from '../../src/server.js';
import { hasDb } from '../db.js';

describe.skipIf(!hasDb)('tracking route (needs test database)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => pool.end());

  it('AC-TRK-02: a delivery promised 2026-09-10 and delivered later is at risk at end of 2026-09-10', async () => {
    const [late] = await query<{ delivery_id: string }>(
      "SELECT delivery_id FROM deliveries_clean WHERE promised_date::date = '2026-09-10' AND delivered_date::date > '2026-09-10' LIMIT 1");
    const r = (await app.inject({ method: 'GET', url: '/api/tracking?asOf=2026-09-10' })).json();
    expect(r.synthetic).toBe(true);
    expect(r.atRisk.map((a: { deliveryId: string }) => a.deliveryId)).toContain(late.delivery_id);
  });
});

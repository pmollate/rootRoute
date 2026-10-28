import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { pool, query } from '../../src/core/db/pool.js';
import { buildApp } from '../../src/server.js';
import { hasDb } from '../db.js';

const KEY = { 'x-api-key': 'test-key' };

describe.skipIf(!hasDb)('alert routes (needs test database)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => pool.end());

  it('AC-RISK-03: each drafted alert has exactly one row', async () => {
    await query('DELETE FROM alerts');
    const { drafted } = (await app.inject({ method: 'POST', url: '/api/alerts/run', headers: KEY, payload: { asOf: '2026-09-18' } })).json();
    const [{ n }] = await query<{ n: number }>('SELECT count(*) AS n FROM alerts');
    expect(n).toBe(drafted);
    expect(drafted).toBeGreaterThan(0);
  });
});

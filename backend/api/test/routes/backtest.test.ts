import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { pool } from '../../src/core/db/pool.js';
import { buildApp } from '../../src/server.js';
import { hasDb } from '../db.js';

describe.skipIf(!hasDb)('backtest route (needs test database)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => pool.end());

  it('AC-CAR-05 through the API', async () => {
    const r = (await app.inject({ method: 'GET', url: '/api/carriers/backtest' })).json();
    expect(r.rows.map((x: { choice: string }) => x.choice)).toEqual(['actual', 'recommended']);
  });
});

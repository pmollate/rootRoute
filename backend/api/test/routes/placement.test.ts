import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { pool } from '../../src/core/db/pool.js';
import { buildApp } from '../../src/server.js';
import { hasDb } from '../db.js';

describe.skipIf(!hasDb)('placement route (needs test database)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => pool.end());
  const get = async (url: string) => (await app.inject({ method: 'GET', url })).json();

  it('placement is labelled synthetic', async () => {
    expect((await get('/api/placement')).synthetic).toBe(true);
  });
});

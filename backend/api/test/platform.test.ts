import { afterAll, describe, expect, it } from 'vitest';
import { migrate } from '../src/core/db/migrate.js';
import { pool } from '../src/core/db/pool.js';
import { buildApp } from '../src/server.js';
import { hasDb } from './db.js';

describe.skipIf(!hasDb)('platform (needs test database)', () => {
  afterAll(() => pool.end());

  it('health reports the database and AI provider', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ db: 'ok', llm: 'recorded' });
  });

  it('migrations are idempotent', async () => {
    await migrate();
    expect(await migrate()).toEqual([]);
    const { rows } = await pool.query("SELECT to_regclass('public.audit_log') AS t");
    expect(rows[0].t).toBe('audit_log');
  });
});

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { pool, query } from '../../src/core/db/pool.js';
import { buildApp } from '../../src/server.js';
import { hasDb } from '../db.js';

// Record every statement the API runs: other test files write these tables in parallel, so counting rows would be racy.
vi.mock('../../src/core/db/pool.js', async (original) => {
  const m = await original<typeof import('../../src/core/db/pool.js')>();
  return { ...m, query: vi.fn(m.query) };
});
const writes = () => vi.mocked(query).mock.calls.map(([sql]) => String(sql)).filter((sql) => /^\s*(INSERT|UPDATE|DELETE)/i.test(sql));

describe.skipIf(!hasDb)('journey route (needs test database)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => pool.end());

  it('AC-JRN-07: D000213 (incomplete address, carrier F to the Northeast) fails at address and carrier', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/journey/delivery:D000213' });
    expect(res.statusCode).toBe(200);
    const j = res.json();
    expect(j.summary).toMatchObject({ clientId: 'C190', channel: 'Email', destination: 'Northeast', outcome: '4 days late' });
    const failed = j.stages.filter((s: { status: string }) => s.status === 'failed').map((s: { key: string }) => s.key);
    expect(failed).toEqual(['address', 'carrier', 'delivered']);
    const carrier = j.stages.find((s: { key: string }) => s.key === 'carrier');
    expect(carrier.withLateLens).toMatch(/^Carrier [A-E] for Northeast standard: .* vs \d+% for F/);
    expect(j.stages.find((s: { key: string }) => s.key === 'transit').at).toBe('2026-04-02 15:56');
  });

  it('AC-JRN-02 / SEC-JRN-02: building journeys writes nothing', async () => {
    const [email] = await query<{ id: number }>('SELECT id FROM intake_emails ORDER BY id LIMIT 1');
    vi.mocked(query).mockClear();
    expect((await app.inject({ method: 'GET', url: '/api/journey/delivery:D000213' })).statusCode).toBe(200);
    if (email) expect((await app.inject({ method: 'GET', url: `/api/journey/email:${email.id}` })).statusCode).toBe(200);
    expect(vi.mocked(query).mock.calls.length).toBeGreaterThan(0);
    expect(writes()).toEqual([]);
  });

  it('AC-JRN-01: an unknown ref is 404 and a malformed ref is 400', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/journey/delivery:D999999' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/journey/email:999999' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/journey/order:1' })).statusCode).toBe(400);
  });
});

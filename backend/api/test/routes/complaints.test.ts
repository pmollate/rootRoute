import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { pool } from '../../src/core/db/pool.js';
import { buildApp } from '../../src/server.js';
import { hasDb } from '../db.js';

describe.skipIf(!hasDb)('complaint routes (needs test database)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => pool.end());

  it('AC-CMP-01 and AC-CMP-03: all 34 complaints link to a delivery; 28 before pickup; 24 escalated (Tier 1 or at risk)', async () => {
    const { complaints } = (await app.inject({ method: 'GET', url: '/api/complaints' })).json() as { complaints: { complaintId: string }[] };
    expect(complaints).toHaveLength(34);
    let prePickup = 0;
    let escalated = 0;
    for (const c of complaints) {
      const t = (await app.inject({ method: 'POST', url: `/api/complaints/${c.complaintId}/triage` })).json();
      expect(t.deliveryId).toMatch(/^D\d{6}$/);
      prePickup += Number(t.prePickup);
      escalated += Number(t.escalate);
    }
    expect([prePickup, escalated]).toEqual([28, 24]);
  });
});

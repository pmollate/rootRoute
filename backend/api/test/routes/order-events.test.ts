import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { pool, query } from '../../src/core/db/pool.js';
import { recordOrderEvent } from '../../src/modules/carriers/index.js';
import { buildApp } from '../../src/server.js';
import { hasDb } from '../db.js';

describe.skipIf(!hasDb)('order events route (needs test database)', () => {
  let app: FastifyInstance;
  let id: number;
  const AUTH = { authorization: 'Bearer test-wms-events-0123456789' };
  const post = (ref: string, payload: object, headers: Record<string, string> = AUTH) =>
    app.inject({ method: 'POST', url: `/api/orders/${ref}/events`, payload, headers });
  const count = async () => (await query<{ n: number }>(
    'SELECT count(*)::int AS n FROM order_events WHERE order_ref = $1', [`email:${id}`]))[0].n;

  beforeAll(async () => {
    app = await buildApp();
    const [row] = await query<{ id: number }>(
      `INSERT INTO intake_emails (source, from_addr, subject, body, received_at, hash, status)
       VALUES ('paste', 'orders@client025.example', '[SYNTHETIC] events test', '[SYNTHETIC] events test',
               '2026-10-30 07:30', $1, 'ENTERED') RETURNING id`, [`order-events-test-${Date.now()}`]);
    id = row.id;
    await query('DELETE FROM order_events WHERE order_ref = $1', [`email:${id}`]);
  });
  afterAll(() => pool.end());

  it('AC-SEC-JRN-04: without the token or with a wrong one, 401 and nothing written', async () => {
    expect((await post(`email:${id}`, { event: 'picked' }, {})).statusCode).toBe(401);
    expect((await post(`email:${id}`, { event: 'picked' }, { authorization: 'Bearer wrong' })).statusCode).toBe(401);
    expect(await count()).toBe(0);
  });

  it('AC-JRN-13: a bad ref or body is 400, an unknown email 404, an order not in the WMS 409', async () => {
    expect((await post('delivery:D000213', { event: 'picked' })).statusCode).toBe(400);
    expect((await post(`email:${id}`, { event: 'wms_entered' })).statusCode).toBe(400);
    expect((await post(`email:${id}`, { event: 'picked', ts: '30/10/2026' })).statusCode).toBe(400);
    expect((await post(`email:${id}`, { event: 'picked', ts: '2026-02-31 10:00' })).statusCode).toBe(400);
    expect((await post(`email:${id}`, { event: 'picked', ts: '2026-13-45 99:99' })).statusCode).toBe(400);
    expect((await post('email:999999', { event: 'picked' })).statusCode).toBe(404);
    const r = await post(`email:${id}`, { event: 'picked', ts: '2026-10-30 10:00' });
    expect(r.statusCode).toBe(409);
    expect(r.json()).toEqual({ error: 'order is not in the WMS' });
  });

  it('AC-JRN-13: the five steps in order are 201; out of order, early and changed repeats are 409; a same repeat is 200', async () => {
    expect((await recordOrderEvent({ orderRef: `email:${id}`, event: 'wms_entered', ts: '2026-10-30 09:00',
      detail: { wmsOrderId: 'WMS-TEST' } })).code).toBe(201);
    expect((await post(`email:${id}`, { event: 'picked_up', ts: '2026-10-30 10:00' })).json())
      .toEqual({ error: 'picked_up needs picked first' });
    const picked = await post(`email:${id}`, { event: 'picked', ts: '2026-10-30 10:00' });
    expect(picked.statusCode).toBe(201);
    expect(picked.json()).toEqual({ event: 'picked', ts: '2026-10-30 10:00' });
    expect((await post(`email:${id}`, { event: 'picked', ts: '2026-10-30 10:00' })).statusCode).toBe(200);
    expect((await post(`email:${id}`, { event: 'picked', ts: '2026-10-30 11:00' })).statusCode).toBe(409);
    expect((await post(`email:${id}`, { event: 'picked_up', ts: '2026-10-30 09:30' })).json())
      .toEqual({ error: 'ts before picked' });
    for (const [event, ts] of [['picked_up', '2026-10-30 14:00'], ['in_transit', '2026-10-30 18:00'],
      ['out_for_delivery', '2026-10-31 08:00'], ['delivered', '2026-11-02 14:00']]) {
      expect((await post(`email:${id}`, { event, ts })).statusCode, event).toBe(201);
    }
    expect(await count()).toBe(6);
    const rows = await query<{ synthetic: boolean }>('SELECT synthetic FROM order_events WHERE order_ref = $1', [`email:${id}`]);
    expect(rows.every((r) => r.synthetic)).toBe(true);
  });
});

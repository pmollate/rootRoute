import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { pool, query } from '../../src/core/db/pool.js';
import { autoAdvanceOrder, recordOrderEvent } from '../../src/modules/carriers/index.js';
import { localNow } from '../../src/modules/carriers/orderEvents.js';
import { addDays } from '../../src/modules/warehouse/domain.js';
import { buildApp } from '../../src/server.js';
import { hasDb } from '../db.js';

// Design docs/superpowers/specs/2026-10-30-order-journey-auto-advance-design.md §7: events with a visible_at in the future
// are written, ordered and repeat-checked, but not shown in the journey yet.
describe.skipIf(!hasDb)('order events shown over time (needs test database)', () => {
  let app: FastifyInstance;
  const KEYS = ['wms', 'picked', 'handed', 'transit', 'delivered'];
  const newEmail = async (tag: string) => {
    const id = (await query<{ id: number }>(
      `INSERT INTO intake_emails (source, from_addr, subject, body, received_at, hash, status)
       VALUES ('paste', 'orders@client025.example', '[SYNTHETIC] auto-advance test', '[SYNTHETIC] auto-advance test',
               '2026-10-30 07:30', $1, 'ENTERED') RETURNING id`, [`auto-advance-${tag}-${Date.now()}`]))[0].id;
    await query('DELETE FROM order_events WHERE order_ref = $1', [`email:${id}`]);
    return id;
  };
  const stages = async (id: number) => {
    const j = (await app.inject({ method: 'GET', url: `/api/journey/email:${id}` })).json() as
      { stages: { key: string; status: string }[] };
    return KEYS.map((k) => j.stages.find((s) => s.key === k)?.status);
  };

  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); await pool.end(); });

  it('REQ-JRN-15: a step whose visible_at is still ahead is left out of the journey, but the writer orders after it', async () => {
    const id = await newEmail('hidden');
    const ref = `email:${id}`;
    const later = new Date(Date.now() + 60_000);
    expect((await recordOrderEvent({ orderRef: ref, event: 'wms_entered', ts: '2026-10-30 09:00',
      detail: { wmsOrderId: 'WMS-TEST' } })).code).toBe(201);
    expect((await recordOrderEvent({ orderRef: ref, event: 'picked', ts: '2026-10-30 10:00', visibleAt: later })).code).toBe(201);
    // The writer sees the hidden `picked`, so `picked_up` is accepted after it.
    expect((await recordOrderEvent({ orderRef: ref, event: 'picked_up', ts: '2026-10-30 15:00', visibleAt: later })).code).toBe(201);
    expect(await stages(id)).toEqual(['done', 'current', 'not_reached', 'not_reached', 'not_reached']);
  });

  it('AC-JRN-17: 7 s after approval steps 9–10 are done and 11 is current; 26 s after, it is delivered', async () => {
    const order = (id: number, n: string) => ({ orderRef: `email:${id}`, receivedAt: '2026-10-30 07:30',
      promiseDate: addDays(localNow().slice(0, 10), 4), wmsOrderId: `WMS-${n}` });
    const early = await newEmail('early');
    expect(await autoAdvanceOrder(order(early, 'T1'), new Date(Date.now() - 7_000))).toEqual({ ok: true });
    expect(await stages(early)).toEqual(['done', 'done', 'current', 'not_reached', 'not_reached']);
    const late = await newEmail('late');
    expect(await autoAdvanceOrder(order(late, 'T2'), new Date(Date.now() - 26_000))).toEqual({ ok: true });
    expect(await stages(late)).toEqual(['done', 'done', 'done', 'done', 'done']);
  });
});

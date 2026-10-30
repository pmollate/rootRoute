import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { AuthUser, CarriersApi, WarehouseApi } from '../../src/core/contracts.js';
import type { LLM } from '../../src/core/llm/types.js';
import type { AddressValidator } from '../../src/core/maps/types.js';
import type { PiiDetector } from '../../src/core/pii/types.js';
import { applyAction, type AutoAdvance, type OrderEventLog } from '../../src/modules/intake/actions.js';
import { processEmail } from '../../src/modules/intake/pipeline.js';
import type { Extraction } from '../../src/modules/intake/schema.js';
import { httpWms, type Wms, type WmsOrder } from '../../src/modules/intake/wms.js';
import { checkPromise } from '../../src/modules/warehouse/domain.js';
import { memoryRepo } from './memoryRepo.js';

// Test values only (as in review.test.ts): a Boston order, nearest warehouse W4, carrier E.
const C025 = { client_id: 'C025', client_name: 'Client 25', sla_penalty_clause: 'N', region: 'Northeast', account_tier: 'Tier 2', account_status: 'active' };
const ORDER: Extraction = { items: [{ sku: 'HX-616', qty: 45 }], requested_commitment: 'next_day', confidence: { items: 0.95, address: 0.9 },
  address: { line1: '12 Main St', line2: null, city: 'Boston', state: 'MA', zip: '02110', raw: null } };
const BODY = '[SYNTHETIC] Please ship 45 x HX-616 to 12 Main St, Boston, MA 02110. Thanks, Pat Lee, 617-555-0100';
const warehouse: WarehouseApi = { checkPromise, nearestWarehouse: async () => 'W4',
  pickWarehouse: async (i) => ({ warehouseId: i.nearestWarehouseId, reason: 'nearest', warnClient: false }) };
const carriers: CarriersApi = { recommendCarrier: async () => ({ carrier: 'E', backup: 'A', reason: 'E: best on this lane', blocked: [], options: [] }) };
const llm: LLM = { name: 'fake', json: async () => structuredClone(ORDER) as never, text: async () => { throw new Error('offline'); } };
const pii: PiiDetector = { name: 'fake-pii', detect: async () => [] };
const maps: AddressValidator = { name: 'fake-map', geocode: async (q) => ({ features: [{ properties: { type: 'Address',
  confidence: 'High', matchCodes: ['Good'], address: { addressLine: q.line1, locality: q.city, postalCode: q.zip,
    adminDistricts: [{ shortName: q.state }] } } }] }) };
const sup: AuthUser = { id: 's1', name: 'Sam Super', roles: ['warehouse_supervisor'], demo: false };

/** An ALL_CLEAR order, approved, with a fake WMS and a fake order event log that record what they got. */
async function approved(wmsAnswer: (o: WmsOrder) => Promise<{ wmsOrderId: string }>,
  eventAnswer: Awaited<ReturnType<OrderEventLog>> = { code: 201 }) {
  const mem = memoryRepo({ 'client025.example': C025 }, []);
  const r = await processEmail({ from: 'orders@client025.example', subject: '[SYNTHETIC] Order', body: BODY, receivedAt: '2026-10-22 07:30' },
    { llm, pii, maps, repo: mem.repo, warehouse, carriers, gmail: null });
  expect(r.decision).toBe('ALL_CLEAR');
  expect(await applyAction(mem.repo, r.id, 'approve', sup)).toEqual({ code: 200, status: 'APPROVED' });
  const sent: WmsOrder[] = [];
  const events: Parameters<OrderEventLog>[0][] = [];
  const wms: Wms = { sendOrder: async (o) => { sent.push(o); return wmsAnswer(o); } };
  const orderEvents: OrderEventLog = async (e) => { events.push(e); return eventAnswer; };
  return { mem, id: r.id, sent, events, wms, orderEvents };
}

describe('send_to_wms with the WMS (design §5)', () => {
  it('AC-JRN-05: the WMS accepts: ENTERED, one wms_entered event with its order number, the number in the audit row', async () => {
    const t = await approved(async () => ({ wmsOrderId: 'WMS-000001' }));
    const r = await applyAction(t.mem.repo, t.id, 'send_to_wms', sup, undefined, { wms: t.wms, orderEvents: t.orderEvents });
    expect(r).toEqual({ code: 200, status: 'ENTERED' });
    expect(t.events).toEqual([{ orderRef: `email:${t.id}`, event: 'wms_entered', detail: { wmsOrderId: 'WMS-000001' } }]);
    expect(t.mem.audit.at(-1)).toMatchObject({ action: 'send_to_wms', user: 's1', payload: { wmsOrderId: 'WMS-000001' } });
    expect(t.sent[0]).toMatchObject({ orderRef: `email:${t.id}`, clientId: 'C025', warehouseId: 'W4', carrier: 'E',
      commitment: 'next_day', destination: { city: 'Boston', state: 'MA', zip: '02110' }, items: [{ sku: 'HX-616', qty: 45 }] });
    expect(t.sent[0].promiseDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // AC-JRN-19: a second click finds the order ENTERED: 200, and nothing more is sent or recorded.
    expect(await applyAction(t.mem.repo, t.id, 'send_to_wms', sup, undefined, { wms: t.wms, orderEvents: t.orderEvents }))
      .toEqual({ code: 200, status: 'ENTERED' });
    expect(t.sent).toHaveLength(1);
    expect(t.events).toHaveLength(1);
  });

  it('AC-JRN-05: the WMS fails or times out: 503, the order stays APPROVED, no event', async () => {
    const t = await approved(async () => { throw new Error('WMS answered 500'); });
    expect(await applyAction(t.mem.repo, t.id, 'send_to_wms', sup, undefined, { wms: t.wms, orderEvents: t.orderEvents }))
      .toEqual({ code: 503, error: 'WMS not reachable', cause: 'WMS answered 500' });
    expect((await t.mem.repo.getEmail(t.id))?.status).toBe('APPROVED');
    expect(t.events).toEqual([]);
  });

  it('AC-JRN-05: without a WMS (WMS_URL unset) it behaves as before: ENTERED, no event', async () => {
    const t = await approved(async () => ({ wmsOrderId: 'never' }));
    expect(await applyAction(t.mem.repo, t.id, 'send_to_wms', sup, undefined, { wms: null, orderEvents: t.orderEvents }))
      .toEqual({ code: 200, status: 'ENTERED' });
    expect(t.sent).toEqual([]);
    expect(t.events).toEqual([]);
  });

  it('a retry after a lost response finds wms_entered already recorded and still enters the order', async () => {
    const t = await approved(async () => ({ wmsOrderId: 'WMS-000001' }), { code: 409, error: 'already recorded' });
    expect(await applyAction(t.mem.repo, t.id, 'send_to_wms', sup, undefined, { wms: t.wms, orderEvents: t.orderEvents }))
      .toEqual({ code: 200, status: 'ENTERED' });
  });

  it('AC-SEC-JRN-04: the body sent to the WMS has no names, phone numbers, email addresses or street line', async () => {
    const t = await approved(async () => ({ wmsOrderId: 'WMS-000001' }));
    await applyAction(t.mem.repo, t.id, 'send_to_wms', sup, undefined, { wms: t.wms, orderEvents: t.orderEvents });
    const json = JSON.stringify(t.sent[0]);
    for (const leak of ['Pat Lee', '617-555-0100', '@', '12 Main St']) expect(json).not.toContain(leak);
  });
});

describe('httpWms (design §4)', () => {
  let server: Server | undefined;
  afterEach(() => new Promise<void>((done) => {
    if (!server) return done();
    server.closeAllConnections();
    server.close(() => done());
  }));
  const serve = (handler: Parameters<typeof createServer>[1]) => new Promise<string>((done) => {
    server = createServer(handler).listen(0, '127.0.0.1', () => done(`http://127.0.0.1:${(server!.address() as AddressInfo).port}`));
  });
  const order = { orderRef: 'email:1' } as WmsOrder;

  it('is null when WMS_URL is unset', () => expect(httpWms(undefined, 'x')).toBeNull());

  it('POSTs the order to /orders with the Bearer token and returns the WMS order number', async () => {
    let seen = { url: '', auth: '', body: '' };
    const url = await serve((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        seen = { url: req.url ?? '', auth: req.headers.authorization ?? '', body };
        res.writeHead(201, { 'content-type': 'application/json' }).end(JSON.stringify({ wmsOrderId: 'WMS-000001' }));
      });
    });
    expect(await httpWms(url, 'wms-token-0123456789')!.sendOrder(order)).toEqual({ wmsOrderId: 'WMS-000001' });
    expect(seen).toEqual({ url: '/orders', auth: 'Bearer wms-token-0123456789', body: JSON.stringify(order) });
  });

  it('throws on a non-2xx answer, an answer without wmsOrderId, and a timeout', async () => {
    let answer: (res: import('node:http').ServerResponse) => void = (res) => res.writeHead(500).end();
    const url = await serve((_req, res) => answer(res));
    await expect(httpWms(url, 't')!.sendOrder(order)).rejects.toThrow(/500/);
    answer = (res) => res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
    await expect(httpWms(url, 't')!.sendOrder(order)).rejects.toThrow(/wmsOrderId/);
    answer = (res) => setTimeout(() => res.writeHead(201).end('{"wmsOrderId":"late"}'), 300);
    await expect(httpWms(url, 't', 50)!.sendOrder(order)).rejects.toThrow();
  });
});

describe('auto-advance on approval (design 2026-10-30-order-journey-auto-advance §5)', () => {
  const desk: AuthUser = { id: 'd1', name: 'Dee Desk', roles: ['order_desk'], demo: false };

  /** An ALL_CLEAR order awaiting approval, and a fake auto-advance that records what it was asked to run. */
  async function pending(on: boolean, result: { ok: boolean; error?: string } = { ok: true }, boom?: 'on' | 'run') {
    const mem = memoryRepo({ 'client025.example': C025 }, []);
    const r = await processEmail({ from: 'orders@client025.example', subject: '[SYNTHETIC] Order', body: BODY, receivedAt: '2026-10-22 07:30' },
      { llm, pii, maps, repo: mem.repo, warehouse, carriers, gmail: null });
    const runs: Parameters<AutoAdvance['run']>[0][] = [];
    const autoAdvance: AutoAdvance = {
      on: async () => { if (boom === 'on') throw new Error('db down'); return on; },
      run: async (o) => { if (boom === 'run') throw new Error('db down'); runs.push(o); return result; } };
    const approve = () => applyAction(mem.repo, r.id, 'approve', desk, undefined, { autoAdvance });
    return { mem, id: r.id, runs, approve };
  }

  it('AC-JRN-15: switch on: approval enters the order and runs steps 10–13, the entry recorded as system:auto-advance', async () => {
    const t = await pending(true);
    expect(await t.approve()).toEqual({ code: 200, status: 'ENTERED' });
    expect(t.runs).toEqual([{ orderRef: `email:${t.id}`, receivedAt: '2026-10-22 07:30',
      promiseDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), wmsOrderId: `WMS-${String(t.id).padStart(6, '0')}` }]);
    expect((await t.mem.repo.getEmail(t.id))?.status).toBe('ENTERED');
    expect(t.mem.audit.slice(-2).map((a) => [a.action, a.user])).toEqual([['approve', 'd1'], ['send_to_wms', 'system:auto-advance']]);
  });

  it('AC-JRN-16: switch off: approval only approves, and nothing runs', async () => {
    const t = await pending(false);
    expect(await t.approve()).toEqual({ code: 200, status: 'APPROVED' });
    expect(t.runs).toEqual([]);
  });

  it('a failed run keeps the approval, leaves the order APPROVED and says to send it by hand', async () => {
    const t = await pending(true, { ok: false, error: 'picked: db down' });
    expect(await t.approve()).toEqual({ code: 200, status: 'APPROVED',
      warning: 'Auto-advance did not run (picked: db down): send it to the WMS by hand.' });
    expect((await t.mem.repo.getEmail(t.id))?.status).toBe('APPROVED');
  });

  it.each(['run', 'on'] as const)('design §5: %s throwing after the approval is saved answers 200 APPROVED with a warning, never 500', async (boom) => {
    const t = await pending(true, { ok: true }, boom);
    expect(await t.approve()).toEqual({ code: 200, status: 'APPROVED',
      warning: 'Auto-advance did not run (db down): send it to the WMS by hand.' });
    expect((await t.mem.repo.getEmail(t.id))?.status).toBe('APPROVED');
  });
});

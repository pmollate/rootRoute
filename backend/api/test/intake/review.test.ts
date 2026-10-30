import { describe, expect, it } from 'vitest';
import type { AuthUser, CarrierRecommendation, CarriersApi, WarehouseApi } from '../../src/core/contracts.js';
import type { LLM } from '../../src/core/llm/types.js';
import type { AddressValidator } from '../../src/core/maps/types.js';
import type { PiiDetector } from '../../src/core/pii/types.js';
import { type OverrideLog, applyAction } from '../../src/modules/intake/actions.js';
import { processEmail } from '../../src/modules/intake/pipeline.js';
import { carrierChoices, reviewQueue } from '../../src/modules/intake/review.js';
import type { Extraction } from '../../src/modules/intake/schema.js';
import { checkPromise } from '../../src/modules/warehouse/domain.js';
import { memoryRepo } from './memoryRepo.js';

// A Northeast lane as C's recommender returns it: E recommended, F blocked (F -> Northeast is a bad lane).
// Test values only; the screen shows whatever lane_scores holds.
const NE: CarrierRecommendation = { carrier: 'E', backup: 'A', reason: 'E: best on this lane', blocked: ['F'], options: [
  { carrier: 'E', onTime: 0.9, meanRate: 2.1, n: 400, score: 0.9, status: 'recommended', reason: 'eligible' },
  { carrier: 'A', onTime: 0.88, meanRate: 2.4, n: 380, score: 0.85, status: 'backup', reason: 'eligible' },
  { carrier: 'B', onTime: 0.86, meanRate: 2.0, n: 350, score: 0.8, status: 'eligible', reason: 'eligible' },
  { carrier: 'F', onTime: 0.6, meanRate: 1.8, n: 300, score: null, status: 'blocked', reason: 'unreliable on this lane' },
] };
const C025 = { client_id: 'C025', client_name: 'Client 25', sla_penalty_clause: 'N', region: 'Northeast', account_tier: 'Tier 2', account_status: 'active' };
const ORDER: Extraction = { items: [{ sku: 'HX-616', qty: 45 }], requested_commitment: 'next_day', confidence: { items: 0.95, address: 0.9 },
  address: { line1: '12 Main St', line2: null, city: 'Boston', state: 'MA', zip: '02110', raw: null } };
const BODY = '[SYNTHETIC] Please ship 45 x HX-616 to 12 Main St, Boston, MA 02110';
const warehouse: WarehouseApi = { checkPromise, nearestWarehouse: async () => 'W4',
  pickWarehouse: async (i) => ({ warehouseId: i.nearestWarehouseId, reason: 'nearest', warnClient: false }) };
const carriers: CarriersApi = { recommendCarrier: async () => structuredClone(NE) };
const llm: LLM = { name: 'fake', json: async () => structuredClone(ORDER) as never, text: async () => { throw new Error('offline'); } };
const pii: PiiDetector = { name: 'fake-pii', detect: async () => [] };
const maps: AddressValidator = { name: 'fake-map', geocode: async (q) => ({ features: [{ properties: { type: 'Address',
  confidence: 'High', matchCodes: ['Good'], address: { addressLine: q.line1, locality: q.city, postalCode: q.zip,
    adminDistricts: [{ shortName: q.state }] } } }] }) };
const desk: AuthUser = { id: 'u1', name: 'Una Desk', roles: ['order_desk'], demo: false };

async function allClear() {
  const mem = memoryRepo({ 'client025.example': C025 }, []);
  const r = await processEmail({ from: 'orders@client025.example', subject: '[SYNTHETIC] Order', body: BODY, receivedAt: '2026-10-22 07:30' },
    { llm, pii, maps, repo: mem.repo, warehouse, carriers, gmail: null });
  expect(r.decision).toBe('ALL_CLEAR');
  const overrides: Parameters<OverrideLog>[0][] = [];
  const log: OverrideLog = async (o) => { overrides.push(o); return overrides.length; };
  return { mem, id: r.id, overrides, log };
}

describe('order review (E18)', () => {
  it('REQ-INT-15: a blocked carrier is never offered', () => {
    expect(carrierChoices(NE).map((c) => c.carrier)).toEqual(['E', 'A', 'B']);
    expect(carrierChoices({ ...NE, options: [] })).toEqual([{ carrier: 'E', status: 'recommended', onTime: null, meanRate: null, reason: 'E: best on this lane' }]);
  });

  it('REQ-INT-14: lists ALL_CLEAR orders awaiting approval with their lane choices', async () => {
    const { mem, id } = await allClear();
    const [o] = await reviewQueue(mem.repo);
    expect(o).toMatchObject({ id, clientId: 'C025', region: 'Northeast', warehouseId: 'W4', carrier: 'E', blocked: ['F'],
      items: [{ sku: 'HX-616', qty: 45 }] });
    expect(o.choices.map((c) => c.carrier)).toEqual(['E', 'A', 'B']);
    expect(o.choices.map((c) => c.meanRate)).toEqual([2.1, 2.4, 2.0]);
    // The checks behind the card, from the stored extraction; F is blocked and shown with its lane on-time share.
    expect(o).toMatchObject({ commitment: 'next_day', warehouseReason: 'nearest', warnClient: false, addressStatus: 'complete',
      blockedLanes: [{ carrier: 'F', onTime: 0.6 }] });
  });

  it('AC-INT-15, AC-AUTH-14: approving with carrier A logs one override with the approver; the order shows A', async () => {
    const { mem, id, overrides, log } = await allClear();
    const r = await applyAction(mem.repo, id, 'approve', desk, undefined, { carrier: 'A', reason: 'client asked for A', overrides: log });
    expect(r).toEqual({ code: 200, status: 'APPROVED' });
    expect(overrides).toEqual([{ orderRef: `email:${id}`, from: 'E', to: 'A', reason: 'client asked for A', user: 'u1' }]);
    expect((await mem.repo.latestExtraction(id))?.checks.carrier).toMatchObject({ carrier: 'A' });
    expect(mem.audit.at(-1)).toMatchObject({ action: 'approve', user: 'u1', payload: { carrier: 'A', from: 'E', reason: 'client asked for A' } });
    expect(await reviewQueue(mem.repo)).toEqual([]);
  });

  it('AC-INT-15: a blocked carrier is refused, a change needs a reason, and the same carrier logs nothing', async () => {
    const { mem, id, overrides, log } = await allClear();
    expect(await applyAction(mem.repo, id, 'approve', desk, undefined, { carrier: 'F', reason: 'cheaper', overrides: log }))
      .toMatchObject({ code: 409 });
    expect(await applyAction(mem.repo, id, 'approve', desk, undefined, { carrier: 'A', overrides: log })).toMatchObject({ code: 400 });
    expect((await mem.repo.getEmail(id))?.status).toBe('AWAITING_APPROVAL');
    expect(await applyAction(mem.repo, id, 'approve', desk, undefined, { carrier: 'E', overrides: log })).toMatchObject({ code: 200 });
    expect(overrides).toEqual([]);
  });

  it('AC-INT-14: a rejection needs a reason, records it with the user, sets REJECTED, and the WMS refuses the order', async () => {
    const { mem, id } = await allClear();
    expect(await applyAction(mem.repo, id, 'reject', desk)).toMatchObject({ code: 400 });
    expect(await applyAction(mem.repo, id, 'reject', desk, undefined, { reason: 'duplicate of order 12' }))
      .toEqual({ code: 200, status: 'REJECTED' });
    expect(mem.audit.at(-1)).toMatchObject({ action: 'reject', user: 'u1', ref: `email:${id}`,
      payload: { reason: 'duplicate of order 12', name: 'Una Desk' } });
    expect(await applyAction(mem.repo, id, 'send_to_wms', 'w1')).toMatchObject({ code: 409 });
    expect(await applyAction(mem.repo, id, 'approve', desk)).toMatchObject({ code: 409 });
    expect(await reviewQueue(mem.repo)).toEqual([]);
  });
});

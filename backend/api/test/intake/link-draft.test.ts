import { describe, expect, it } from 'vitest';
import type { CarriersApi, WarehouseApi } from '../../src/core/contracts.js';
import type { LLM } from '../../src/core/llm/types.js';
import type { AddressValidator } from '../../src/core/maps/types.js';
import type { PiiDetector } from '../../src/core/pii/types.js';
import { getDeps } from '../../src/modules/intake/deps.js';
import { type Deps, processEmail } from '../../src/modules/intake/pipeline.js';
import { draftReply, type ReplyFacts, requiredPhrases, templateReply } from '../../src/modules/intake/reply.js';
import type { Extraction } from '../../src/modules/intake/schema.js';
import { checkPromise } from '../../src/modules/warehouse/domain.js';
import { memoryRepo } from './memoryRepo.js';

const FACTS: ReplyFacts = { decision: 'CONFIRM_ADDRESS', clientName: 'Client 25', contact: null, items: [{ sku: 'HX-616', qty: 45 }],
  promise: null, missing: ['address.zip'], candidates: [], address: null, addressIssues: [], suggestion: null };
const saying = (text: string): LLM => ({ name: 'fake', json: async () => { throw new Error('unused'); }, text: async () => text });

describe('E19 reply draft (REQ-LINK-01, -09)', () => {
  it('AC-LINK-01: with the link on, the template and the required phrases carry [CONFIRM_LINK]', () => {
    expect(templateReply({ ...FACTS, link: true })).toContain('[CONFIRM_LINK]');
    expect(requiredPhrases({ ...FACTS, link: true })).toContain('[CONFIRM_LINK]');
  });

  it('AC-LINK-01: a model draft without the placeholder falls back to the template', async () => {
    const r = await draftReply(saying('Hello, please send the ZIP code. Halcyon Logistics'), { ...FACTS, link: true });
    expect(r).toMatchObject({ source: 'template' });
    expect(r.text).toContain('[CONFIRM_LINK]');
  });

  it('AC-LINK-01: a model draft holding the placeholder is kept', async () => {
    const r = await draftReply(saying('Hello, please send the ZIP code or use [CONFIRM_LINK]. Halcyon Logistics'), { ...FACTS, link: true });
    expect(r).toMatchObject({ source: 'model' });
  });

  it('AC-LINK-09: with the link off, nothing changes: no placeholder, same required phrases', () => {
    expect(templateReply(FACTS)).not.toContain('[CONFIRM_LINK]');
    expect(requiredPhrases(FACTS)).toEqual(['ZIP code']);
    expect(templateReply({ ...FACTS, link: false })).toBe(templateReply(FACTS));
    expect(templateReply({ ...FACTS, decision: 'ALL_CLEAR', link: true })).not.toContain('[CONFIRM_LINK]');
    expect(requiredPhrases({ ...FACTS, decision: 'ALL_CLEAR', link: true })).not.toContain('[CONFIRM_LINK]');
  });

  it('AC-LINK-09: CONFIRM_LINK defaults to off, so the shared deps draft no placeholder', () => {
    expect(getDeps().confirmLink).toBe(false);
  });
});

// The C190 order from pipeline.test.ts: a CONFIRM_ADDRESS email, then the client's answer (ALL_CLEAR).
const C190 = { client_id: 'C190', client_name: 'Client 190', sla_penalty_clause: 'Y', region: 'Southeast', account_tier: 'Tier 1', account_status: 'threatening_to_leave' };
const warehouse: WarehouseApi = {
  checkPromise, nearestWarehouse: async () => 'W3',
  pickWarehouse: async (i) => ({ warehouseId: i.nearestWarehouseId, reason: 'nearest', warnClient: false }),
};
const carriers: CarriersApi = { recommendCarrier: async () => ({ carrier: 'A', backup: 'B', reason: 'test', blocked: [], options: [] }) };
const nullAddr = { line1: null, line2: null, city: null, state: null, zip: null, raw: null };
const pii: PiiDetector = { name: 'fake-pii', detect: async () => [] };
const maps: AddressValidator = { name: 'fake-map', geocode: async (q) => ({ features: [{ properties: { type: 'Address',
  confidence: 'High', matchCodes: ['Good'], address: { addressLine: q.line1, locality: q.city, postalCode: q.zip,
    adminDistricts: [{ shortName: q.state }] } } }] }) };
const FIRST: Extraction = { items: [{ sku: 'HX-616', qty: 45 }], address: { ...nullAddr, city: 'Atlanta', state: 'GA' },
  requested_commitment: 'standard', confidence: { items: 0.95, address: 0.3 } };
const ANSWER: Extraction = { items: [], address: { ...nullAddr, line1: '4411 Mill Rd', zip: '30303' }, requested_commitment: null,
  confidence: { items: 0, address: 0.9 } };
const llm = (...queue: Extraction[]): LLM => ({ name: 'fake', json: async () => queue.shift() as never, text: async () => { throw new Error('offline'); } });

async function run(over: Partial<Deps>) {
  const mem = memoryRepo({ 'client190.example': C190 }, []);
  const d: Deps = { llm: llm(FIRST, ANSWER), pii, maps, repo: mem.repo, warehouse, carriers, gmail: null, ...over };
  const first = await processEmail({ from: 'orders@client190.example', subject: '[SYNTHETIC] Order',
    body: 'Ship to Atlanta, GA. 45 x HX-616', receivedAt: '2026-10-21 16:51' }, d);
  const second = await processEmail({ from: 'orders@client190.example', subject: 'Re: Order',
    body: 'Street is 4411 Mill Rd, ZIP 30303', receivedAt: '2026-10-21 17:30', inReplyTo: first.id }, d);
  return { decisions: [first.decision, second.decision], drafts: mem.extractions.map((x) => x.reply_draft) };
}

describe('E19 pipeline drafts (REQ-LINK-01, -09)', () => {
  it('AC-LINK-01: with confirmLink on, the CONFIRM_ADDRESS draft holds [CONFIRM_LINK] and the ALL_CLEAR draft does not', async () => {
    const r = await run({ confirmLink: true });
    expect(r.decisions).toEqual(['CONFIRM_ADDRESS', 'ALL_CLEAR']);
    expect(r.drafts[0]).toContain('[CONFIRM_LINK]');
    expect(r.drafts[1]).not.toContain('[CONFIRM_LINK]');
  });

  it('AC-LINK-09: with confirmLink off or absent, the drafts are the same as before E19', async () => {
    const absent = await run({});
    const off = await run({ confirmLink: false });
    expect(absent.drafts.join('\n')).not.toContain('[CONFIRM_LINK]');
    expect(off.drafts).toEqual(absent.drafts);
  });
});

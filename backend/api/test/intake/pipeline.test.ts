import { describe, expect, it } from 'vitest';
import type { CarriersApi, WarehouseApi } from '../../src/core/contracts.js';
import type { LLM } from '../../src/core/llm/types.js';
import type { AddressValidator } from '../../src/core/maps/types.js';
import { type PiiDetector, PiiError } from '../../src/core/pii/types.js';
import { applyAction } from '../../src/modules/intake/actions.js';
import { type Deps, mergeExtraction, processEmail } from '../../src/modules/intake/pipeline.js';
import type { Extraction } from '../../src/modules/intake/schema.js';
import { checkPromise } from '../../src/modules/warehouse/domain.js';
import { memoryRepo } from './memoryRepo.js';

const C190 = { client_id: 'C190', client_name: 'Client 190', sla_penalty_clause: 'Y', region: 'Southeast', account_tier: 'Tier 1', account_status: 'threatening_to_leave' };
const SAVED = [
  { id: 1, client_id: 'C190', label: 'Main DC', line1: '4411 Mill Rd', line2: 'Dock 1', city: 'Atlanta', state: 'GA', zip: '30303' },
  { id: 2, client_id: 'C190', label: 'Riverside store', line1: '87 Depot Ave', line2: 'Dock 2', city: 'Orlando', state: 'FL', zip: '32801' },
];
const warehouse: WarehouseApi = {
  checkPromise,
  nearestWarehouse: async () => 'W3',
  pickWarehouse: async (i) => ({ warehouseId: i.nearestWarehouseId, reason: 'nearest', warnClient: false }),
};
const carriers: CarriersApi = {
  recommendCarrier: async () => ({ carrier: 'A', backup: 'B', reason: 'test', blocked: ['D'], options: [] }),
};
const nullAddr = { line1: null, line2: null, city: null, state: null, zip: null, raw: null };

/** Fake model: returns queued extractions; replies always fail so the template is used. */
function fakeLLM(...queue: Extraction[]): LLM & { calls: number } {
  const llm = { name: 'fake', calls: 0,
    json: async () => { llm.calls += 1; return queue.shift() as never; },
    text: async () => { throw new Error('offline'); } };
  return llm;
}
/** Finds every occurrence of the given names, as Azure Language would. */
const piiOf = (...names: string[]): PiiDetector => ({ name: 'fake-pii', detect: async (text) => names.flatMap((v) =>
  [...text.matchAll(new RegExp(v, 'g'))].map((m) => ({ category: 'Person' as const, offset: m.index, length: v.length, text: v }))) });
const mapOk: AddressValidator = { name: 'fake-map', geocode: async (q) => ({ features: [{ properties: { type: 'Address',
  confidence: 'High', matchCodes: ['Good'], address: { addressLine: q.line1, locality: q.city, postalCode: q.zip,
    adminDistricts: [{ shortName: q.state }] } } }] }) };

function deps(mem: ReturnType<typeof memoryRepo>, llm: LLM, over: Partial<Deps> = {}): Deps {
  return { llm, pii: piiOf('Dana Whitfield'), maps: mapOk, repo: mem.repo, warehouse, carriers, gmail: null, ...over };
}

const FIRST: Extraction = {
  items: [{ sku: 'HX-616', qty: 45 }], address: { ...nullAddr, line2: 'Dock 2', city: 'Atlanta', state: 'GA' },
  requested_commitment: 'standard', confidence: { items: 0.95, address: 0.3 },
};
const ANSWER: Extraction = {
  items: [], address: { ...nullAddr, line1: '4411 Mill Rd', zip: '30303' }, requested_commitment: null,
  confidence: { items: 0, address: 0.9 },
};
const FULL: Extraction = { ...FIRST, address: { ...nullAddr, line1: '4411 Mill Rd', city: 'Atlanta', state: 'GA', zip: '30303' } };
const FULL_BODY = '4411 Mill Rd Atlanta GA 30303 45 x HX-616\n\nThanks,\nDana Whitfield';

describe('intake pipeline', () => {
  it('AC-INT-07: C190 asks for the address, then the reply becomes ALL_CLEAR with the original items', async () => {
    const mem = memoryRepo({ 'client190.example': C190 }, SAVED);
    const d = deps(mem, fakeLLM(FIRST, ANSWER));
    const first = await processEmail({ from: 'orders@client190.example', subject: '[SYNTHETIC] Order',
      body: 'Ship to Dock 2, Atlanta, GA. 45 x HX-616', receivedAt: '2026-10-21 16:51' }, d);
    expect(first.decision).toBe('CONFIRM_ADDRESS');
    expect(mem.extractions[0].reply_draft).toContain('Main DC: 4411 Mill Rd');

    const second = await processEmail({ from: 'orders@client190.example', subject: 'Re: Order',
      body: 'Street is 4411 Mill Rd, ZIP 30303', receivedAt: '2026-10-21 17:30', inReplyTo: first.id }, d);
    expect(second.decision).toBe('ALL_CLEAR');
    const x = mem.extractions[1];
    expect(x.extraction?.items).toEqual([{ sku: 'HX-616', qty: 45 }]);
    expect(x.checks.carrier).toMatchObject({ carrier: 'A' });
    expect(x.checks.warehouse).toMatchObject({ warehouseId: 'W3' });
    expect(mem.emails[1].in_reply_to).toBe(first.id);
  });

  it('keeps the dock when the model put it in the street line and the reply gives the street', async () => {
    const mem = memoryRepo({ 'client190.example': C190 }, SAVED);
    const dockAsStreet = { ...FIRST, address: { ...nullAddr, line1: 'Dock 2', city: 'Atlanta', state: 'GA' } };
    const d = deps(mem, fakeLLM(dockAsStreet, ANSWER));
    const first = await processEmail({ from: 'orders@client190.example', subject: 's', body: 'Ship to Dock 2, Atlanta, GA. 45 x HX-616',
      receivedAt: '2026-10-21 16:51' }, d);
    await processEmail({ from: 'orders@client190.example', subject: 'Re: s', body: 'Street is 4411 Mill Rd, ZIP 30303',
      receivedAt: '2026-10-21 17:30', inReplyTo: first.id }, d);
    expect(mem.extractions[0].extraction?.address).toMatchObject({ line1: null, line2: 'Dock 2' });
    expect(mem.extractions[1].checks.address?.address).toMatchObject({ line1: '4411 Mill Rd', line2: 'Dock 2', zip: '30303' });
  });

  it('links a Gmail reply to the first email in its thread', async () => {
    const mem = memoryRepo({ 'client190.example': C190 }, SAVED);
    const d = deps(mem, fakeLLM(FIRST, ANSWER));
    const gm = { source: 'gmail' as const, threadId: 't1' };
    const first = await processEmail({ from: 'Orders <orders@client190.example>', subject: 's', body: 'Ship to Dock 2, Atlanta, GA. 45 x HX-616',
      receivedAt: '2026-10-21 16:51', gmailId: 'g1', ...gm }, d);
    const second = await processEmail({ from: 'orders@client190.example', subject: 'Re: s', body: 'Street is 4411 Mill Rd, ZIP 30303',
      receivedAt: '2026-10-21 17:30', gmailId: 'g2', ...gm }, d);
    expect(mem.emails[1].in_reply_to).toBe(first.id);
    expect(second.decision).toBe('ALL_CLEAR');
  });

  it('AC-SEC-05: stores the redacted text and the tag map; the model never sees the name', async () => {
    const mem = memoryRepo({ 'client190.example': C190 }, SAVED);
    const seen: string[] = [];
    const llm: LLM = { name: 'spy', json: async (r) => { seen.push(r.user); return FULL as never; }, text: async () => { throw new Error('x'); } };
    await processEmail({ from: 'orders@client190.example', subject: 's', body: FULL_BODY, receivedAt: '2026-10-21 09:00' }, deps(mem, llm));
    expect(seen[0]).not.toContain('Dana');
    expect(mem.emails[0]).toMatchObject({ pii_map: { '[PERSON_1]': 'Dana Whitfield' } });
    expect(mem.emails[0].redacted_body).toContain('[PERSON_1]');
    expect(mem.extractions[0].reply_draft.startsWith('Hello [PERSON_1],')).toBe(true);
  });

  it('dedupes the same email, and a Gmail message by its id', async () => {
    const mem = memoryRepo({ 'client190.example': C190 }, SAVED);
    const d = deps(mem, fakeLLM(FULL, FULL));
    const e = { from: 'orders@client190.example', subject: 's', body: FULL_BODY, receivedAt: '2026-10-21 09:00' };
    const a = await processEmail(e, d);
    expect((await processEmail(e, d)).id).toBe(a.id);
    const g = await processEmail({ ...e, body: `${FULL_BODY}\n`, source: 'gmail', gmailId: 'g7' }, d);
    expect((await processEmail({ ...e, body: 'changed', source: 'gmail', gmailId: 'g7' }, d)).id).toBe(g.id);
    expect(mem.emails).toHaveLength(2);
  });

  it('unknown sender is MISSING_INFO', async () => {
    const mem = memoryRepo({}, []);
    const r = await processEmail({ from: 'x@unknown.example', subject: 's', body: 'b', receivedAt: '2026-10-21 09:00' }, deps(mem, fakeLLM(FIRST)));
    expect(r.decision).toBe('MISSING_INFO');
  });

  it('fails closed: if redaction is down the email waits, the model is not called, and a retry processes it', async () => {
    const mem = memoryRepo({ 'client190.example': C190 }, SAVED);
    const llm = fakeLLM(FULL);
    const down: PiiDetector = { name: 'down', detect: async () => { throw new PiiError('timeout', 'transport'); } };
    const e = { from: 'orders@client190.example', subject: 's', body: FULL_BODY, receivedAt: '2026-10-21 09:00' };
    expect(await processEmail(e, deps(mem, llm, { pii: down }))).toMatchObject({ status: 'WAITING', decision: null });
    expect(llm.calls).toBe(0);
    expect(await processEmail(e, deps(mem, llm))).toMatchObject({ status: 'AWAITING_APPROVAL', decision: 'ALL_CLEAR' });
    expect(mem.emails).toHaveLength(1);
  });

  it('a complete address the map cannot confirm asks the client, with the map problem in the draft', async () => {
    const mem = memoryRepo({ 'client190.example': C190 }, SAVED);
    const noStreet: AddressValidator = { name: 'map', geocode: async () => ({ features: [] }) };
    const r = await processEmail({ from: 'orders@client190.example', subject: 's', body: FULL_BODY, receivedAt: '2026-10-21 09:00' },
      deps(mem, fakeLLM(FULL), { maps: noStreet }));
    expect(r.decision).toBe('CONFIRM_ADDRESS');
    expect(mem.extractions[0].reply_draft).toContain('We could not find 4411 Mill Rd in Atlanta, GA');
  });

  it('merges a reply into the first extraction', () => {
    expect(mergeExtraction(FIRST, ANSWER)).toMatchObject({ items: FIRST.items,
      address: { line1: '4411 Mill Rd', line2: 'Dock 2', city: 'Atlanta', state: 'GA', zip: '30303' }, requested_commitment: 'standard' });
  });
});

describe('actions', () => {
  async function awaiting(from: string) {
    const domain = from.split('@')[1];
    const mem = memoryRepo({ [domain]: C190 }, SAVED);
    const r = await processEmail({ from, subject: '[SYNTHETIC] Order 7', body: FULL_BODY, receivedAt: '2026-10-21 09:00',
      source: 'gmail', gmailId: 'g1', threadId: 't9', messageId: '<m1@client.example>' }, deps(mem, fakeLLM(FULL)));
    return { mem, id: r.id };
  }
  const allow = new Set(['orders@client190.example']);
  function fakeGmail() {
    const sent: { raw: string; threadId: string | null }[] = [];
    return { sent, gmail: { sendMessage: async (raw: string, threadId: string | null) => { sent.push({ raw, threadId }); return 'out1'; } } };
  }

  it('AC-SEC-04: send_to_wms is refused before approval, and approvals are logged', async () => {
    const { mem, id } = await awaiting('orders@client190.example');
    expect(await applyAction(mem.repo, id, 'send_to_wms', 'ops')).toMatchObject({ code: 409 });
    expect(await applyAction(mem.repo, id, 'approve', 'ops')).toMatchObject({ code: 200, status: 'APPROVED' });
    expect(await applyAction(mem.repo, id, 'send_to_wms', 'ops')).toMatchObject({ code: 200, status: 'ENTERED' });
    expect(mem.audit.map((a) => a.action)).toEqual(['approve', 'send_to_wms']);
  });

  it('AC-SEC-03: a reply to an address not on the allow-list is refused and logged; Gmail is not called', async () => {
    const { mem, id } = await awaiting('buyer@client777.example');
    const { sent, gmail } = fakeGmail();
    await applyAction(mem.repo, id, 'approve', 'ops');
    expect(await applyAction(mem.repo, id, 'send_reply', 'ops', { gmail, allow })).toMatchObject({ code: 403 });
    expect(mem.outbound).toMatchObject([{ emailId: id, to: 'buyer@client777.example', status: 'refused' }]);
    expect(sent).toHaveLength(0);
  });

  it('sends the approved reply in the thread, with the name put back only now', async () => {
    const { mem, id } = await awaiting('orders@client190.example');
    const { sent, gmail } = fakeGmail();
    expect(await applyAction(mem.repo, id, 'send_reply', 'ops', { gmail, allow })).toMatchObject({ code: 409 });
    await applyAction(mem.repo, id, 'approve', 'ops');
    expect(await applyAction(mem.repo, id, 'send_reply', 'ops', { gmail, allow })).toMatchObject({ code: 200, status: 'SENT' });
    const raw = sent[0].raw;
    expect(sent[0].threadId).toBe('t9');
    expect(raw).toContain('In-Reply-To: <m1@client.example>');
    expect(raw).toContain('Hello Dana Whitfield,');
    expect(mem.outbound[0]).toMatchObject({ status: 'sent', gmailId: 'out1' });
  });

  it('says so when Gmail is not set up, without marking the reply sent', async () => {
    const { mem, id } = await awaiting('orders@client190.example');
    await applyAction(mem.repo, id, 'approve', 'ops');
    expect(await applyAction(mem.repo, id, 'send_reply', 'ops', { gmail: null, allow })).toMatchObject({ code: 503 });
    expect((await mem.repo.getEmail(id))?.status).toBe('APPROVED');
  });
});

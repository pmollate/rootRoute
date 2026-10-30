import { describe, expect, it } from 'vitest';
import type { CarrierRecommendation, CarriersApi, PromiseResult, WarehouseApi } from '../../src/core/contracts.js';
import type { AddressValidator } from '../../src/core/maps/types.js';
import { applyAction } from '../../src/modules/intake/actions.js';
import { confirmLink, INVALID, type LinkDeps, linkState, mintLink, viewLink } from '../../src/modules/intake/link.js';
import { hashToken } from '../../src/modules/intake/linkRules.js';
import { type Deps, processEmail } from '../../src/modules/intake/pipeline.js';
import { replyFactsOf, templateReply, withoutLinkPlaceholder } from '../../src/modules/intake/reply.js';
import type { Extraction } from '../../src/modules/intake/schema.js';
import { checkPromise } from '../../src/modules/warehouse/domain.js';
import { memoryLinks } from './memoryLinks.js';
import { memoryRepo } from './memoryRepo.js';

const C025 = { client_id: 'C025', client_name: 'Client 25', sla_penalty_clause: 'N', region: 'Northeast', account_tier: 'Tier 2', account_status: 'active' };
const REC: CarrierRecommendation = { carrier: 'E', backup: 'A', reason: 'E: best on this lane', blocked: [], options: [] };
const START = { lat: 42.3523, lon: -71.0466 };
const north = (m: number) => ({ lat: START.lat + m / 111_195, lon: START.lon });
const ADDRESS = { line1: '415 Summer St', line2: 'Dock 1', city: 'Boston', state: 'MA', zip: '02210' };
const PROMISE: PromiseResult = { promiseDate: '2026-10-30', commitment: 'next_day', downgraded: false, reason: null };
/**
 * The map's answers. Forward look-ups of a typed address: `match` reads the typed city, state and ZIP back at START;
 * `differ` reads another city (the 30 Oct local test's answer, Enterprise); `none` finds no point; `down` cannot be
 * reached. The reverse look-up of any pin reads 1 Other St, Boston, MA 02210 (or throws when `reverseDown`).
 */
type Forward = 'match' | 'differ' | 'none' | 'down';
interface MapMode { forward: Forward; reverseDown: boolean; forwardCalls: number; reverseCalls: number }
const fakeMap = (mode: MapMode): AddressValidator => ({ name: 'fake-map',
  geocode: async (q) => {
    mode.forwardCalls += 1;
    if (mode.forward === 'down') throw new Error('map down');
    if (mode.forward === 'none') return { features: [] };
    const city = mode.forward === 'differ' ? 'Enterprise' : q.city;
    return { features: [{ geometry: { type: 'Point', coordinates: [START.lon, START.lat] }, properties: { type: 'Address', confidence: 'Medium',
      address: { addressLine: mode.forward === 'differ' ? '65156 Powers Rd' : q.line1, locality: city, postalCode: q.zip, adminDistricts: [{ shortName: q.state }] } } }] };
  },
  reverse: async () => {
    mode.reverseCalls += 1;
    if (mode.reverseDown) throw new Error('map down');
    return { features: [{ properties: { type: 'Address', confidence: 'High', address: { addressLine: '1 Other St', locality: 'Boston', postalCode: '02210', adminDistricts: [{ shortName: 'MA' }] } } }] };
  } });
const warehouse: WarehouseApi = { checkPromise, nearestWarehouse: async () => 'W4', pickWarehouse: async (i) => ({ warehouseId: i.nearestWarehouseId, reason: 'nearest', warnClient: false }) };
const carriers: CarriersApi = { recommendCarrier: async () => structuredClone(REC) };
const TEMPLATE = 'Hello,\nPlease confirm: [CONFIRM_LINK]\nHalcyon Logistics';

interface Setup { draft?: string; promise?: PromiseResult | null; enabled?: boolean; appUrl?: string; geocodeOk?: boolean; piiMap?: Record<string, string> }

/** A CONFIRM_ADDRESS order from C025, approved by the desk, ready for send_reply; the clock is 29 Oct 10:00 UTC. */
async function setup({ draft = TEMPLATE, promise = null, enabled = true, appUrl = 'https://app.example', geocodeOk = true, piiMap = {} }: Setup = {}) {
  const mode: MapMode = { forward: geocodeOk ? 'match' : 'down', reverseDown: false, forwardCalls: 0, reverseCalls: 0 };
  const maps = fakeMap(mode);
  const mem = memoryRepo({ 'client025.example': C025 }, []);
  const id = await mem.repo.insertEmail({ source: 'paste', gmail_id: null, thread_id: null, message_id: null, from_addr: 'orders@client025.example',
    subject: '[SYNTHETIC] Order', body: '[SYNTHETIC] 45 x HX-616 to 415 Summer St Dock 1, Boston, MA 02210', redacted_body: null, pii_map: piiMap,
    received_at: '2026-10-29 09:00', in_reply_to: null, hash: 'h1', client_id: 'C025' });
  await mem.repo.saveExtraction({ email_id: id, decision: 'CONFIRM_ADDRESS', reply_draft: draft, reply_source: 'template',
    extraction: { items: [{ sku: 'HX-616', qty: 45 }], requested_commitment: 'next_day', confidence: { items: 1, address: 1 }, address: { ...ADDRESS, raw: null } },
    checks: { address: { status: 'unverified', address: ADDRESS, missing: [], candidates: [], validation: null }, promise, warehouse: null, carrier: null } });
  await mem.repo.setStatus(id, 'APPROVED');
  const store = memoryLinks(() => mem.emails, mem.repo);
  let now = new Date('2026-10-29T10:00:00Z');
  const events: { event: string; fields: Record<string, unknown> }[] = [];
  const issued: Date[] = [];
  const link: LinkDeps = { enabled, hours: 24, timeZone: 'UTC', appUrl, links: store.links, maps,
    credentials: { issue: async (e) => { issued.push(e); return { kind: 'sas', token: 'recorded-sas', expiresAt: e.toISOString() }; } },
    now: () => now, log: (event, fields) => events.push({ event, fields }) };
  const intake: Deps = { llm: null as never, pii: null as never, maps, repo: mem.repo, warehouse, carriers, gmail: null };
  const sentTexts: string[] = [];
  const gmail = { sendMessage: async (raw: string) => { sentTexts.push(raw); return 'g1'; } };
  const allow = new Set(['orders@client025.example']);
  const send = (edited?: string, emailId = id) =>
    applyAction(mem.repo, emailId, 'send_reply', 'u1', { gmail: gmail as never, allow }, { link, ...(edited ? { edited } : {}) });
  const tokenOf = () => /\/confirm\/([A-Za-z0-9_-]{43})/.exec(sentTexts.at(-1) ?? '')?.[1];
  return { mem, id, store, link, intake, send, sentTexts, tokenOf, events, issued, gmail, allow, mode,
    at: (iso: string) => { now = new Date(iso); } };
}

describe('E19 address link (memory)', () => {
  it('AC-LINK-01, AC-SEC-LINK-01: send_reply puts a 43-character token in the sent text only; one hashed row; the stored copy keeps the placeholder', async () => {
    const t = await setup();
    expect((await t.send()).code).toBe(200);
    const token = t.tokenOf()!;
    expect(token).toHaveLength(43);
    expect(t.sentTexts[0]).toContain(`https://app.example/confirm/${token}`);
    expect(t.sentTexts[0]).not.toContain('[CONFIRM_LINK]');
    expect(t.store.rows).toHaveLength(1);
    expect(t.store.rows[0].token_hash).toBe(hashToken(token));
    expect(t.mem.outbound[0].body).toContain('[CONFIRM_LINK]');
    expect(JSON.stringify([t.store.rows, t.mem.outbound, t.mem.audit, t.events])).not.toContain(token);
    expect(t.store.rows[0].expires_at.toISOString()).toBe('2026-10-30T06:00:00.000Z');
    expect(t.store.rows[0]).toMatchObject({ email_id: t.id, issued_by: 'u1', synthetic: true,
      prefill: { address: ADDRESS, pin: START } });
  });

  it('AC-LINK-01: a trailing / on AUTH_URL is trimmed before /confirm/<token>', async () => {
    const t = await setup({ appUrl: 'https://app.example/' });
    await t.send();
    expect(t.sentTexts[0]).toContain(`https://app.example/confirm/${t.tokenOf()}`);
    expect(t.sentTexts[0]).not.toContain('example//confirm');
  });

  it('AC-LINK-01: the operator deleted the placeholder → sent as edited, no token row', async () => {
    const t = await setup();
    expect((await t.send('Hello,\nPlease reply with the address.\nHalcyon Logistics')).code).toBe(200);
    expect(t.sentTexts[0]).toContain('Please reply with the address.');
    expect(t.tokenOf()).toBeUndefined();
    expect(t.store.rows).toEqual([]);
  });

  it('AC-SEC-LINK-09: off the allow-list → 403 and no token row; no Gmail → 503 and no token row', async () => {
    const t = await setup();
    const r = await applyAction(t.mem.repo, t.id, 'send_reply', 'u1', { gmail: t.gmail as never, allow: new Set() }, { link: t.link });
    expect(r.code).toBe(403);
    expect(t.mem.outbound[0]).toMatchObject({ status: 'refused' });
    expect(t.mem.outbound[0].body).not.toMatch(/\/confirm\//);
    const r2 = await applyAction(t.mem.repo, t.id, 'send_reply', 'u1', { gmail: null, allow: t.allow }, { link: t.link });
    expect(r2.code).toBe(503);
    expect(t.store.rows).toEqual([]);
  });

  it('AC-SEC-LINK-09: a Gmail failure after minting revokes the link nobody received', async () => {
    const t = await setup();
    const broken = { sendMessage: async () => { throw new Error('gmail down'); } };
    await expect(applyAction(t.mem.repo, t.id, 'send_reply', 'u1', { gmail: broken as never, allow: t.allow }, { link: t.link }))
      .rejects.toThrow('gmail down');
    expect(t.store.rows).toHaveLength(1);
    expect(linkState(t.store.rows[0], new Date('2026-10-29T10:00:00Z'))).toBe('revoked');
    expect(t.mem.outbound).toEqual([]);
  });

  it('AC-SEC-LINK-03, AC-SEC-LINK-06: the view holds only address, pin, expiresAt, synthetic, map; opening 3 times leaves it unused', async () => {
    const t = await setup(); await t.send();
    for (let i = 0; i < 3; i += 1) expect(Object.keys((await viewLink(t.link, t.tokenOf()!))!).sort()).toEqual(['address', 'expiresAt', 'map', 'pin', 'synthetic']);
    expect(t.store.rows[0].used_at).toBeNull();
    expect(t.store.rows[0].map_lookups).toBe(0);
    expect((await confirmLink(t.link, t.intake, t.tokenOf()!, { address: ADDRESS, pin: START })).code).toBe(200);
  });

  it('AC-SEC-LINK-08 (service half): the map credential is a SAS token expiring with the link; none for an expired link', async () => {
    const t = await setup(); await t.send();
    const view = (await viewLink(t.link, t.tokenOf()!))!;
    expect(view.map).toEqual({ kind: 'sas', token: 'recorded-sas', expiresAt: '2026-10-30T06:00:00.000Z' });
    expect(view.expiresAt).toBe('2026-10-30T06:00:00.000Z');
    expect(view.synthetic).toBe(true);
    t.at('2026-10-30T06:00:00Z');
    expect(await viewLink(t.link, t.tokenOf()!)).toBeNull();
    expect(t.issued).toHaveLength(1);
  });

  it('REQ-LINK-02, SEC-LINK-08: a map credential that cannot be issued leaves map null; the address still opens and confirms', async () => {
    const t = await setup(); await t.send();
    t.link.credentials = { issue: async () => { throw new Error('Azure Maps listSas failed: 403'); } };
    const view = (await viewLink(t.link, t.tokenOf()!))!;
    expect(view.map).toBeNull();
    expect(view.address).toMatchObject({ city: expect.any(String) });
    expect(t.events.map((e) => e.event)).toContain('link_map_unavailable');
    expect(JSON.stringify(t.events)).not.toContain('403'); // the issuer's error stays out of the link log
    expect((await confirmLink(t.link, t.intake, t.tokenOf()!, { address: ADDRESS, pin: START })).code).toBe(200);
  });

  it('AC-LINK-03: 600 m → 409 with the reading and an unused link; again with the checkId → confirmed', async () => {
    const t = await setup(); await t.send();
    const first = await confirmLink(t.link, t.intake, t.tokenOf()!, { address: ADDRESS, pin: north(600) });
    expect(first.code).toBe(409);
    expect(first.body).toMatchObject({ error: 'needs_second_confirm', reading: { of: 'pin', found: true, line1: '1 Other St', city: 'Boston', state: 'MA', zip: '02210', distanceM: 600, differs: [] } });
    expect(t.store.rows[0].used_at).toBeNull();
    const checkId = (first.body as { checkId: string }).checkId;
    expect((await confirmLink(t.link, t.intake, t.tokenOf()!, { address: ADDRESS, pin: north(600), checkId })).code).toBe(200);
    expect(t.store.rows[0]).toMatchObject({ confirmed_address: ADDRESS, lat: north(600).lat, lon: north(600).lon,
      map_reading: { of: 'pin', line1: '1 Other St', distanceM: 600 } });
  });

  it('AC-LINK-03: a ZIP change is 409 at any distance; a made-up checkId, or the pin moved after the reading, is 409 again', async () => {
    const t = await setup(); await t.send();
    expect((await confirmLink(t.link, t.intake, t.tokenOf()!, { address: { ...ADDRESS, zip: '02110' }, pin: START })).code).toBe(409);
    expect((await confirmLink(t.link, t.intake, t.tokenOf()!, { address: ADDRESS, pin: north(600), checkId: 'not-moved' })).code).toBe(409);
    const asked = await confirmLink(t.link, t.intake, t.tokenOf()!, { address: ADDRESS, pin: north(600) });
    const checkId = (asked.body as { checkId: string }).checkId;
    expect((await confirmLink(t.link, t.intake, t.tokenOf()!, { address: ADDRESS, pin: north(900), checkId })).code).toBe(409);
    expect(t.store.rows[0].used_at).toBeNull();
  });

  it('AC-LINK-04, AC-SEC-LINK-11: 400 m confirms at once; new ALL_CLEAR extraction, AWAITING_APPROVAL, audit by client-link', async () => {
    const t = await setup(); await t.send();
    expect((await confirmLink(t.link, t.intake, t.tokenOf()!, { address: ADDRESS, pin: north(400) })).code).toBe(200);
    const x = t.mem.extractions.at(-1)!;
    expect(x).toMatchObject({ decision: 'ALL_CLEAR', checks: { address: { status: 'confirmed', address: ADDRESS }, warehouse: { warehouseId: 'W4' },
      carrier: { carrier: 'E' }, promise: checkPromise('next_day', '2026-10-29 09:00') }, reply_source: 'template' });
    expect(x.extraction?.address).toEqual({ ...ADDRESS, raw: null });
    expect(x.reply_draft).toContain('Your order is confirmed');
    expect(x.reply_draft).not.toContain('[CONFIRM_LINK]');
    expect(t.mem.emails[0].status).toBe('AWAITING_APPROVAL');
    expect(t.mem.audit.filter((a) => a.user.startsWith('client-link:'))).toEqual([
      expect.objectContaining({ user: `client-link:${t.id}`, action: 'link_confirmed', ref: `email:${t.id}` })]);
    expect((await applyAction(t.mem.repo, t.id, 'send_to_wms', 'u2')).code).toBe(409);
  });

  it('AC-LINK-04: no start pin (the map had no match) → a second Confirm is asked for whatever the distance', async () => {
    const t = await setup({ geocodeOk: false }); await t.send();
    expect(t.store.rows[0].prefill.pin).toBeNull();
    t.mode.forward = 'match'; // the typed address matches: only the pin rule (no start pin) asks
    const first = await confirmLink(t.link, t.intake, t.tokenOf()!, { address: ADDRESS, pin: START });
    expect(first.code).toBe(409);
    expect((first.body as { reading: object }).reading).toMatchObject({ of: 'pin', distanceM: null, differs: [] });
    const checkId = (first.body as { checkId: string }).checkId;
    expect((await confirmLink(t.link, t.intake, t.tokenOf()!, { address: ADDRESS, pin: START, checkId })).code).toBe(200);
    expect(t.mem.extractions.at(-1)?.decision).toBe('ALL_CLEAR');
  });

  it('AC-LINK-05: saved_addresses gets the link address only on approval', async () => {
    const t = await setup(); await t.send();
    await confirmLink(t.link, t.intake, t.tokenOf()!, { address: ADDRESS, pin: north(100) });
    expect(t.store.saved).toEqual([]);
    expect((await applyAction(t.mem.repo, t.id, 'approve', 'u1', undefined, { link: t.link })).code).toBe(200);
    expect(t.store.saved).toEqual([{ clientId: 'C025', address: ADDRESS, emailId: t.id, pin: north(100),
      confirmedAt: new Date('2026-10-29T10:00:00Z'), synthetic: true }]);
    expect(t.mem.audit.at(-1)).toMatchObject({ action: 'approve', payload: { savedAddress: 'link' } });
  });

  it('AC-LINK-05: approving an order whose address was not confirmed by link saves nothing', async () => {
    const t = await setup();
    await t.mem.repo.setStatus(t.id, 'AWAITING_APPROVAL');
    expect((await applyAction(t.mem.repo, t.id, 'approve', 'u1', undefined, { link: t.link })).code).toBe(200);
    expect(t.store.saved).toEqual([]);
    expect(t.mem.audit.at(-1)?.payload).toEqual({});
  });

  it('AC-LINK-07, AC-SEC-LINK-02: random, expired, used and revoked links all get the same 404 body', async () => {
    const t = await setup(); await t.send();
    const used = t.tokenOf()!;
    await confirmLink(t.link, t.intake, used, { address: ADDRESS, pin: START });
    expect(await confirmLink(t.link, t.intake, 'B'.repeat(43), {})).toEqual({ code: 404, body: INVALID });
    expect(await confirmLink(t.link, t.intake, 'short', {})).toEqual({ code: 404, body: INVALID });
    expect(await confirmLink(t.link, t.intake, used, { address: ADDRESS, pin: START })).toEqual({ code: 404, body: INVALID });
    expect(await viewLink(t.link, used)).toBeNull();
    t.at('2026-10-31T00:00:00Z');
    expect(linkState(t.store.rows[0], new Date())).toBe('confirmed');

    const e = await setup(); await e.send();
    e.at('2026-10-30T06:00:00Z'); // expires_at: no longer valid at that instant
    expect(await confirmLink(e.link, e.intake, e.tokenOf()!, { address: ADDRESS, pin: START })).toEqual({ code: 404, body: INVALID });
    expect(linkState(e.store.rows[0], new Date('2026-10-30T06:00:00Z'))).toBe('expired');
  });

  it('AC-LINK-08: sending again revokes the first link; the second works', async () => {
    const t = await setup(); await t.send();
    const first = t.tokenOf()!;
    await t.mem.repo.setStatus(t.id, 'APPROVED');
    await t.send();
    expect(await viewLink(t.link, first)).toBeNull();
    expect(linkState(t.store.rows[0], new Date('2026-10-29T10:00:00Z'))).toBe('revoked');
    expect(await viewLink(t.link, t.tokenOf()!)).not.toBeNull();
  });

  it("AC-LINK-08: a link sent for the client's follow-up in the same thread revokes the one sent for the first email", async () => {
    const t = await setup(); await t.send();
    const first = t.tokenOf()!;
    const follow = await t.mem.repo.insertEmail({ ...t.mem.emails[0], hash: 'h2', in_reply_to: t.id, received_at: '2026-10-29 09:30' });
    const x = (await t.mem.repo.latestExtraction(t.id))!;
    await t.mem.repo.saveExtraction({ ...x, email_id: follow });
    await t.mem.repo.setStatus(follow, 'APPROVED');
    expect((await t.send(undefined, follow)).code).toBe(200);
    expect(await viewLink(t.link, first)).toBeNull();
    expect(t.store.rows.map((r) => [r.email_id, linkState(r, new Date('2026-10-29T10:00:00Z'))]))
      .toEqual([[t.id, 'revoked'], [follow, 'sent']]);
  });

  it('AC-SEC-LINK-10: a bad body is 400 and the link stays unused', async () => {
    const t = await setup(); await t.send();
    for (const bad of [{ address: { ...ADDRESS, state: 'XX' }, pin: START }, { address: { ...ADDRESS, zip: '1234' }, pin: START },
      { address: { ...ADDRESS, city: 'x'.repeat(101) }, pin: START }, { address: ADDRESS, pin: { lat: 91, lon: 0 } }]) {
      expect(await confirmLink(t.link, t.intake, t.tokenOf()!, bad)).toEqual({ code: 400, body: { error: 'invalid' } });
    }
    expect(t.store.rows[0].used_at).toBeNull();
    expect(t.store.rows[0].map_lookups).toBe(0);
  });

  it('AC-SEC-LINK-04: the 21st map look-up for one link is refused, forward and reverse together; the link stays unused', async () => {
    const t = await setup(); await t.send();
    // A moved pin costs two look-ups: the typed address (REQ-LINK-12) and the pin (REQ-LINK-03).
    for (let i = 0; i < 10; i += 1) expect((await confirmLink(t.link, t.intake, t.tokenOf()!, { address: ADDRESS, pin: north(600 + i) })).code).toBe(409);
    expect([t.store.rows[0].map_lookups, t.mode.forwardCalls - 1, t.mode.reverseCalls]).toEqual([20, 10, 10]); // -1: the start pin at send
    expect(await confirmLink(t.link, t.intake, t.tokenOf()!, { address: ADDRESS, pin: north(700) })).toEqual({ code: 429, body: { error: 'rate_limited' } });
    expect(await confirmLink(t.link, t.intake, t.tokenOf()!, { address: ADDRESS })).toEqual({ code: 429, body: { error: 'rate_limited' } });
    expect(t.store.rows[0].used_at).toBeNull();

    const f = await setup(); await f.send();
    f.mode.forward = 'none'; // forward look-ups alone count too
    for (let i = 0; i < 20; i += 1) expect((await confirmLink(f.link, f.intake, f.tokenOf()!, { address: { ...ADDRESS, line1: `${i} Summer St` } })).code).toBe(409);
    expect(await confirmLink(f.link, f.intake, f.tokenOf()!, { address: ADDRESS })).toEqual({ code: 429, body: { error: 'rate_limited' } });
    expect(f.store.rows[0].used_at).toBeNull();
  });

  it('AC-SEC-LINK-11: every link event carries the email id and an 8-character hash prefix, never the token', async () => {
    const t = await setup(); await t.send();
    const token = t.tokenOf()!;
    await viewLink(t.link, token);
    await confirmLink(t.link, t.intake, token, { address: { ...ADDRESS, state: 'XX' }, pin: START });
    const asked = await confirmLink(t.link, t.intake, token, { address: ADDRESS, pin: north(600) });
    await confirmLink(t.link, t.intake, token, { address: ADDRESS, pin: north(600), checkId: (asked.body as { checkId: string }).checkId });
    expect(t.events.map((e) => e.event)).toEqual(['link_sent', 'link_opened', 'link_refused', 'link_second_confirm', 'link_confirmed']);
    const prefix = hashToken(token).slice(0, 8);
    for (const e of t.events) expect(e.fields).toMatchObject({ emailId: t.id, hash: prefix });
    expect(JSON.stringify(t.events)).not.toContain(token);
  });

  it('REQ-LINK-09: with the flag off a valid token opens nothing and confirms nothing', async () => {
    const t = await setup(); await t.send();
    const off = { ...t.link, enabled: false };
    expect(await viewLink(off, t.tokenOf()!)).toBeNull();
    expect(await confirmLink(off, t.intake, t.tokenOf()!, { address: ADDRESS, pin: START })).toEqual({ code: 404, body: INVALID });
    expect(t.store.rows[0].used_at).toBeNull();
  });

  it('AC-SEC-LINK-09: mintLink is called only by send_reply (no other caller in the intake code)', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const dir = new URL('../../src/modules/intake/', import.meta.url);
    const callers = readdirSync(dir).filter((f) => f.endsWith('.ts') && /\bmintLink\(/.test(readFileSync(new URL(f, dir), 'utf8')));
    expect(callers.sort()).toEqual(['actions.ts', 'link.ts']); // link.ts defines it; actions.ts calls it in send_reply
    expect(typeof mintLink).toBe('function');
  });
});

describe('E19 flag off at send time (REQ-LINK-09)', () => {
  const facts = { decision: 'CONFIRM_ADDRESS' as const, clientName: 'Client 25', contact: null, items: [{ sku: 'HX-616', qty: 45 }],
    promise: PROMISE, missing: ['address.zip'], candidates: [], address: null, addressIssues: [], suggestion: null };

  it('AC-LINK-09: stripping the template drafted with the flag on gives exactly the flag-off template', () => {
    expect(withoutLinkPlaceholder(templateReply({ ...facts, link: true }))).toBe(templateReply(facts));
  });

  it('AC-LINK-09: only the sentence holding the placeholder goes; the rest of its line stays', () => {
    expect(withoutLinkPlaceholder('We can deliver by 30 Oct 2026. Or confirm here: [CONFIRM_LINK]\nThanks'))
      .toBe('We can deliver by 30 Oct 2026.\nThanks');
    expect(withoutLinkPlaceholder('Confirm at [CONFIRM_LINK]. We can deliver by 30 Oct 2026.')).toBe('We can deliver by 30 Oct 2026.');
    expect(withoutLinkPlaceholder('A\n\n[CONFIRM_LINK]\n\nB')).toBe('A\n\nB');
    expect(withoutLinkPlaceholder('no placeholder here')).toBe('no placeholder here');
  });

  it('AC-LINK-09: a stored template draft sent with the flag off holds no placeholder line and no token row', async () => {
    const t = await setup({ draft: templateReply({ ...facts, link: true }), promise: PROMISE, enabled: false });
    expect((await t.send()).code).toBe(200);
    expect(t.sentTexts[0]).not.toContain('[CONFIRM_LINK]');
    expect(t.sentTexts[0]).not.toContain('one-time link');
    expect(t.sentTexts[0]).toContain('30 Oct 2026');
    expect(t.mem.outbound[0].body).toBe(templateReply(facts));
    expect(t.store.rows).toEqual([]);
  });

  it('AC-LINK-09: a model draft with the placeholder on the promise line falls back to the template (the date is kept)', async () => {
    const t = await setup({ draft: 'Hello,\nPlease send the ZIP code. We can deliver by 30 Oct 2026; or confirm here: [CONFIRM_LINK]\nHalcyon Logistics',
      promise: PROMISE, enabled: false });
    expect((await t.send()).code).toBe(200);
    expect(t.mem.outbound[0].body).not.toContain('[CONFIRM_LINK]');
    expect(t.mem.outbound[0].body).toContain('We can deliver by 30 Oct 2026');
    expect(t.mem.outbound[0].body).toContain('Thank you for your order');
    expect(t.store.rows).toEqual([]);
  });

  it('AC-LINK-09: a model draft whose placeholder sentence stands alone keeps the model text, minus that sentence', async () => {
    const t = await setup({ draft: 'Hello,\nWe can deliver by 30 Oct 2026. Or confirm here: [CONFIRM_LINK]\nHalcyon Logistics', promise: PROMISE, enabled: false });
    await t.send();
    expect(t.mem.outbound[0].body).toBe('Hello,\nWe can deliver by 30 Oct 2026.\nHalcyon Logistics');
  });

  it('REQ-LINK-09: flag on but no link service passed (the route before A18) → the placeholder is removed, never sent as text', async () => {
    const t = await setup();
    const r = await applyAction(t.mem.repo, t.id, 'send_reply', 'u1', { gmail: t.gmail as never, allow: t.allow });
    expect(r.code).toBe(200);
    expect(t.sentTexts[0]).not.toContain('[CONFIRM_LINK]');
    expect(t.store.rows).toEqual([]);
  });
});

// ---- A17 review findings (docs/agent-runs/2026-10-30-reviewer-A17-link-service.md, probes P1–P7) ----

const FULL: Extraction = { items: [{ sku: 'HX-616', qty: 45 }], requested_commitment: 'next_day', confidence: { items: 1, address: 1 },
  address: { ...ADDRESS, raw: null } };
const mapHigh: AddressValidator = { name: 'fake-map-high', geocode: async (q) => ({ features: [{ properties: { type: 'Address', confidence: 'High',
  matchCodes: ['Good'], address: { addressLine: q.line1, locality: q.city, postalCode: q.zip, adminDistricts: [{ shortName: q.state }] } } }] }) };
type T = Awaited<ReturnType<typeof setup>>;
/** The client's follow-up email in the order's thread, through the real pipeline (fake model, no PII, a map that agrees). */
const followUp = (t: T) => processEmail({ from: 'orders@client025.example', subject: 'Re: [SYNTHETIC] Order', inReplyTo: t.id,
  body: '[SYNTHETIC] Deliver to 415 Summer St Dock 1, Boston, MA 02210. 45 x HX-616', receivedAt: '2026-10-29 10:30' },
{ ...t.intake, maps: mapHigh, links: t.store.links, pii: { name: 'none', detect: async () => [] },
  llm: { name: 'fake', json: async () => structuredClone(FULL) as never, text: async () => { throw new Error('offline'); } } });
const awaiting = (t: T) => t.mem.emails.filter((e) => e.status === 'AWAITING_APPROVAL').map((e) => e.id);

describe('E19 one order, one review (A17 review finding 1; a default for A to confirm)', () => {
  it('REQ-LINK-08: email first, then the link → the follow-up revoked the link; exactly one order awaits approval', async () => {
    const t = await setup(); await t.send();
    const second = await followUp(t);
    expect(second.decision).toBe('ALL_CLEAR');
    expect(linkState(t.store.rows[0], new Date('2026-10-29T10:00:00Z'))).toBe('revoked');
    expect(await confirmLink(t.link, t.intake, t.tokenOf()!, { address: ADDRESS, pin: START })).toEqual({ code: 404, body: INVALID });
    expect(awaiting(t)).toEqual([second.id]);
  });

  it('REQ-LINK-08: a newer email in the thread makes the link invalid even when it was not revoked (404, link unused)', async () => {
    const t = await setup(); await t.send();
    await t.mem.repo.insertEmail({ ...t.mem.emails[0], hash: 'h2', in_reply_to: t.id, received_at: '2026-10-29 10:30' });
    expect(await viewLink(t.link, t.tokenOf()!)).toBeNull();
    expect(await confirmLink(t.link, t.intake, t.tokenOf()!, { address: ADDRESS, pin: START })).toEqual({ code: 404, body: INVALID });
    expect(t.store.rows[0].used_at).toBeNull();
    expect(t.mem.emails[0].status).toBe('SENT');
  });

  it('REQ-LINK-08: link first, then an email → the newer ALL_CLEAR email supersedes the link-confirmed one; exactly one order awaits approval', async () => {
    const t = await setup(); await t.send();
    expect((await confirmLink(t.link, t.intake, t.tokenOf()!, { address: ADDRESS, pin: START })).code).toBe(200);
    expect(awaiting(t)).toEqual([t.id]);
    const second = await followUp(t);
    expect(second.decision).toBe('ALL_CLEAR');
    expect(awaiting(t)).toEqual([second.id]);
    expect(t.mem.emails[0].status).toBe('REJECTED');
    expect(t.mem.audit.at(-1)).toMatchObject({ user: 'system:intake', action: 'superseded', ref: `email:${t.id}`, payload: { by: second.id } });
  });
});

describe('E19 atomic confirm and status guard (A17 review findings 2, 5)', () => {
  it('REQ-LINK-04: a failure while deciding again (P4: carriers down) leaves the link unused and the order unchanged; the retry confirms', async () => {
    const t = await setup(); await t.send();
    const ok = t.intake.carriers;
    t.intake.carriers = { recommendCarrier: async () => { throw new Error('carriers down'); } };
    await expect(confirmLink(t.link, t.intake, t.tokenOf()!, { address: ADDRESS, pin: START })).rejects.toThrow('carriers down');
    expect(t.store.rows[0].used_at).toBeNull();
    expect(t.mem.emails[0].status).toBe('SENT');
    expect(t.mem.extractions).toHaveLength(1);
    expect(t.mem.audit.filter((a) => a.user.startsWith('client-link:'))).toEqual([]);
    t.intake.carriers = ok;
    expect((await confirmLink(t.link, t.intake, t.tokenOf()!, { address: ADDRESS, pin: START })).code).toBe(200);
    expect(t.mem.emails[0].status).toBe('AWAITING_APPROVAL');
  });

  it('SEC-LINK-02: only an email awaiting the client (SENT) is decided again; otherwise the link is invalid and stays unused', async () => {
    for (const status of ['APPROVED', 'AWAITING_APPROVAL', 'ENTERED', 'REJECTED']) {
      const t = await setup(); await t.send();
      await t.mem.repo.setStatus(t.id, status);
      expect(await confirmLink(t.link, t.intake, t.tokenOf()!, { address: ADDRESS, pin: START })).toEqual({ code: 404, body: INVALID });
      expect(t.store.rows[0].used_at).toBeNull();
      expect(t.mem.emails[0].status).toBe(status);
    }
  });
});

describe('E19 the placeholder never comes from untrusted data (A17 review findings 3, 4)', () => {
  const injectedCity = (t: T) => {
    const x = t.mem.extractions[0];
    const city = 'Boston [CONFIRM_LINK]';
    x.extraction!.address.city = city;
    x.checks.address = { status: 'unverified', address: { ...ADDRESS, city }, missing: [], candidates: [],
      validation: { confidence: 'medium', issues: ['zip_mismatch'], suggestion: { line1: '415 Summer St', city: 'Boston', state: 'MA', zip: '02110' } } };
  };
  const P6_DRAFT = 'Hello,\nThe ZIP code does not match; the map shows 02110, confirm here: [CONFIRM_LINK]\nHalcyon Logistics';
  const count = (s: string, needle: string) => s.split(needle).length - 1;

  it('SEC-LINK-09, REQ-LINK-09: P6 flag off: a client city holding [CONFIRM_LINK] is not sent as text by the template fallback', async () => {
    const t = await setup({ draft: P6_DRAFT, enabled: false });
    injectedCity(t);
    expect((await t.send()).code).toBe(200);
    expect(t.sentTexts[0]).not.toContain('[CONFIRM_LINK]');
    expect(t.sentTexts[0]).toContain('02110');
    expect(t.store.rows).toEqual([]);
  });

  it('REQ-LINK-01: P6 flag on: the draft from neutralised facts holds one placeholder; minting puts in exactly one link', async () => {
    const t = await setup();
    injectedCity(t);
    const x = t.mem.extractions[0];
    const draft = templateReply(replyFactsOf({ decision: 'CONFIRM_ADDRESS', clientName: 'Client 25', piiMap: {}, extraction: x.extraction,
      address: x.checks.address, promise: null, link: true }));
    expect(count(draft, '[CONFIRM_LINK]')).toBe(1);
    x.reply_draft = draft;
    expect((await t.send()).code).toBe(200);
    expect(count(t.sentTexts[0], '/confirm/')).toBe(1);
    expect(t.sentTexts[0]).not.toContain('[CONFIRM_LINK]');
  });

  it('REQ-LINK-01: P6 flag on: the operator removed the placeholder → the injected city mints nothing', async () => {
    const t = await setup();
    injectedCity(t);
    const x = t.mem.extractions[0];
    const edited = templateReply(replyFactsOf({ decision: 'CONFIRM_ADDRESS', clientName: 'Client 25', piiMap: {}, extraction: x.extraction,
      address: x.checks.address, promise: null }));
    expect((await t.send(edited)).code).toBe(200);
    expect(t.store.rows).toEqual([]);
    expect(t.sentTexts[0]).not.toContain('[CONFIRM_LINK]');
  });

  it('SEC-LINK-09: P7 a contact name holding [CONFIRM_LINK]: flag off falls back to the template without it; flag on mints nothing for it', async () => {
    const piiMap = { '[PERSON_1]': 'Bob [CONFIRM_LINK]' };
    const off = await setup({ piiMap, enabled: false, promise: PROMISE,
      draft: 'Hello [PERSON_1],\nPlease send the ZIP code. We can deliver by 30 Oct 2026; or confirm: [CONFIRM_LINK]\nHalcyon Logistics' });
    expect((await off.send()).code).toBe(200);
    expect(off.sentTexts[0]).toContain('Hello Bob,');
    expect(off.sentTexts[0]).not.toContain('[CONFIRM_LINK]');

    const on = await setup({ piiMap, draft: 'Hello [PERSON_1],\nPlease send the ZIP code.\nHalcyon Logistics' });
    expect((await on.send()).code).toBe(200);
    expect(on.store.rows).toEqual([]);
    expect(on.sentTexts[0]).toContain('Hello Bob,');
    expect(on.sentTexts[0]).not.toContain('[CONFIRM_LINK]');

    const both = await setup({ piiMap });
    both.mem.extractions[0].reply_draft = 'Hello [PERSON_1],\nPlease confirm: [CONFIRM_LINK]\nHalcyon Logistics';
    expect((await both.send()).code).toBe(200);
    expect(count(both.sentTexts[0], '/confirm/')).toBe(1);
  });

  it('REQ-LINK-09: P3 an operator-edited reply holding [CONFIRM_LINK] with no link to send → 409, nothing sent, no row', async () => {
    const edited = 'Hi Bob, sorry for the delay on PO 7781. Please send the street address. We can deliver by 30 Oct 2026 or confirm at [CONFIRM_LINK].\nThanks, Ana';
    const off = await setup({ enabled: false, promise: PROMISE });
    const r = await off.send(edited);
    expect(r.code).toBe(409);
    expect(r.error).toContain('[CONFIRM_LINK]');
    expect(off.sentTexts).toEqual([]);
    expect(off.mem.emails[0].status).toBe('APPROVED');
    const noService = await setup({ promise: PROMISE });
    expect((await applyAction(noService.mem.repo, noService.id, 'send_reply', 'u1', { gmail: noService.gmail as never, allow: noService.allow },
      { edited })).code).toBe(409);
    expect(noService.sentTexts).toEqual([]);
  });
});

describe('E19 save on approval, re-send failure, link URL (A17 review findings 6, 7, 8)', () => {
  it('REQ-LINK-05: a failing save leaves the order unapproved with no approval audit row', async () => {
    const t = await setup(); await t.send();
    await confirmLink(t.link, t.intake, t.tokenOf()!, { address: ADDRESS, pin: START });
    const broken = { ...t.link, links: { ...t.link.links, saveAddress: async () => { throw new Error('db down'); } } };
    await expect(applyAction(t.mem.repo, t.id, 'approve', 'u1', undefined, { link: broken })).rejects.toThrow('db down');
    expect(t.mem.emails[0].status).toBe('AWAITING_APPROVAL');
    expect(t.mem.audit.filter((a) => a.action === 'approve')).toEqual([]);
  });

  it('REQ-LINK-05: an address the client already has saved is not saved twice', async () => {
    const a = await setup(); await a.send();
    await confirmLink(a.link, a.intake, a.tokenOf()!, { address: ADDRESS, pin: START });
    await applyAction(a.mem.repo, a.id, 'approve', 'u1', undefined, { link: a.link });
    expect(await a.store.links.saveAddress({ clientId: 'C025', address: { ...ADDRESS, line1: '415 summer st.' }, pin: START, emailId: 9,
      confirmedAt: new Date(), synthetic: true })).toBe(false);
    expect(a.store.saved).toHaveLength(1);
  });

  it('REQ-LINK-08: a Gmail failure on a re-send keeps the link the client already holds working', async () => {
    const t = await setup(); await t.send();
    const first = t.tokenOf()!;
    await t.mem.repo.setStatus(t.id, 'APPROVED');
    const broken = { sendMessage: async () => { throw new Error('gmail down'); } };
    await expect(applyAction(t.mem.repo, t.id, 'send_reply', 'u1', { gmail: broken as never, allow: t.allow }, { link: t.link })).rejects.toThrow();
    expect(await viewLink(t.link, first)).not.toBeNull();
    expect(t.store.rows.map((r) => linkState(r, new Date('2026-10-29T10:00:00Z')))).toEqual(['sent', 'revoked']);
  });

  it('AC-LINK-01: the link URL is inserted literally ($ patterns in AUTH_URL are not replacement patterns)', async () => {
    const t = await setup({ appUrl: 'https://a$&b.example' });
    await t.send();
    expect(t.sentTexts[0]).toContain(`https://a$&b.example/confirm/${t.tokenOf()}`);
  });
});

// ---- v0.18 (30 Oct): the server looks up the typed address on every Confirm (REQ-LINK-12 to -15) ----

/** The address of the 30 Oct local test (AC-LINK-13): line 1 holds a whole US address, the city an Indian locality. */
const MADHAPUR = { line1: '65156 Powers Rd, Enterprise, OR 97828, United States', line2: null, city: 'Madhapur', state: 'OR', zip: '97828' };
const ADDRESS_READING = { of: 'address', found: true, line1: '415 Summer St', city: 'Boston', state: 'MA', zip: '02210', distanceM: null, differs: [] };
type Asked = { error: string; reading: Record<string, unknown>; checkId: string };

describe('E19 address look-up on Confirm (REQ-LINK-12 to -15)', () => {
  it('AC-LINK-12: no pin and a map answer matching the typed city, state and ZIP → 200 at once; the pin is the geocoded point', async () => {
    const t = await setup(); await t.send();
    const before = t.store.rows[0].map_lookups;
    expect(await confirmLink(t.link, t.intake, t.tokenOf()!, { address: ADDRESS })).toEqual({ code: 200, body: { status: 'confirmed' } });
    expect(t.store.rows[0]).toMatchObject({ confirmed_address: ADDRESS, lat: START.lat, lon: START.lon, map_reading: ADDRESS_READING });
    expect(t.store.rows[0].used_at).not.toBeNull();
    expect(t.store.rows[0].map_lookups).toBe(before + 1);
    expect(t.mode.reverseCalls).toBe(0);
    expect(t.mem.extractions.at(-1)?.decision).toBe('ALL_CLEAR');
  });

  it('AC-LINK-12: the city is compared ignoring case and spaces; the ZIP on its first 5 digits', async () => {
    const t = await setup(); await t.send();
    t.link.maps = { ...t.link.maps, geocode: async () => ({ features: [{ geometry: { type: 'Point', coordinates: [START.lon, START.lat] },
      properties: { type: 'Address', confidence: 'High', address: { addressLine: '415 Summer St', locality: 'BOSTON', postalCode: '02210-1004', adminDistricts: [{ shortName: 'MA' }] } } }] }) };
    expect((await confirmLink(t.link, t.intake, t.tokenOf()!, { address: { ...ADDRESS, city: ' bos ton ', zip: '02210' } })).code).toBe(200);
  });

  it('AC-LINK-12: the map unreachable → 503 map_unavailable and the link unused; a retry once it is back confirms', async () => {
    const t = await setup(); await t.send();
    t.mode.forward = 'down';
    expect(await confirmLink(t.link, t.intake, t.tokenOf()!, { address: ADDRESS })).toEqual({ code: 503, body: { error: 'map_unavailable' } });
    expect(await confirmLink(t.link, t.intake, t.tokenOf()!, { address: ADDRESS, pin: north(100) })).toEqual({ code: 503, body: { error: 'map_unavailable' } });
    expect(t.store.rows[0].used_at).toBeNull();
    expect(t.mem.emails[0].status).toBe('SENT');
    expect(t.events.filter((e) => e.event === 'link_refused').map((e) => e.fields.why)).toEqual(['map_unavailable', 'map_unavailable']);
    t.mode.forward = 'match';
    t.mode.reverseDown = true; // the pin's reading is a map look-up too
    expect(await confirmLink(t.link, t.intake, t.tokenOf()!, { address: ADDRESS, pin: north(600) })).toEqual({ code: 503, body: { error: 'map_unavailable' } });
    t.mode.reverseDown = false;
    expect((await confirmLink(t.link, t.intake, t.tokenOf()!, { address: ADDRESS })).code).toBe(200);
  });

  it('AC-LINK-13: the 30 Oct address with no pin → 409 naming city; again with the checkId → 200 with no pin; another city voids the checkId', async () => {
    const t = await setup(); await t.send();
    t.mode.forward = 'differ';
    const first = await confirmLink(t.link, t.intake, t.tokenOf()!, { address: MADHAPUR });
    expect(first.code).toBe(409);
    const asked = first.body as Asked;
    expect(asked).toMatchObject({ error: 'needs_second_confirm', reading: { of: 'address', found: true, line1: '65156 Powers Rd', city: 'Enterprise',
      state: 'OR', zip: '97828', distanceM: null, differs: ['city'] } });
    expect(t.store.rows[0].used_at).toBeNull();

    // Another city with the same checkId: the checkId does not count and the address is checked anew.
    const lookups = t.store.rows[0].map_lookups;
    const again = await confirmLink(t.link, t.intake, t.tokenOf()!, { address: { ...MADHAPUR, city: 'Hyderabad' }, checkId: asked.checkId });
    expect(again.code).toBe(409);
    expect(t.store.rows[0].map_lookups).toBe(lookups + 1);
    const latest = (again.body as Asked).checkId;
    expect(latest).not.toBe(asked.checkId);

    // The first checkId was replaced; the newest one, with the same fields, confirms with no pin.
    expect((await confirmLink(t.link, t.intake, t.tokenOf()!, { address: MADHAPUR, checkId: asked.checkId })).code).toBe(409);
    const third = t.store.rows[0].map_reading as { checkId: string };
    expect(await confirmLink(t.link, t.intake, t.tokenOf()!, { address: MADHAPUR, checkId: third.checkId })).toEqual({ code: 200, body: { status: 'confirmed' } });
    expect(t.store.rows[0]).toMatchObject({ confirmed_address: MADHAPUR, lat: null, lon: null,
      map_reading: { of: 'address', city: 'Enterprise', differs: ['city'] } });
  });

  it('AC-LINK-13: a pin 400 m from its start, the ZIP unchanged and a city the map reads differently → 409, a reading of the pin naming city; the pin is stored', async () => {
    const t = await setup(); await t.send();
    t.mode.forward = 'differ';
    const first = await confirmLink(t.link, t.intake, t.tokenOf()!, { address: ADDRESS, pin: north(400) });
    expect(first.code).toBe(409);
    expect((first.body as Asked).reading).toMatchObject({ of: 'pin', found: true, line1: '1 Other St', distanceM: 400, differs: ['city'] });
    expect(await confirmLink(t.link, t.intake, t.tokenOf()!, { address: ADDRESS, pin: north(400), checkId: (first.body as Asked).checkId }))
      .toEqual({ code: 200, body: { status: 'confirmed' } });
    expect(t.store.rows[0]).toMatchObject({ lat: north(400).lat, lon: north(400).lon, map_reading: { of: 'pin', differs: ['city'] } });
  });

  it('AC-LINK-14: no pin and no map point → 409 marked not found; again with the checkId → 200, lat and lon null', async () => {
    const t = await setup(); await t.send();
    t.mode.forward = 'none';
    const first = await confirmLink(t.link, t.intake, t.tokenOf()!, { address: ADDRESS });
    expect(first.code).toBe(409);
    expect((first.body as Asked).reading).toEqual({ of: 'address', found: false, line1: null, city: null, state: null, zip: null, distanceM: null,
      differs: ['city', 'state', 'zip'] });
    expect(t.store.rows[0].used_at).toBeNull();
    expect((await confirmLink(t.link, t.intake, t.tokenOf()!, { address: ADDRESS, checkId: (first.body as Asked).checkId })).code).toBe(200);
    expect(t.store.rows[0]).toMatchObject({ lat: null, lon: null, map_reading: { of: 'address', found: false } });
    expect(t.mem.extractions.at(-1)?.decision).toBe('ALL_CLEAR');
  });

  it('REQ-LINK-14: with a pin sent and no map point for the typed address, the case is a difference: 409 with the pin\'s reading', async () => {
    const t = await setup(); await t.send();
    t.mode.forward = 'none';
    const first = await confirmLink(t.link, t.intake, t.tokenOf()!, { address: ADDRESS, pin: north(100) });
    expect(first.code).toBe(409);
    expect((first.body as Asked).reading).toMatchObject({ of: 'pin', found: true, distanceM: 100, differs: ['city', 'state', 'zip'] });
  });

  it('REQ-LINK-13: a checkId counts only for the same five fields and the same pin or no pin', async () => {
    const t = await setup(); await t.send();
    t.mode.forward = 'differ';
    const noPin = (await confirmLink(t.link, t.intake, t.tokenOf()!, { address: ADDRESS })).body as Asked;
    for (const changed of [{ address: { ...ADDRESS, line2: 'Dock 2' } }, { address: { ...ADDRESS, line1: '416 Summer St' } }, { address: ADDRESS, pin: START }]) {
      const pending = t.store.rows[0].map_reading as { checkId: string };
      const r = await confirmLink(t.link, t.intake, t.tokenOf()!, { ...changed, checkId: pending.checkId });
      expect(r.code, JSON.stringify(changed)).toBe(409);
    }
    expect(noPin.checkId).toBeTruthy();
    // A checkId issued for a pin does not count once the pin is left out.
    const withPin = (await confirmLink(t.link, t.intake, t.tokenOf()!, { address: ADDRESS, pin: north(100) })).body as Asked;
    expect((await confirmLink(t.link, t.intake, t.tokenOf()!, { address: ADDRESS, checkId: withPin.checkId })).code).toBe(409);
    expect(t.store.rows[0].used_at).toBeNull();
  });

  it('REQ-LINK-04: a pin within 500 m and a matching address confirms at once with the client\'s pin and the address reading', async () => {
    const t = await setup(); await t.send();
    expect((await confirmLink(t.link, t.intake, t.tokenOf()!, { address: ADDRESS, pin: north(400) })).code).toBe(200);
    expect(t.store.rows[0]).toMatchObject({ lat: north(400).lat, lon: north(400).lon, map_reading: ADDRESS_READING });
    expect(t.mode.reverseCalls).toBe(0);
  });

  it('AC-LINK-05: an order confirmed with no pin is saved on approval with lat and lon null', async () => {
    const t = await setup(); await t.send();
    t.mode.forward = 'none';
    const asked = (await confirmLink(t.link, t.intake, t.tokenOf()!, { address: ADDRESS })).body as Asked;
    await confirmLink(t.link, t.intake, t.tokenOf()!, { address: ADDRESS, checkId: asked.checkId });
    expect(t.store.saved).toEqual([]);
    expect((await applyAction(t.mem.repo, t.id, 'approve', 'u1', undefined, { link: t.link })).code).toBe(200);
    expect(t.store.saved).toEqual([{ clientId: 'C025', address: ADDRESS, emailId: t.id, pin: null, confirmedAt: new Date('2026-10-29T10:00:00Z'), synthetic: true }]);
    expect(t.mem.audit.at(-1)).toMatchObject({ action: 'approve', payload: { savedAddress: 'link' } });
  });
});

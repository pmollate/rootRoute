import { describe, expect, it } from 'vitest';
import type { CarrierRecommendation, CarriersApi, PromiseResult, WarehouseApi } from '../../src/core/contracts.js';
import type { AddressValidator } from '../../src/core/maps/types.js';
import { applyAction } from '../../src/modules/intake/actions.js';
import { confirmLink, INVALID, type LinkDeps, linkState, mintLink, viewLink } from '../../src/modules/intake/link.js';
import { hashToken } from '../../src/modules/intake/linkRules.js';
import type { Deps } from '../../src/modules/intake/pipeline.js';
import { templateReply, withoutLinkPlaceholder } from '../../src/modules/intake/reply.js';
import { checkPromise } from '../../src/modules/warehouse/domain.js';
import { memoryLinks } from './memoryLinks.js';
import { memoryRepo } from './memoryRepo.js';

const C025 = { client_id: 'C025', client_name: 'Client 25', sla_penalty_clause: 'N', region: 'Northeast', account_tier: 'Tier 2', account_status: 'active' };
const REC: CarrierRecommendation = { carrier: 'E', backup: 'A', reason: 'E: best on this lane', blocked: [], options: [] };
const START = { lat: 42.3523, lon: -71.0466 };
const north = (m: number) => ({ lat: START.lat + m / 111_195, lon: START.lon });
const ADDRESS = { line1: '415 Summer St', line2: 'Dock 1', city: 'Boston', state: 'MA', zip: '02210' };
const PROMISE: PromiseResult = { promiseDate: '2026-10-30', commitment: 'next_day', downgraded: false, reason: null };
const fakeMap = (geocodeOk = true): AddressValidator => ({ name: 'fake-map',
  geocode: async () => {
    if (!geocodeOk) throw new Error('map down');
    return { features: [{ geometry: { type: 'Point', coordinates: [START.lon, START.lat] }, properties: { type: 'Address', confidence: 'Medium' } }] };
  },
  reverse: async () => ({ features: [{ properties: { type: 'Address', confidence: 'High', address: { addressLine: '1 Other St', locality: 'Boston', postalCode: '02210', adminDistricts: [{ shortName: 'MA' }] } } }] }) });
const warehouse: WarehouseApi = { checkPromise, nearestWarehouse: async () => 'W4', pickWarehouse: async (i) => ({ warehouseId: i.nearestWarehouseId, reason: 'nearest', warnClient: false }) };
const carriers: CarriersApi = { recommendCarrier: async () => structuredClone(REC) };
const TEMPLATE = 'Hello,\nPlease confirm: [CONFIRM_LINK]\nHalcyon Logistics';

interface Setup { draft?: string; promise?: PromiseResult | null; enabled?: boolean; appUrl?: string; geocodeOk?: boolean }

/** A CONFIRM_ADDRESS order from C025, approved by the desk, ready for send_reply; the clock is 29 Oct 10:00 UTC. */
async function setup({ draft = TEMPLATE, promise = null, enabled = true, appUrl = 'https://app.example', geocodeOk = true }: Setup = {}) {
  const maps = fakeMap(geocodeOk);
  const mem = memoryRepo({ 'client025.example': C025 }, []);
  const id = await mem.repo.insertEmail({ source: 'paste', gmail_id: null, thread_id: null, message_id: null, from_addr: 'orders@client025.example',
    subject: '[SYNTHETIC] Order', body: '[SYNTHETIC] 45 x HX-616 to 415 Summer St Dock 1, Boston, MA 02210', redacted_body: null, pii_map: {},
    received_at: '2026-10-29 09:00', in_reply_to: null, hash: 'h1', client_id: 'C025' });
  await mem.repo.saveExtraction({ email_id: id, decision: 'CONFIRM_ADDRESS', reply_draft: draft, reply_source: 'template',
    extraction: { items: [{ sku: 'HX-616', qty: 45 }], requested_commitment: 'next_day', confidence: { items: 1, address: 1 }, address: { ...ADDRESS, raw: null } },
    checks: { address: { status: 'unverified', address: ADDRESS, missing: [], candidates: [], validation: null }, promise, warehouse: null, carrier: null } });
  await mem.repo.setStatus(id, 'APPROVED');
  const store = memoryLinks(() => mem.emails);
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
  return { mem, id, store, link, intake, send, sentTexts, tokenOf, events, issued, gmail, allow,
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

  it('AC-LINK-03: 600 m → 409 with the reading and an unused link; again with the checkId → confirmed', async () => {
    const t = await setup(); await t.send();
    const first = await confirmLink(t.link, t.intake, t.tokenOf()!, { address: ADDRESS, pin: north(600) });
    expect(first.code).toBe(409);
    expect(first.body).toMatchObject({ error: 'needs_second_confirm', reading: { line1: '1 Other St', city: 'Boston', state: 'MA', zip: '02210', distanceM: 600 } });
    expect(t.store.rows[0].used_at).toBeNull();
    const checkId = (first.body as { checkId: string }).checkId;
    expect((await confirmLink(t.link, t.intake, t.tokenOf()!, { address: ADDRESS, pin: north(600), checkId })).code).toBe(200);
    expect(t.store.rows[0]).toMatchObject({ confirmed_address: ADDRESS, lat: north(600).lat, lon: north(600).lon,
      map_reading: { line1: '1 Other St', distanceM: 600 } });
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
    const first = await confirmLink(t.link, t.intake, t.tokenOf()!, { address: ADDRESS, pin: START });
    expect(first.code).toBe(409);
    expect((first.body as { reading: { distanceM: number } }).reading.distanceM).toBe(0);
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

  it('AC-SEC-LINK-04: the 21st map look-up for one link is refused', async () => {
    const t = await setup(); await t.send();
    for (let i = 0; i < 20; i += 1) expect((await confirmLink(t.link, t.intake, t.tokenOf()!, { address: ADDRESS, pin: north(600 + i) })).code).toBe(409);
    expect(await confirmLink(t.link, t.intake, t.tokenOf()!, { address: ADDRESS, pin: north(700) })).toEqual({ code: 429, body: { error: 'rate_limited' } });
    expect(t.store.rows[0].used_at).toBeNull();
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

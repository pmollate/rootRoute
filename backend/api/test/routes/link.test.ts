import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { allowList } from '../../src/core/config.js';
import { pool, query } from '../../src/core/db/pool.js';
import type { AddressValidator } from '../../src/core/maps/types.js';
import { getDeps, setDeps } from '../../src/modules/intake/deps.js';
import { createMapCredentials, setLinkDeps } from '../../src/modules/intake/linkDeps.js';
import { hashToken, newToken } from '../../src/modules/intake/linkRules.js';
import { buildApp, redactLink } from '../../src/server.js';
import { hasDb } from '../db.js';
import { AUTH_ON } from '../token.js';
import { loadFixtures } from '../intake/fixtures.js';

// E19 (SPEC §5.17): the confirm routes over HTTP. This block needs no database.
describe('E19 confirm routes: the token never reaches a log line', () => {
  it('AC-SEC-LINK-01: the request log serializer writes /api/confirm/[token], never the token', async () => {
    const lines: string[] = [];
    const app = await buildApp({ logStream: { write: (s: string) => { lines.push(s); } } });
    const token = newToken();
    await app.inject({ method: 'GET', url: `/api/confirm/${token}` });
    await app.inject({ method: 'GET', url: `/api/confirm/${token}?x=1` });
    await app.inject({ method: 'GET', url: `/api/confirm/${token}/more` }); // unmatched: the auth hook's route field
    await app.inject({ method: 'POST', url: `/api/confirm/${token}/lookup`, payload: { pin: { lat: 45.4, lon: -117.3 } } }); // REQ-LINK-16
    await app.close();
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect(l).not.toContain(token);
    expect(lines.some((l) => l.includes('/api/confirm/[token]'))).toBe(true);
  });

  it('AC-SEC-LINK-05 (API half): with AUTH_REQUIRED=on and no session or key, the confirm routes answer (404 link_invalid), not 401; other routes still refuse', async () => {
    const app = await buildApp({ auth: AUTH_ON });
    const t = newToken();
    for (const res of [await app.inject({ method: 'GET', url: `/api/confirm/${t}` }),
      await app.inject({ method: 'POST', url: `/api/confirm/${t}`, payload: {} }),
      await app.inject({ method: 'POST', url: `/api/confirm/${t}/lookup`, payload: { pin: { lat: 45.4, lon: -117.3 } } })]) { // REQ-LINK-16
      expect([res.statusCode, res.body]).toEqual([404, '{"error":"link_invalid"}']);
    }
    expect((await app.inject({ method: 'GET', url: '/api/overview' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/confirmx' })).statusCode).not.toBe(200);
    await app.close();
  });

  it('AC-SEC-LINK-01: redactLink replaces only the path segment after /confirm/', () => {
    expect(redactLink('/api/confirm/abc_DEF-123?x=1')).toBe('/api/confirm/[token]?x=1');
    expect(redactLink('/confirm/abc')).toBe('/confirm/[token]');
    expect(redactLink('/api/intake/3')).toBe('/api/intake/3');
  });
});

// E19 over HTTP on the test database: fixture 21 (C130, ZIP that does not match the city, recorded map Medium with a
// point) and fixture 34 (C190, line 1 and ZIP missing, so no start pin), each pasted, approved and sent with send_reply.
describe.skipIf(!hasDb)('E19 confirm routes, link state and review fields (needs test database)', () => {
  let app: FastifyInstance;
  const fx = Object.fromEntries(loadFixtures().map((f) => [f.gold.id, f]));
  const logs: string[] = [];
  const sent: string[] = [];
  const issued: Date[] = [];
  const ORLANDO = { line1: '400 S Orange Ave', line2: null, city: 'Orlando', state: 'FL', zip: '32801' };
  const ORLANDO_PIN = { lat: 28.5384, lon: -81.3789 };
  const A_EXTRA = 'orders@client130.example'; // fixture 21's sender, added to the allow-list for this file only
  const orders: Record<string, { id: number; token: string }> = {};

  const post = (url: string, payload: object) => app.inject({ method: 'POST', url, payload, headers: { 'x-api-key': 'test-key' } });
  const get = (url: string) => app.inject({ method: 'GET', url });
  const confirm = (token: string, payload: object) => app.inject({ method: 'POST', url: `/api/confirm/${token}`, payload });
  const row = async (id: number) => (await query<{ used_at: Date | null; revoked_at: Date | null; expires_at: Date; issued_at: Date;
    confirmed_address: object | null; lat: number | null; token_hash: string }>(
    'SELECT * FROM address_confirm_tokens WHERE email_id = $1 ORDER BY id DESC LIMIT 1', [id]))[0];
  const linkOf = async (id: number) =>
    (await get('/api/intake')).json().emails.find((e: { id: number }) => e.id === id).link as { state: string; expiresAt: string } | null;

  async function linked(fixture: string) {
    const f = fx[fixture];
    const r = (await post('/api/intake/email', { from: f.gold.from, subject: f.subject, body: f.body, receivedAt: f.gold.received_at })).json();
    expect(r.decision).toBe('CONFIRM_ADDRESS');
    expect((await post(`/api/intake/${r.id}/action`, { action: 'approve' })).statusCode).toBe(200);
    expect((await post(`/api/intake/${r.id}/action`, { action: 'send_reply' })).json()).toEqual({ status: 'SENT' });
    const token = /\/confirm\/([A-Za-z0-9_-]{43})/.exec(sent.at(-1) ?? '')?.[1];
    expect(token).toHaveLength(43);
    return { id: r.id as number, token: token! };
  }

  beforeAll(async () => {
    await query('TRUNCATE address_confirm_tokens, intake_extractions, outbound_messages, intake_emails RESTART IDENTITY CASCADE');
    await query("DELETE FROM audit_log WHERE actor LIKE 'client-link:%'");
    allowList.add(A_EXTRA);
    const recorded = getDeps().maps;
    // Recorded forward look-ups; the reverse look-up (REQ-LINK-03) reads the Orlando pin as 400 S Orange Ave.
    const maps: AddressValidator = { name: 'recorded+reverse', geocode: (q) => recorded.geocode(q),
      reverse: async () => ({ features: [{ properties: { type: 'Address', confidence: 'High', address: { addressLine: '400 S Orange Ave',
        locality: 'Orlando', postalCode: '32801', adminDistricts: [{ shortName: 'FL' }] } } }] }) };
    setDeps({ maps, confirmLink: true, gmail: { listMessageIds: async () => [], getMessage: async () => { throw new Error('none'); },
      sendMessage: async (raw: string) => { sent.push(raw); return `g-${sent.length}`; } } as never });
    setLinkDeps({ enabled: true, timeZone: 'UTC',
      credentials: { issue: async (e) => { issued.push(e); return { kind: 'sas', token: 'recorded', expiresAt: e.toISOString() }; } } });
    app = await buildApp({ logStream: { write: (s: string) => { logs.push(s); } } });
    orders.A = await linked('21');
    orders.B = await linked('34');
  });
  afterAll(async () => {
    allowList.delete(A_EXTRA);
    setDeps({ confirmLink: false, gmail: null });
    setLinkDeps({ enabled: false, credentials: createMapCredentials() });
    await app?.close();
    // Email ids restart in other files' TRUNCATEs: leave no client-link audit rows or links behind for them.
    await query("DELETE FROM audit_log WHERE actor LIKE 'client-link:%'");
    await query('TRUNCATE address_confirm_tokens RESTART IDENTITY');
    await pool.end();
  });

  it('AC-LINK-02: the page data holds the five address fields from the email and a pin, and nothing else about the order', async () => {
    const res = await get(`/api/confirm/${orders.A.token}`);
    expect(res.statusCode).toBe(200);
    const v = res.json();
    expect(v.address).toEqual({ line1: '920 Broad St', line2: 'Dock 5', city: 'Newark', state: 'NJ', zip: '85004' });
    expect(v.pin).toEqual({ lat: expect.any(Number), lon: expect.any(Number) });
    const detail = (await get(`/api/intake/${orders.A.id}`)).json();
    const listed = (await get('/api/intake')).json().emails.find((e: { id: number }) => e.id === orders.A.id);
    const forbidden = [...fx['21'].gold.items.map((i) => i.sku), ...fx['21'].gold.pii, 'qty', 'items', listed.clientName,
      detail.checks.promise?.promiseDate, 'promise'].filter((x): x is string => typeof x === 'string' && x.length > 0);
    for (const x of forbidden) expect(res.body).not.toContain(x);
  });

  it('AC-SEC-LINK-03 (view), AC-SEC-LINK-08 (API half): the GET body has exactly address, pin, expiresAt, synthetic, map; a SAS credential expiring with the link', async () => {
    const v = (await get(`/api/confirm/${orders.A.token}`)).json();
    expect(Object.keys(v).sort()).toEqual(['address', 'expiresAt', 'map', 'pin', 'synthetic']);
    expect(v.synthetic).toBe(true);
    expect(v.map.kind).toBe('sas');
    expect(new Date(v.map.expiresAt).getTime()).toBeLessThanOrEqual(new Date(v.expiresAt).getTime());
    expect(issued.at(-1)?.toISOString()).toBe(v.expiresAt);
  });

  it('AC-SEC-LINK-06: three GETs leave the link unused', async () => {
    for (let i = 0; i < 3; i += 1) expect((await get(`/api/confirm/${orders.A.token}`)).statusCode).toBe(200);
    const r = await row(orders.A.id);
    expect(r.used_at).toBeNull();
    expect(r.revoked_at).toBeNull();
  });

  it('AC-LINK-07, AC-SEC-LINK-02: random, expired, used and revoked links: GET and POST all 404 with byte-identical bodies', async () => {
    const { token, id } = orders.A;
    const body = { address: ORLANDO, pin: ORLANDO_PIN };
    const answers: { status: number; body: string }[] = [];
    const both = async (t: string) => {
      for (const res of [await get(`/api/confirm/${t}`), await confirm(t, body)]) answers.push({ status: res.statusCode, body: res.body });
    };
    await both(newToken());
    const saved = await row(id);
    for (const change of ["expires_at = now() - interval '1 minute'", 'used_at = now()', 'revoked_at = now()']) {
      await query(`UPDATE address_confirm_tokens SET ${change} WHERE email_id = $1`, [id]);
      await both(token);
      await query('UPDATE address_confirm_tokens SET expires_at = $2, used_at = NULL, revoked_at = NULL WHERE email_id = $1', [id, saved.expires_at]);
    }
    expect(answers).toHaveLength(8);
    for (const a of answers) expect(a).toEqual({ status: 404, body: '{"error":"link_invalid"}' });
    expect((await row(id)).used_at).toBeNull();
    expect((await get(`/api/intake/${id}`)).json().email.status).toBe('SENT'); // nothing was decided again
  });

  it('AC-LINK-09: with CONFIRM_LINK off a valid token gets the same 404 on both routes', async () => {
    setLinkDeps({ enabled: false });
    try {
      const g = await get(`/api/confirm/${orders.A.token}`);
      const p = await confirm(orders.A.token, { address: ORLANDO, pin: ORLANDO_PIN });
      expect([g.statusCode, g.body, p.statusCode, p.body]).toEqual([404, '{"error":"link_invalid"}', 404, '{"error":"link_invalid"}']);
      // REQ-LINK-06 is an E19 field: off, the intake list carries no link state.
      expect((await get('/api/intake')).json().emails.every((e: object) => !('link' in e))).toBe(true);
    } finally {
      setLinkDeps({ enabled: true });
    }
    expect((await row(orders.A.id)).used_at).toBeNull();
  });

  it('AC-SEC-LINK-08 (API half): an expired link gets 404 and no map credential is issued', async () => {
    const saved = await row(orders.A.id);
    await query("UPDATE address_confirm_tokens SET expires_at = now() - interval '1 minute' WHERE email_id = $1", [orders.A.id]);
    const before = issued.length;
    expect((await get(`/api/confirm/${orders.A.token}`)).statusCode).toBe(404);
    expect(issued.length).toBe(before);
    await query('UPDATE address_confirm_tokens SET expires_at = $2 WHERE email_id = $1', [orders.A.id, saved.expires_at]);
  });

  it('AC-LINK-06: a link sent 25 h ago and never used shows expired in GET /api/intake and /api/intake/:id, computed when read', async () => {
    expect(await linkOf(orders.A.id)).toEqual({ state: 'sent', expiresAt: (await row(orders.A.id)).expires_at.toISOString() });
    const saved = await row(orders.A.id);
    await query("UPDATE address_confirm_tokens SET issued_at = now() - interval '25 hours', expires_at = now() - interval '1 hour' WHERE email_id = $1", [orders.A.id]);
    expect((await linkOf(orders.A.id))?.state).toBe('expired');
    expect((await get(`/api/intake/${orders.A.id}`)).json().link.state).toBe('expired');
    await query('UPDATE address_confirm_tokens SET issued_at = $2, expires_at = $3 WHERE email_id = $1', [orders.A.id, saved.issued_at, saved.expires_at]);
    // An email that never had a link carries null.
    const f = fx['02'];
    const plain = (await post('/api/intake/email', { from: f.gold.from, subject: f.subject, body: f.body, receivedAt: f.gold.received_at })).json();
    expect(await linkOf(plain.id)).toBeNull();
    // No timer or scheduled job computes it (REQ-LINK-06).
    for (const file of ['link.ts', 'linkRules.ts', 'linkDeps.ts']) {
      const src = readFileSync(fileURLToPath(new URL(`../../src/modules/intake/${file}`, import.meta.url)), 'utf8');
      expect(src).not.toMatch(/setInterval|setTimeout|cron/);
    }
  });

  it("AC-SEC-LINK-03: posting order A's token with order B's address changes only A's row; AC-SEC-LINK-06: the POST confirms; AC-LINK-06: then confirmed", async () => {
    const first = await confirm(orders.A.token, { address: ORLANDO, pin: ORLANDO_PIN });
    expect(first.statusCode).toBe(409); // ZIP changed and the pin is far from Newark: the map's reading first (REQ-LINK-03)
    const { checkId, reading } = first.json();
    // The typed address matches the recorded map answer; the reading is of the pin (ZIP changed, REQ-LINK-03).
    expect(reading).toMatchObject({ of: 'pin', found: true, line1: '400 S Orange Ave', city: 'Orlando', state: 'FL', zip: '32801', differs: [] });
    expect((await row(orders.A.id)).used_at).toBeNull();
    expect((await confirm(orders.A.token, { address: ORLANDO, pin: ORLANDO_PIN, checkId })).json()).toEqual({ status: 'confirmed' });
    const a = await row(orders.A.id);
    expect(a.used_at).not.toBeNull();
    expect(a.confirmed_address).toEqual(ORLANDO);
    const b = await row(orders.B.id);
    expect([b.used_at, b.confirmed_address, b.lat]).toEqual([null, null, null]);
    expect((await get(`/api/intake/${orders.B.id}`)).json().email.status).toBe('SENT');
    expect((await linkOf(orders.A.id))?.state).toBe('confirmed');
    expect((await get(`/api/confirm/${orders.A.token}`)).statusCode).toBe(404); // single use
  });

  it('AC-LINK-04, AC-LINK-12, AC-LINK-11 (API): C190 confirms 400 S Orange Ave with no pin and a matching recorded map answer at once; ALL_CLEAR, in the review with the geocoded pin; send_to_wms before approval is 409', async () => {
    const before = (await query<{ map_lookups: number }>('SELECT map_lookups FROM address_confirm_tokens WHERE email_id = $1', [orders.B.id]))[0].map_lookups;
    expect((await confirm(orders.B.token, { address: ORLANDO })).json()).toEqual({ status: 'confirmed' });
    const r = await row(orders.B.id);
    expect(r.used_at).not.toBeNull();
    // The recorded Azure Maps answer for 400 S Orange Ave, Orlando, FL 32801 (test/recordings).
    expect([r.lat, (r as unknown as { lon: number }).lon]).toEqual([28.537664, -81.37965]);
    expect((await query<{ map_lookups: number }>('SELECT map_lookups FROM address_confirm_tokens WHERE email_id = $1', [orders.B.id]))[0].map_lookups)
      .toBe(before + 1);
    const d = (await get(`/api/intake/${orders.B.id}`)).json();
    expect([d.decision, d.email.status]).toEqual(['ALL_CLEAR', 'AWAITING_APPROVAL']);
    const review = (await get('/api/intake/review')).json().orders.find((o: { id: number }) => o.id === orders.B.id);
    expect(review).toMatchObject({ addressSource: 'link', confirmedAddress: ORLANDO, confirmedPin: { lat: 28.537664, lon: -81.37965 },
      mapReading: { of: 'address', found: true, line1: '400 S Orange Ave', city: 'Orlando', state: 'FL', zip: '32801', distanceM: null, differs: [] } });
    expect(review.emailAddress).toMatchObject({ city: 'Orlando', state: 'FL' });
    expect(review.emailAddress.line1).toBeUndefined(); // the email had no street (fixture 34)
    expect((await post(`/api/intake/${orders.B.id}/action`, { action: 'send_to_wms' })).statusCode).toBe(409);
  });

  it('AC-SEC-LINK-11: one audit_log row per confirmation with actor client-link:<email id>; link log lines carry an 8-character hash, never the token', async () => {
    for (const { id } of Object.values(orders)) {
      const rows = await query<{ n: number }>("SELECT count(*)::int AS n FROM audit_log WHERE actor = $1 AND action = 'link_confirmed'", [`client-link:${id}`]);
      expect(rows[0].n).toBe(1);
    }
    const events = logs.map((l) => JSON.parse(l) as Record<string, unknown>).filter((l) => l.msg === 'address link');
    expect(new Set(events.map((e) => e.event))).toEqual(new Set(['link_sent', 'link_opened', 'link_second_confirm', 'link_confirmed']));
    for (const e of events) {
      expect(e.hash).toMatch(/^[0-9a-f]{8}$/);
      expect(typeof e.emailId).toBe('number');
    }
  });

  it('AC-SEC-LINK-01: after send, open and confirm, no table and no log line holds a token; request lines show /api/confirm/[token]; token_hash is its SHA-256', async () => {
    const tables = await query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'");
    expect(tables.length).toBeGreaterThan(10);
    for (const { token, id } of Object.values(orders)) {
      for (const { table_name: t } of tables) {
        const hit = await query<{ n: number }>(`SELECT count(*)::int AS n FROM "${t}" x WHERE x::text LIKE $1`, [`%${token}%`]);
        expect([t, hit[0].n]).toEqual([t, 0]);
      }
      for (const l of logs) expect(l).not.toContain(token);
      expect((await row(id)).token_hash).toBe(hashToken(token));
      const out = await query<{ body: string }>('SELECT body FROM outbound_messages WHERE email_id = $1', [id]);
      expect(out.length).toBeGreaterThan(0);
      for (const o of out) expect(o.body).toContain('[CONFIRM_LINK]');
    }
    expect(logs.some((l) => l.includes('"url":"/api/confirm/[token]"'))).toBe(true);
  });
});

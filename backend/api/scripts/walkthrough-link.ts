// E19 walkthrough (A17): one order through the whole address-link flow on the TEST database, printing each step and
// checking it. The real SQL stores and rules run; Gmail, the map and the carrier pick are local stand-ins, so nothing
// leaves this machine and no `recommendations` rows are written. Every row it adds is removed at the end.
// Usage (from backend/api, Postgres up, test database migrated): npm run walkthrough:link
// The token is never printed in full (SEC-LINK-01): only its first 6 characters.
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';

loadEnv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://latelens:latelens@localhost:5432/latelens_test';
process.env.NODE_ENV = 'test';
process.env.CONFIRM_LINK = 'off'; // the script passes its own link settings below; .env cannot change them

const { pool, query } = await import('../src/core/db/pool.js');
const { applyAction } = await import('../src/modules/intake/actions.js');
const { confirmLink, viewLink } = await import('../src/modules/intake/link.js');
const { hashToken } = await import('../src/modules/intake/linkRules.js');
const { linkRepo, repo } = await import('../src/modules/intake/repo.js');
const { warehouseApi } = await import('../src/modules/warehouse/index.js');
type LinkDeps = import('../src/modules/intake/link.js').LinkDeps;
type Deps = import('../src/modules/intake/pipeline.js').Deps;

const FROM = 'orders@client190.example';   // on the test allow-list (test/setup.ts)
const START = { lat: 28.537664, lon: -81.37965 }; // 400 S Orange Ave, Orlando FL 32801 (fixture 34's confirmed address)
const ADDRESS = { line1: '400 S Orange Ave', line2: null, city: 'Orlando', state: 'FL', zip: '32801' };
const north = (m: number) => ({ lat: START.lat + m / 111_195, lon: START.lon });
const DRAFT = 'Hello,\nWe could not confirm your delivery address. Please confirm it here: [CONFIRM_LINK]\nHalcyon Logistics';

let failures = 0;
let step = 0;
const show = (title: string) => console.log(`\n${++step}. ${title}`);
const check = (ok: boolean, what: string) => { console.log(`   ${ok ? '✓' : '✗'} ${what}`); if (!ok) failures += 1; };
const note = (what: string) => console.log(`   · ${what}`);

const sent: string[] = [];
const gmail = { sendMessage: async (raw: string) => { sent.push(raw); return `walkthrough-${Date.now()}`; } };
const maps = { name: 'walkthrough-map',
  geocode: async () => ({ features: [{ geometry: { type: 'Point', coordinates: [START.lon, START.lat] }, properties: { type: 'Address', confidence: 'Medium' } }] }),
  reverse: async () => ({ features: [{ properties: { type: 'Address', confidence: 'High',
    address: { addressLine: '420 S Orange Ave', locality: 'Orlando', postalCode: '32801', adminDistricts: [{ shortName: 'FL' }] } } }] }) };
const events: string[] = [];
const link: LinkDeps = { enabled: true, hours: 24, timeZone: 'America/New_York', appUrl: 'http://localhost:3000/', links: linkRepo,
  maps: maps as never, credentials: { issue: async (e) => ({ kind: 'sas', token: 'walkthrough-sas', expiresAt: e.toISOString() }) },
  now: () => new Date(), log: (event, fields) => events.push(`${event} ${JSON.stringify(fields)}`) };
const intake: Deps = { llm: null as never, pii: null as never, maps: maps as never, repo, warehouse: warehouseApi, gmail: null,
  carriers: { recommendCarrier: async () => ({ carrier: 'B', backup: 'A', reason: 'walkthrough: fixed pick', blocked: [], options: [] }) } };
const outbox = { gmail: gmail as never, allow: new Set([FROM]) };

let id = 0;
try {
  show('An order email arrives with an address the map could not confirm');
  const client = await repo.clientByDomain('client190.example', FROM);
  check(client !== null, `the sender is a known client (${client?.client_id ?? 'none'})`);
  id = await repo.insertEmail({ source: 'paste', gmail_id: null, thread_id: null, message_id: null, from_addr: FROM,
    subject: '[SYNTHETIC] walkthrough order', body: '[SYNTHETIC] 20 x HX-616 to 400 S Orange Ave, Orlando FL',
    redacted_body: null, pii_map: {}, received_at: '2026-10-30 07:30', in_reply_to: null, hash: `walkthrough-${Date.now()}`,
    client_id: client?.client_id ?? null });
  await repo.saveExtraction({ email_id: id, decision: 'CONFIRM_ADDRESS', reply_draft: DRAFT, reply_source: 'template',
    extraction: { items: [{ sku: 'HX-616', qty: 20 }], requested_commitment: 'next_day', confidence: { items: 1, address: 1 },
      address: { ...ADDRESS, raw: null } } as never,
    checks: { address: { status: 'unverified', address: ADDRESS, missing: [], candidates: [], validation: null }, promise: null,
      warehouse: null, carrier: null } as never });
  await repo.setStatus(id, 'APPROVED');
  note(`email ${id}: decision CONFIRM_ADDRESS; the draft holds [CONFIRM_LINK]; the desk approved the reply`);

  show('The operator sends the reply: a link is minted and put into the email');
  const r1 = await applyAction(repo, id, 'send_reply', 'walkthrough-operator', outbox, { link });
  check(r1.code === 200, `send_reply answers ${r1.code}`);
  const token = /\/confirm\/([A-Za-z0-9_-]{43})/.exec(sent.at(-1) ?? '')?.[1] ?? '';
  check(token.length === 43, `the sent email holds http://localhost:3000/confirm/${token.slice(0, 6)}… (trailing / trimmed)`);
  check(!(sent.at(-1) ?? '').includes('[CONFIRM_LINK]'), 'the sent email holds no placeholder');
  const stored = await query<{ body: string }>('SELECT body FROM outbound_messages WHERE email_id = $1 ORDER BY id DESC LIMIT 1', [id]);
  check(stored[0]?.body.includes('[CONFIRM_LINK]') === true && !stored[0].body.includes(token), 'the stored copy keeps the placeholder, not the link');
  const rows = await query<{ token_hash: string; expires_at: Date }>('SELECT token_hash, expires_at FROM address_confirm_tokens WHERE email_id = $1', [id]);
  check(rows.length === 1 && rows[0].token_hash === hashToken(token), 'one token row, holding only the SHA-256 hash');
  note(`sent ${new Date().toISOString()}; the link expires ${rows[0]?.expires_at.toISOString()}: the earlier of 24 h and 2 h before`
    + ' the 08:00 New York cut-off (the next day\'s when that day\'s is under 3 h away)');
  check((await repo.getEmail(id))?.status === 'SENT', 'the order now waits for the client (SENT)');

  show('The client opens the link');
  const view = await viewLink(link, token);
  check(view !== null, 'the link opens');
  note(`prefilled address: ${[view?.address.line1, view?.address.city, view?.address.state, view?.address.zip].join(', ')}`);
  note(`start pin from the map: ${view?.pin?.lat}, ${view?.pin?.lon}; map credential: ${view?.map.kind}, expiring with the link`);

  show('The client drags the pin 600 m and presses Confirm: the API asks to confirm again');
  const body = (pin: { lat: number; lon: number }, checkId?: string) => ({ address: ADDRESS, pin, ...(checkId ? { checkId } : {}) });
  const c1 = await confirmLink(link, intake, token, body(north(600)));
  check(c1.code === 409, `confirm answers ${c1.code} (needs a second Confirm)`);
  const checkId = c1.code === 409 ? c1.body.checkId : undefined;
  if (c1.code === 409) note(`the map reads the new pin as ${c1.body.reading.line1}, ${c1.body.reading.zip}, ${c1.body.reading.distanceM} m away`);
  check((await repo.getEmail(id))?.status === 'SENT', 'nothing is decided yet; the link is still unused');

  show('The client checks the reading and confirms again');
  const c2 = await confirmLink(link, intake, token, body(north(600), checkId));
  check(c2.code === 200, `confirm answers ${c2.code}`);
  check((await repo.getEmail(id))?.status === 'AWAITING_APPROVAL', 'the order is back in review (AWAITING_APPROVAL)');
  const x = await repo.latestExtraction(id);
  check(x?.decision === 'ALL_CLEAR', `decided again with the confirmed address: ${x?.decision}`);
  note(`warehouse ${(x?.checks as { warehouse?: { warehouseId?: string } })?.warehouse?.warehouseId ?? '-'}, carrier ${(x?.checks as { carrier?: { carrier?: string } })?.carrier?.carrier ?? '-'}`);

  show('The used link no longer opens');
  check((await viewLink(link, token)) === null, 'opening it again finds nothing (404 on the page)');
  check((await confirmLink(link, intake, token, body(north(600), checkId))).code === 404, 'confirming it again is 404');

  show('The desk approves the order: the confirmed address is saved for the client');
  const r2 = await applyAction(repo, id, 'approve', 'walkthrough-supervisor', outbox, { link });
  check(r2.code === 200, `approve answers ${r2.code}`);
  const saved = await query<{ source: string; line1: string; lat: number }>(
    "SELECT source, line1, lat FROM saved_addresses WHERE source = 'link' AND email_id = $1", [id]);
  check(saved.length === 1 && saved[0].line1 === ADDRESS.line1, `saved_addresses has the address with source '${saved[0]?.source}' and its pin`);

  show('What the logs hold');
  check(events.length > 0 && events.every((e) => !e.includes(token)), `${events.length} link events, none holding the token`);
  for (const e of events) note(e);
} catch (err) {
  failures += 1;
  console.error(`\n✗ stopped: ${(err as Error).message}`);
} finally {
  if (id) {
    await query('DELETE FROM address_confirm_tokens WHERE email_id = $1', [id]);
    await query("DELETE FROM saved_addresses WHERE source = 'link' AND email_id = $1", [id]);
    await query('DELETE FROM outbound_messages WHERE email_id = $1', [id]);
    await query("DELETE FROM audit_log WHERE ref = $1 OR actor = $2", [String(id), `client-link:${id}`]);
    await query('DELETE FROM intake_extractions WHERE email_id = $1', [id]);
    await query('DELETE FROM intake_emails WHERE id = $1', [id]);
    note(`removed email ${id} and every row it created`);
  }
  await pool.end();
}
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed: one order went through the whole link flow.');
process.exit(failures ? 1 : 0);

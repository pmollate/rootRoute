// E19 one-time address link (SPEC §5.17; owner A, built by C with A's agreement, Q-LINK-01). Mint at send_reply, open
// (never uses the link), confirm (with a second Confirm when the pin moved), decide again with code, save on approval.
// No AI model is used anywhere here. The token is never stored, logged or kept in outbound_messages (SEC-LINK-01).
import { randomUUID } from 'node:crypto';
import type { CarrierRecommendation, PromiseResult, WarehouseChoice } from '../../core/contracts.js';
import type { AddressValidator, GeocodeResponse } from '../../core/maps/types.js';
import type { AddressCheck } from './address.js';
import { decide } from './decide.js';
import { ConfirmBody, type ConfirmInput, distanceM, hashPrefix, hashToken, LINK_PLACEHOLDER, linkExpiry, MAX_MAP_LOOKUPS,
  needsSecondConfirm, newToken, TOKEN_SHAPE } from './linkRules.js';
import { senderAddress } from './mailbox.js';
import type { Deps } from './pipeline.js';
import { regionOfState } from './region.js';
import { replyFactsOf, templateReply } from './reply.js';
import type { EmailRow, ExtractionRow } from './repo.js';

export { LINK_PLACEHOLDER } from './linkRules.js';
/** The one answer for every invalid link, byte-identical whatever the reason (REQ-LINK-07). */
export const INVALID = { error: 'link_invalid' } as const;

export interface LinkAddress { line1: string; line2: string | null; city: string; state: string; zip: string }
export interface LinkPin { lat: number; lon: number }
export interface MapReading { line1: string | null; city: string | null; state: string | null; zip: string | null; distanceM: number }
export type LinkState = 'sent' | 'confirmed' | 'expired' | 'revoked';
/** SEC-LINK-08: the map tile credential is an Azure Maps SAS token only, expiring no later than the link. */
export interface MapCredential { kind: 'sas'; token: string; expiresAt: string }
export interface LinkView { address: Partial<LinkAddress>; pin: LinkPin | null; expiresAt: string; synthetic: boolean; map: MapCredential }

/** The reading shown at a second Confirm, with what it was read for; the client's next Confirm must match it. */
export interface PendingCheck { checkId: string; pin: LinkPin; zip: string; reading: MapReading }
export interface LinkRow {
  id: number; token_hash: string; email_id: number; issued_at: Date; expires_at: Date; issued_by: string;
  used_at: Date | null; revoked_at: Date | null;
  prefill: { address: Partial<LinkAddress>; pin: LinkPin | null };
  confirmed_address: LinkAddress | null; lat: number | null; lon: number | null;
  map_reading: (PendingCheck | MapReading) | null; map_lookups: number; synthetic: boolean;
}
export type NewLink = Pick<LinkRow, 'token_hash' | 'email_id' | 'issued_at' | 'expires_at' | 'issued_by' | 'prefill' | 'synthetic'>;

/** Migration 103's tables (A). Implemented in repo.ts (`linkRepo`) and test/intake/memoryLinks.ts. */
export interface LinkRepo {
  /** Every email of the order: the first email and every client answer below it (REQ-LINK-08). */
  orderEmailIds(emailId: number): Promise<number[]>;
  revokeUnused(emailIds: number[], at: Date): Promise<number>;
  insert(l: NewLink): Promise<number>;
  byHash(hash: string): Promise<LinkRow | null>;
  /** +1 map look-up; returns the new count (SEC-LINK-04). */
  countLookup(id: number): Promise<number>;
  setReading(id: number, reading: PendingCheck | MapReading): Promise<void>;
  /** Single use: sets used_at only if the link is still live at `at`; false if another request got there first. */
  markUsed(id: number, address: LinkAddress, pin: LinkPin, reading: MapReading | null, at: Date): Promise<boolean>;
  /** The newest link of each email (for GET /api/intake and the review). */
  newestFor(emailIds: number[]): Promise<Map<number, LinkRow>>;
  saveAddress(a: { clientId: string; address: LinkAddress; pin: LinkPin; emailId: number; confirmedAt: Date; synthetic: boolean }): Promise<void>;
}

/**
 * Issues the map tile credential for a valid link (SEC-LINK-08). The real issuer (Azure Resource Manager `listSas` with
 * the API's managed identity) is A18/A20; tests inject a stub. Never stored or logged.
 */
export interface MapCredentials { issue(expiresAt: Date): Promise<MapCredential> }

export interface LinkDeps {
  enabled: boolean;      // CONFIRM_LINK=on (REQ-LINK-09)
  hours: number;         // CONFIRM_LINK_HOURS (24)
  timeZone: string;      // MAILBOX_TIMEZONE ([HALCYON_TIMEZONE], Q-LINK-03)
  appUrl: string;        // AUTH_URL: https://<host>; the link is <appUrl>/confirm/<token> (a trailing / is trimmed)
  links: LinkRepo;
  maps: AddressValidator;
  credentials: MapCredentials;
  now: () => Date;
  log: (event: string, fields: Record<string, unknown>) => void; // SEC-LINK-11: email id + hash prefix, never the token
}

export function linkState(l: LinkRow, now: Date): LinkState {
  if (l.used_at) return 'confirmed';
  if (l.revoked_at) return 'revoked';
  return l.expires_at <= now ? 'expired' : 'sent';
}
const live = (l: LinkRow | null, now: Date): l is LinkRow => l !== null && linkState(l, now) === 'sent';
const fieldsOf = (l: Pick<LinkRow, 'email_id' | 'token_hash'>) => ({ emailId: l.email_id, hash: hashPrefix(l.token_hash) });

const pinOf = (g: GeocodeResponse): LinkPin | null => {
  const c = g.features[0]?.geometry?.coordinates;
  return c ? { lat: c[1], lon: c[0] } : null;
};

/** What the email gave, part by part (the grounded, checked address; SEC-LINK-03: nothing else about the order). */
function prefillAddress(x: ExtractionRow | null): Partial<LinkAddress> {
  const checked = x?.checks.address?.address;
  const raw = x?.extraction?.address;
  const out: Partial<LinkAddress> = {};
  for (const k of ['line1', 'line2', 'city', 'state', 'zip'] as const) {
    const v = (checked?.[k] ?? raw?.[k]) || undefined;
    if (v) out[k] = v;
  }
  return out;
}

/**
 * REQ-LINK-01, -08, SEC-LINK-09: called by send_reply only, after the allow-list and Gmail checks passed. Revokes every
 * earlier unused link of the order, stores the hash and returns the text to send (placeholder replaced by the link).
 */
export async function mintLink(d: LinkDeps, email: EmailRow, x: ExtractionRow | null, actor: string, text: string): Promise<string> {
  const now = d.now();
  const address = prefillAddress(x);
  let pin: LinkPin | null = null;
  if (address.line1 && address.city && address.state && address.zip) {
    try {
      pin = pinOf(await d.maps.geocode({ line1: address.line1, city: address.city, state: address.state, zip: address.zip }));
    } catch {
      pin = null; // no start pin: the client's Confirm then always gets the map's reading first (REQ-LINK-03)
    }
  }
  const token = newToken();
  const hash = hashToken(token);
  await d.links.revokeUnused(await d.links.orderEmailIds(email.id), now);
  // Every intake email and client in this build is synthetic (SD-02, SD-04, SD-08); a real mailbox sets this per client.
  await d.links.insert({ token_hash: hash, email_id: email.id, issued_at: now, expires_at: linkExpiry(email.received_at, now, d.hours, d.timeZone),
    issued_by: actor, prefill: { address, pin }, synthetic: true });
  d.log('link_sent', fieldsOf({ email_id: email.id, token_hash: hash }));
  return text.replaceAll(LINK_PLACEHOLDER, `${d.appUrl.replace(/\/+$/, '')}/confirm/${token}`);
}

async function find(d: LinkDeps, token: string): Promise<LinkRow | null> {
  if (!d.enabled || !TOKEN_SHAPE.test(token)) return null;
  const l = await d.links.byHash(hashToken(token));
  return live(l, d.now()) ? l : null;
}

/** GET /api/confirm/:token. Never uses up or changes the link (SEC-LINK-06). Null = the one invalid answer. */
export async function viewLink(d: LinkDeps, token: string): Promise<LinkView | null> {
  const l = await find(d, token);
  if (!l) return null;
  d.log('link_opened', fieldsOf(l));
  return { address: l.prefill.address, pin: l.prefill.pin, expiresAt: l.expires_at.toISOString(), synthetic: l.synthetic,
    map: await d.credentials.issue(l.expires_at) };
}

export type ConfirmResult =
  | { code: 200; body: { status: 'confirmed' } }
  | { code: 409; body: { error: 'needs_second_confirm'; reading: MapReading; checkId: string } }
  | { code: 400; body: { error: 'invalid' } }
  | { code: 404; body: typeof INVALID }
  | { code: 429; body: { error: 'rate_limited' } };

function reading(g: GeocodeResponse, from: LinkPin | null, pin: LinkPin): MapReading {
  const a = g.features[0]?.properties.address ?? {};
  return { line1: a.addressLine ?? null, city: a.locality ?? null, state: a.adminDistricts?.[0]?.shortName ?? null,
    zip: a.postalCode?.slice(0, 5) ?? null, distanceM: from ? Math.round(distanceM(from, pin)) : 0 };
}
const samePin = (a: LinkPin, b: LinkPin) => distanceM(a, b) < 1;
const isPending = (r: LinkRow['map_reading']): r is PendingCheck => r !== null && 'checkId' in r;

/** POST /api/confirm/:token (REQ-LINK-03, -04, SEC-LINK-02, -04, -10). */
export async function confirmLink(d: LinkDeps, intake: Deps, token: string, body: unknown): Promise<ConfirmResult> {
  const l = await find(d, token);
  if (!l) return { code: 404, body: INVALID };
  const parsed = ConfirmBody.safeParse(body);
  if (!parsed.success) {
    d.log('link_refused', { ...fieldsOf(l), why: 'invalid' });
    return { code: 400, body: { error: 'invalid' } };
  }
  const input: ConfirmInput = parsed.data;
  let seen: MapReading | null = null;
  // The API measures the distance itself (REQ-LINK-03); a checkId only counts for the pin and ZIP it was issued for.
  if (needsSecondConfirm({ pin: l.prefill.pin, zip: l.prefill.address.zip ?? null }, input)) {
    const pending = isPending(l.map_reading) ? l.map_reading : null;
    if (pending && input.checkId === pending.checkId && samePin(pending.pin, input.pin) && pending.zip === input.address.zip) {
      seen = pending.reading; // the client saw this reading and confirmed again
    } else {
      if ((await d.links.countLookup(l.id)) > MAX_MAP_LOOKUPS) {
        d.log('link_refused', { ...fieldsOf(l), why: 'map_lookups' });
        return { code: 429, body: { error: 'rate_limited' } };
      }
      if (!d.maps.reverse) throw new Error(`the map provider ${d.maps.name} cannot reverse-geocode`);
      const r = reading(await d.maps.reverse(input.pin), l.prefill.pin, input.pin);
      const checkId = randomUUID();
      await d.links.setReading(l.id, { checkId, pin: input.pin, zip: input.address.zip, reading: r });
      d.log('link_second_confirm', { ...fieldsOf(l), distanceM: r.distanceM });
      return { code: 409, body: { error: 'needs_second_confirm', reading: r, checkId } };
    }
  }
  if (!(await d.links.markUsed(l.id, input.address, input.pin, seen, d.now()))) return { code: 404, body: INVALID };
  await decideAgain(intake, l.email_id, input.address);
  await intake.repo.logAudit(`client-link:${l.email_id}`, 'link_confirmed', `email:${l.email_id}`, { hash: hashPrefix(l.token_hash) });
  d.log('link_confirmed', fieldsOf(l));
  return { code: 200, body: { status: 'confirmed' } };
}

/**
 * REQ-LINK-04: §5.3 steps 8–10 with code only. The confirmed address counts as verified (REQ-INT-09). The promise uses
 * the email's arrival time, as every intake promise does (REQ-INT-03; Q-LINK-04). The reply is the fixed template.
 */
export async function decideAgain(intake: Deps, emailId: number, address: LinkAddress): Promise<void> {
  const { repo, warehouse, carriers } = intake;
  const email = (await repo.getEmail(emailId))!;
  const x = await repo.latestExtraction(emailId);
  const check: AddressCheck = { status: 'confirmed', address, missing: [], candidates: [], validation: null };
  const extraction = x?.extraction ? { ...x.extraction, address: { ...address, raw: x.extraction.address.raw } } : null;
  const decision = decide(email.client_id, extraction, check);
  const promise: PromiseResult | null = extraction
    ? warehouse.checkPromise(extraction.requested_commitment ?? 'standard', email.received_at) : null;
  const from = senderAddress(email.from_addr);
  const client = await repo.clientByDomain(from.split('@')[1] ?? '', from);
  let warehouseChoice: WarehouseChoice | null = null;
  let carrier: CarrierRecommendation | null = null;
  const region = regionOfState(address.state);
  if (decision === 'ALL_CLEAR' && email.client_id && region && promise) {
    const nearest = await warehouse.nearestWarehouse(email.client_id, region);
    warehouseChoice = await warehouse.pickWarehouse({ destinationRegion: region, nearestWarehouseId: nearest, stock: {} });
    carrier = await carriers.recommendCarrier({ region, commitment: promise.commitment, slaClause: client?.sla_penalty_clause === 'Y' });
  }
  const facts = replyFactsOf({ decision, clientName: client?.client_name ?? null, piiMap: email.pii_map ?? {}, extraction,
    address: check, promise });
  await repo.saveExtraction({ email_id: emailId, extraction, decision, checks: { address: check, promise, warehouse: warehouseChoice, carrier },
    reply_draft: templateReply(facts), reply_source: 'template' });
  await repo.setStatus(emailId, 'AWAITING_APPROVAL');
}

/** REQ-LINK-05: on approval only, the confirmed address joins the client's saved addresses (source 'link'). */
export async function saveOnApproval(d: LinkDeps, email: EmailRow, x: ExtractionRow | null): Promise<boolean> {
  if (!d.enabled || x?.checks.address?.status !== 'confirmed' || !email.client_id) return false;
  const l = (await d.links.newestFor([email.id])).get(email.id);
  if (!l?.used_at || !l.confirmed_address || l.lat === null || l.lon === null) return false;
  await d.links.saveAddress({ clientId: email.client_id, address: l.confirmed_address, pin: { lat: l.lat, lon: l.lon },
    emailId: email.id, confirmedAt: l.used_at, synthetic: l.synthetic });
  return true;
}

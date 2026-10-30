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
/** `map` is null when no tile credential could be issued: the page then shows the address fields without a map. */
export interface LinkView { address: Partial<LinkAddress>; pin: LinkPin | null; expiresAt: string; synthetic: boolean; map: MapCredential | null }

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
  /** Revokes the unused links of these emails, except `keepId` (the link just sent). */
  revokeUnused(emailIds: number[], at: Date, keepId?: number): Promise<number>;
  /** Revokes one link (a link nobody received). */
  revoke(id: number, at: Date): Promise<void>;
  insert(l: NewLink): Promise<number>;
  byHash(hash: string): Promise<LinkRow | null>;
  /** +1 map look-up; returns the new count (SEC-LINK-04). */
  countLookup(id: number): Promise<number>;
  setReading(id: number, reading: PendingCheck | MapReading): Promise<void>;
  /**
   * REQ-LINK-04, SEC-LINK-02: in one transaction, uses the link (only if still live at `at`), moves its email from SENT
   * to AWAITING_APPROVAL, writes the new extraction and the audit row. False, with nothing written, if the link is no
   * longer live or the email is no longer SENT (another request got there first); a failed write rolls everything back.
   */
  confirm(c: ConfirmWrite): Promise<boolean>;
  /** The newest link of each email (for GET /api/intake and the review). */
  newestFor(emailIds: number[]): Promise<Map<number, LinkRow>>;
  /** Adds a source='link' saved address; false (nothing added) if the client already has the same address (REQ-LINK-05). */
  saveAddress(a: { clientId: string; address: LinkAddress; pin: LinkPin; emailId: number; confirmedAt: Date; synthetic: boolean }): Promise<boolean>;
}

export interface ConfirmWrite {
  linkId: number; emailId: number; address: LinkAddress; pin: LinkPin; reading: MapReading | null; at: Date;
  extraction: Omit<ExtractionRow, 'id'>;
  audit: { actor: string; action: string; payload: object };
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
 * REQ-LINK-01, SEC-LINK-09: called by send_reply only, after the allow-list and Gmail checks passed. Stores the hash and
 * returns the text to send (placeholder replaced by the link) and the new link's id. Earlier links of the order are
 * revoked by `settleLink` only once Gmail has accepted the reply, so a failed send leaves the client's link working.
 */
export async function mintLink(d: LinkDeps, email: EmailRow, x: ExtractionRow | null, actor: string, text: string): Promise<{ text: string; linkId: number }> {
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
  // Every intake email and client in this build is synthetic (SD-02, SD-04, SD-08); a real mailbox sets this per client.
  const linkId = await d.links.insert({ token_hash: hash, email_id: email.id, issued_at: now,
    expires_at: linkExpiry(email.received_at, now, d.hours, d.timeZone), issued_by: actor, prefill: { address, pin }, synthetic: true });
  d.log('link_sent', fieldsOf({ email_id: email.id, token_hash: hash }));
  const url = `${d.appUrl.replace(/\/+$/, '')}/confirm/${token}`;
  return { text: text.replaceAll(LINK_PLACEHOLDER, () => url), linkId }; // a function: no $-patterns in the URL
}

/** REQ-LINK-08: after Gmail accepted the reply, every other unused link of the order (any email of its thread) is revoked. */
export async function settleLink(d: LinkDeps, emailId: number, linkId: number): Promise<void> {
  await d.links.revokeUnused(await d.links.orderEmailIds(emailId), d.now(), linkId);
}

/**
 * A live link whose order has had no newer email. When the client has written again in the thread, that newer email
 * is the order (it is decided by the pipeline), so the link no longer works (REQ-LINK-08 default, A17 review 1).
 */
async function find(d: LinkDeps, token: string): Promise<LinkRow | null> {
  if (!d.enabled || !TOKEN_SHAPE.test(token)) return null;
  const l = await d.links.byHash(hashToken(token));
  if (!live(l, d.now())) return null;
  return (await d.links.orderEmailIds(l.email_id)).some((id) => id > l.email_id) ? null : l;
}

/** GET /api/confirm/:token. Never uses up or changes the link (SEC-LINK-06). Null = the one invalid answer. */
export async function viewLink(d: LinkDeps, token: string): Promise<LinkView | null> {
  const l = await find(d, token);
  if (!l) return null;
  d.log('link_opened', fieldsOf(l));
  let map: MapCredential | null = null;
  try {
    map = await d.credentials.issue(l.expires_at);
  } catch {
    d.log('link_map_unavailable', fieldsOf(l)); // the address still works without the map; the issuer's error is not logged here
  }
  return { address: l.prefill.address, pin: l.prefill.pin, expiresAt: l.expires_at.toISOString(), synthetic: l.synthetic, map };
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
  // Only an order waiting for the client (its reply SENT) is decided again; a closed or re-opened order is not (A17 review 5).
  if ((await intake.repo.getEmail(l.email_id))?.status !== 'SENT') return { code: 404, body: INVALID };
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
  // Decide first (reads and other areas' calls only), then write everything in one transaction: a failure on the way
  // leaves the link unused and the order as it was, so the client can try again (A17 review 2).
  const extraction = await decideAgain(intake, l.email_id, input.address);
  const done = await d.links.confirm({ linkId: l.id, emailId: l.email_id, address: input.address, pin: input.pin, reading: seen,
    at: d.now(), extraction, audit: { actor: `client-link:${l.email_id}`, action: 'link_confirmed', payload: { hash: hashPrefix(l.token_hash) } } });
  if (!done) return { code: 404, body: INVALID };
  d.log('link_confirmed', fieldsOf(l));
  return { code: 200, body: { status: 'confirmed' } };
}

/**
 * REQ-LINK-04: §5.3 steps 8–10 with code only. The confirmed address counts as verified (REQ-INT-09). The promise uses
 * the email's arrival time, as every intake promise does (REQ-INT-03; Q-LINK-04). The reply is the fixed template.
 * Writes nothing: returns the new extraction row, which `LinkRepo.confirm` stores with the link's use.
 */
export async function decideAgain(intake: Deps, emailId: number, address: LinkAddress): Promise<Omit<ExtractionRow, 'id'>> {
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
  return { email_id: emailId, extraction, decision, checks: { address: check, promise, warehouse: warehouseChoice, carrier },
    reply_draft: templateReply(facts), reply_source: 'template' };
}

/**
 * REQ-LINK-05: on approval only, the confirmed address joins the client's saved addresses (source 'link'). Called before
 * the order is marked APPROVED, so a failed save leaves the order unapproved. 'saved', 'already_saved' (the client has
 * that address) or null (not a link-confirmed order).
 */
export async function saveOnApproval(d: LinkDeps, email: EmailRow, x: ExtractionRow | null): Promise<'saved' | 'already_saved' | null> {
  if (!d.enabled || x?.checks.address?.status !== 'confirmed' || !email.client_id) return null;
  const l = (await d.links.newestFor([email.id])).get(email.id);
  if (!l?.used_at || !l.confirmed_address || l.lat === null || l.lon === null) return null;
  return (await d.links.saveAddress({ clientId: email.client_id, address: l.confirmed_address, pin: { lat: l.lat, lon: l.lon },
    emailId: email.id, confirmedAt: l.used_at, synthetic: l.synthetic })) ? 'saved' : 'already_saved';
}

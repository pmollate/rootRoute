import type { CarrierId, CarrierOption, CarrierRecommendation, PromiseResult, Region, WarehouseChoice } from '../../core/contracts.js';
import type { LinkAddress, LinkPin, LinkRepo, LinkRow, MapReading } from './link.js';
import { regionOfState } from './region.js';
import type { Repo } from './repo.js';

export interface CarrierChoice {
  carrier: CarrierId;
  status: Exclude<CarrierOption['status'], 'blocked'>;
  onTime: number | null; // lane on-time share from lane_scores (C); null when the lane gave no options
  meanRate: number | null; // mean freight per shipment on the lane (USD), for "cost vs recommended"
  reason: string;
}

/** A carrier blocked on the order's lane, with its lane on-time share, shown but never offered (REQ-INT-15). */
export interface BlockedCarrier { carrier: CarrierId; onTime: number | null }

export interface ReviewOrder {
  id: number; from: string; clientId: string | null; clientName: string | null; tier: string | null; priority: boolean;
  receivedAt: string; items: { sku: string; qty: number }[]; region: Region | null; promiseDate: string | null;
  warehouseId: string | null; carrier: CarrierId; carrierReason: string; choices: CarrierChoice[]; blocked: CarrierId[];
  // The checks behind the decision, as stored with the extraction, for the review card (E18).
  commitment: PromiseResult['commitment'] | null; promiseReason: string | null; warehouseReason: string | null;
  warnClient: boolean; addressStatus: string | null; blockedLanes: BlockedCarrier[];
  // REQ-LINK-11 (E19): where the address came from. 'link': confirmed by the client through a one-time link ("Address
  // confirmed by client link"), shown with the address the email gave, the confirmed one, the stored pin (null: "no map
  // point") and the map's reading (`of` picks "Map reads the pin as …" or "Map reads the address as …"). Only with
  // CONFIRM_LINK on.
  addressSource?: 'link' | 'saved' | 'email';
  emailAddress?: Partial<LinkAddress>; confirmedAddress?: LinkAddress | null; confirmedPin?: LinkPin | null; mapReading?: MapReading | null;
}

/** The stored reading the client confirmed; a pending check is not one. A reading stored before v0.18 was of the pin. */
function confirmedReading(r: LinkRow['map_reading']): MapReading | null {
  if (!r || 'checkId' in r) return null;
  const old = r as Partial<MapReading>;
  return { of: old.of ?? 'pin', found: old.found ?? true, line1: r.line1, city: r.city, state: r.state, zip: r.zip,
    distanceM: r.distanceM ?? null, differs: old.differs ?? [] };
}

/** REQ-INT-15: the carriers a supervisor may pick on the order's lane. A blocked carrier is never offered. */
export function carrierChoices(rec: CarrierRecommendation): CarrierChoice[] {
  const open = rec.options
    .filter((o) => o.status !== 'blocked' && !rec.blocked.includes(o.carrier))
    .map((o) => ({ carrier: o.carrier, status: o.status as CarrierChoice['status'], onTime: o.onTime, meanRate: o.meanRate, reason: o.reason }));
  return open.length ? open : [{ carrier: rec.carrier, status: 'recommended', onTime: null, meanRate: null, reason: rec.reason }];
}

/**
 * REQ-INT-14: ALL_CLEAR orders awaiting approval, in inbox order (priority clients first), with their carrier choices.
 * `links` (E19, CONFIRM_LINK on): a link-confirmed order also carries its link's addresses and reading (REQ-LINK-11).
 */
export async function reviewQueue(repo: Repo, links?: LinkRepo): Promise<ReviewOrder[]> {
  const out: ReviewOrder[] = [];
  for (const e of await repo.listEmails()) {
    if (e.status !== 'AWAITING_APPROVAL') continue;
    const x = await repo.latestExtraction(e.id);
    const rec = (x?.checks.carrier ?? null) as CarrierRecommendation | null;
    if (!x || x.decision !== 'ALL_CLEAR' || !rec) continue;
    const promise = x.checks.promise as PromiseResult | null;
    const warehouse = x.checks.warehouse as WarehouseChoice | null;
    const state = x.checks.address?.address?.state;
    const status = x.checks.address?.status;
    const addressSource = status === 'confirmed' ? 'link' : status === 'matched' ? 'saved' : 'email';
    const l = addressSource === 'link' && links ? (await links.newestFor([e.id])).get(e.id) : undefined;
    out.push({
      id: e.id, from: e.from_addr, clientId: e.client_id, clientName: e.client_name, tier: e.account_tier, priority: e.priority,
      receivedAt: e.received_at, items: x.extraction?.items ?? [], region: state ? regionOfState(state) : null,
      promiseDate: promise?.promiseDate ?? null, warehouseId: warehouse?.warehouseId ?? null,
      carrier: rec.carrier, carrierReason: rec.reason, choices: carrierChoices(rec), blocked: rec.blocked,
      commitment: promise?.commitment ?? null, promiseReason: promise?.reason ?? null, warehouseReason: warehouse?.reason ?? null,
      warnClient: warehouse?.warnClient ?? false, addressStatus: x.checks.address?.status ?? null,
      blockedLanes: rec.blocked.map((c) => ({ carrier: c, onTime: rec.options.find((o) => o.carrier === c)?.onTime ?? null })),
      addressSource,
      ...(l ? { emailAddress: l.prefill.address, confirmedAddress: l.confirmed_address,
        confirmedPin: l.lat !== null && l.lon !== null ? { lat: l.lat, lon: l.lon } : null, mapReading: confirmedReading(l.map_reading) } : {}),
    });
  }
  return out;
}

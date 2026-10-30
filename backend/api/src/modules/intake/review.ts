import type { CarrierId, CarrierOption, CarrierRecommendation, PromiseResult, Region, WarehouseChoice } from '../../core/contracts.js';
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
}

/** REQ-INT-15: the carriers a supervisor may pick on the order's lane. A blocked carrier is never offered. */
export function carrierChoices(rec: CarrierRecommendation): CarrierChoice[] {
  const open = rec.options
    .filter((o) => o.status !== 'blocked' && !rec.blocked.includes(o.carrier))
    .map((o) => ({ carrier: o.carrier, status: o.status as CarrierChoice['status'], onTime: o.onTime, meanRate: o.meanRate, reason: o.reason }));
  return open.length ? open : [{ carrier: rec.carrier, status: 'recommended', onTime: null, meanRate: null, reason: rec.reason }];
}

/** REQ-INT-14: ALL_CLEAR orders awaiting approval, in inbox order (priority clients first), with their carrier choices. */
export async function reviewQueue(repo: Repo): Promise<ReviewOrder[]> {
  const out: ReviewOrder[] = [];
  for (const e of await repo.listEmails()) {
    if (e.status !== 'AWAITING_APPROVAL') continue;
    const x = await repo.latestExtraction(e.id);
    const rec = (x?.checks.carrier ?? null) as CarrierRecommendation | null;
    if (!x || x.decision !== 'ALL_CLEAR' || !rec) continue;
    const promise = x.checks.promise as PromiseResult | null;
    const warehouse = x.checks.warehouse as WarehouseChoice | null;
    const state = x.checks.address?.address?.state;
    out.push({
      id: e.id, from: e.from_addr, clientId: e.client_id, clientName: e.client_name, tier: e.account_tier, priority: e.priority,
      receivedAt: e.received_at, items: x.extraction?.items ?? [], region: state ? regionOfState(state) : null,
      promiseDate: promise?.promiseDate ?? null, warehouseId: warehouse?.warehouseId ?? null,
      carrier: rec.carrier, carrierReason: rec.reason, choices: carrierChoices(rec), blocked: rec.blocked,
      commitment: promise?.commitment ?? null, promiseReason: promise?.reason ?? null, warehouseReason: warehouse?.reason ?? null,
      warnClient: warehouse?.warnClient ?? false, addressStatus: x.checks.address?.status ?? null,
      blockedLanes: rec.blocked.map((c) => ({ carrier: c, onTime: rec.options.find((o) => o.carrier === c)?.onTime ?? null })),
    });
  }
  return out;
}

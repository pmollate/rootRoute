// Public entry point of the Carriers area (CONTRACTS §2). Other areas import only this file.
import type { CarriersApi } from '../../core/contracts.js';
import { isFriday, recommendFromLane } from './domain.js';
import { capacityLimits, insertOrderEvent, insertOverride, laneRows, logRecommendation, orderEventRows, usedToday } from './queries.js';
import { checkEvent, type EventCheck, localNow, type OrderEvent } from './orderEvents.js';
import { autoAdvancePlan } from './autoAdvance.js';

export type { OrderEvent };

export const carriersApi: CarriersApi = {
  async recommendCarrier({ region, commitment, slaClause, date }) {
    const day = date ?? new Date().toISOString().slice(0, 10);
    const limits = await capacityLimits(region, isFriday(day));
    const rec = recommendFromLane(await laneRows(region, commitment), slaClause, await usedToday(region, day), limits);
    await logRecommendation({ orderRef: null, region, commitment, carrier: rec.carrier, backup: rec.backup, reason: rec.reason, date: day });
    return rec;
  },
};

/** REQ-CAR-06: the one writer of override_log, for other areas (the order review, E18). Same function as POST /api/overrides. */
export const logOverride = insertOverride;

/**
 * Design §7: the one writer of order_events, for the events API (the simulated WMS and carriers) and for intake's
 * send_to_wms (`wms_entered`). The order and repeat rules live here, so both callers get them.
 */
export async function recordOrderEvent(o: { orderRef: string; event: OrderEvent; ts?: string; detail?: Record<string, unknown>;
  visibleAt?: Date }): Promise<EventCheck & { ts: string }> {
  const ts = o.ts ?? localNow();
  const check = checkEvent(await orderEventRows([o.orderRef]), o.event, ts);
  if (check.code !== 201) return { ...check, ts };
  if (await insertOrderEvent(o.orderRef, { event: o.event, ts, detail: o.detail ?? {} }, o.visibleAt)) return { code: 201, ts };
  // Another request wrote it between the read and the insert: answer as if this one came second.
  return { ...checkEvent(await orderEventRows([o.orderRef]), o.event, ts), ts };
}

/**
 * Auto-advance (design 2026-10-30-order-journey-auto-advance §5–§7): records steps 9–13 for an approved order through
 * recordOrderEvent, each shown STEP_SECONDS after the one before. "already recorded" counts as done.
 */
export async function autoAdvanceOrder(o: { orderRef: string; receivedAt: string; promiseDate: string; wmsOrderId: string },
  now = new Date()): Promise<{ ok: boolean; error?: string }> {
  // A failure part-way leaves the earlier steps recorded; the order stays APPROVED and a later manual send treats them as already recorded.
  for (const e of autoAdvancePlan({ ...o, approvedAt: localNow(now) })) {
    const r = await recordOrderEvent({ orderRef: o.orderRef, event: e.event, ts: e.ts, detail: e.detail,
      visibleAt: new Date(now.getTime() + e.showAfterSec * 1000) });
    if (r.code !== 201 && r.code !== 200 && r.error !== 'already recorded') {
      return { ok: false, error: `${e.event}: ${r.error ?? r.code}` };
    }
  }
  return { ok: true };
}

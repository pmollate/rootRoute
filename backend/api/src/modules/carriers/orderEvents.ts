// Order journey events for new orders (D9, design §6): the order and repeat rules of the simulated WMS and carrier feed.
// Pure: queries.ts reads and writes order_events, index.ts joins the two in recordOrderEvent.
export const ORDER_EVENTS = ['wms_entered', 'picked', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered'] as const;
export type OrderEvent = (typeof ORDER_EVENTS)[number];
/** The events the simulator may post. `wms_entered` is written only by send_to_wms. */
export const FEED_EVENTS = ['picked', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered'] as const;

export interface OrderEventRow { event: OrderEvent; ts: string; detail: Record<string, unknown> }
export interface EventCheck { code: 200 | 201 | 409; error?: string }

/** The API's timestamp format: local, no time zone. */
export const TS = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;

export function localNow(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Each event needs the one before it and is never earlier than it; a repeat with the same ts changes nothing (a retry),
 * a repeat with another ts is refused. `YYYY-MM-DD HH:mm` strings compare in time order.
 */
export function checkEvent(existing: OrderEventRow[], event: OrderEvent, ts: string): EventCheck {
  const same = existing.find((e) => e.event === event);
  if (same) return same.ts === ts ? { code: 200 } : { code: 409, error: 'already recorded' };
  const i = ORDER_EVENTS.indexOf(event);
  if (i === 0) return { code: 201 };
  if (!existing.some((e) => e.event === 'wms_entered')) return { code: 409, error: 'order is not in the WMS' };
  const prev = existing.find((e) => e.event === ORDER_EVENTS[i - 1]);
  if (!prev) return { code: 409, error: `${event} needs ${ORDER_EVENTS[i - 1]} first` };
  if (ts < prev.ts) return { code: 409, error: `ts before ${prev.event}` };
  return { code: 201 };
}

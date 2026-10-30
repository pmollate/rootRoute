// Auto-advance (design docs/superpowers/specs/2026-10-30-order-journey-auto-advance-design.md §6): the synthetic steps 9–13
// an approved order gets when the admin switch is on. Pure: index.ts records them.
import { addDays, CUTOFF_HOUR } from '../warehouse/domain.js';
import type { OrderEvent } from './orderEvents.js';

/** Seconds between one auto-advanced step showing in the journey and the next. */
export const STEP_SECONDS = 5;

export interface AutoAdvanceInput { receivedAt: string; promiseDate: string; approvedAt: string; wmsOrderId: string }
export interface PlannedEvent { event: OrderEvent; ts: string; detail: Record<string, unknown>; showAfterSec: number }

const plusHour = (ts: string) =>
  new Date(Date.parse(`${ts.replace(' ', 'T')}:00Z`) + 3_600_000).toISOString().slice(0, 16).replace('T', ' ');
/** Never earlier than the step before. `YYYY-MM-DD HH:mm` strings compare in time order. */
const notBefore = (ts: string, floor: string) => (ts < floor ? floor : ts);

/**
 * Picked on the pick-list day at 10:00 (the received day, or the next one from the 08:00 cut-off), collected at 15:00,
 * in transit at 16:00, out for delivery on the promise date at 08:00, delivered there at 12:00. A step that would come
 * before the one before it moves up to it; delivery is at least an hour after it goes out, and the journey then shows it
 * late when that passes the promise date.
 */
export function autoAdvancePlan({ receivedAt, promiseDate, approvedAt, wmsOrderId }: AutoAdvanceInput): PlannedEvent[] {
  const received = receivedAt.slice(0, 10);
  const pickDay = Number(receivedAt.slice(11, 13)) >= CUTOFF_HOUR ? addDays(received, 1) : received;
  const picked = notBefore(`${pickDay} 10:00`, approvedAt);
  const day = picked.slice(0, 10);
  const pickedUp = notBefore(`${day} 15:00`, picked);
  const inTransit = notBefore(`${day} 16:00`, pickedUp);
  const out = notBefore(`${promiseDate} 08:00`, inTransit);
  const delivered = notBefore(`${promiseDate} 12:00`, plusHour(out));
  const steps: [OrderEvent, string][] = [['wms_entered', approvedAt], ['picked', picked], ['picked_up', pickedUp],
    ['in_transit', inTransit], ['out_for_delivery', out], ['delivered', delivered]];
  return steps.map(([event, ts], i) => ({ event, ts, showAfterSec: i * STEP_SECONDS,
    detail: event === 'wms_entered' ? { wmsOrderId, auto: true } : { auto: true } }));
}

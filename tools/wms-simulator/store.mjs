// Simulated Halcyon WMS and carriers (design docs/superpowers/specs/2026-10-30-order-journey-simulator-design.md §9).
// Pure: the orders it holds, the next step of each, and the timestamp a step is reported with. Synthetic data only.
export const STEPS = ['picked', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered'];
const TS = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;

export function wmsOrderId(orderRef) {
  const id = /^email:(\d+)$/.exec(orderRef ?? '')?.[1];
  return id ? `WMS-${id.padStart(6, '0')}` : null;
}

export function localNow(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function addDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const valid = (o) => o && wmsOrderId(o.orderRef) && typeof o.warehouseId === 'string' && typeof o.carrier === 'string'
  && /^\d{4}-\d{2}-\d{2}$/.test(o.promiseDate ?? '') && Array.isArray(o.items) && o.items.length > 0;

/** Design §4: a new order is 201; the same orderRef again is 200 with the same number (LateLens may retry). */
export function receive(orders, order, now) {
  if (!valid(order)) return { status: 400, body: { error: 'invalid order' } };
  const id = wmsOrderId(order.orderRef);
  if (orders.some((o) => o.orderRef === order.orderRef)) return { status: 200, body: { wmsOrderId: id } };
  orders.push({ ...order, wmsOrderId: id, receivedAt: now, steps: [] });
  return { status: 201, body: { wmsOrderId: id } };
}

export const nextStep = (order) => STEPS[order.steps.length] ?? null;

/** Now, but never before the last step; a delivery `lateDays` > 0 lands at 14:00 that many days after the promise date. */
export function stepTs(order, step, lateDays, now) {
  if (step === 'delivered' && lateDays > 0) return `${addDays(order.promiseDate, lateDays)} 14:00`;
  const last = order.steps.at(-1)?.ts;
  return last && TS.test(last) && last > now ? last : now;
}

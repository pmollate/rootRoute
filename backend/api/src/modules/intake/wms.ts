// Design §4 ([WMS_CONTRACT]): the order LateLens hands to Halcyon's WMS. The WMS is simulated (tools/wms-simulator, Q-002).
import type { EmailRow, ExtractionRow } from './repo.js';

export interface WmsOrder {
  orderRef: string;
  clientId: string | null;
  warehouseId: string;
  carrier: string;
  commitment: string;
  promiseDate: string;
  destination: { city: string | null; state: string | null; zip: string | null };
  items: { sku: string; qty: number }[];
}
export interface Wms { sendOrder(order: WmsOrder): Promise<{ wmsOrderId: string }> }

type Checks = { promise?: { promiseDate: string; commitment: string } | null; warehouse?: { warehouseId: string } | null;
  carrier?: { carrier: string } | null };

/**
 * The order from its latest extraction and checks (the carrier after any supervisor change). City, state and ZIP only:
 * no street, names, phone numbers or email addresses (SEC-JRN-01). Null when a check the WMS needs is missing.
 */
export function wmsOrder(email: EmailRow, x: ExtractionRow): WmsOrder | null {
  const c = x.checks as Checks;
  if (!x.extraction || !c.promise || !c.warehouse || !c.carrier) return null;
  const a = x.extraction.address;
  return {
    orderRef: `email:${email.id}`, clientId: email.client_id, warehouseId: c.warehouse.warehouseId, carrier: c.carrier.carrier,
    commitment: c.promise.commitment, promiseDate: c.promise.promiseDate,
    destination: { city: a?.city ?? null, state: a?.state ?? null, zip: a?.zip ?? null },
    items: x.extraction.items.map((i) => ({ sku: i.sku, qty: i.qty })),
  };
}

/** `POST {url}/orders` with a Bearer token. Null when WMS_URL is unset: send_to_wms then only sets the status. */
export function httpWms(url: string | undefined, token: string | undefined, timeoutMs = 5000): Wms | null {
  if (!url) return null;
  return {
    async sendOrder(order) {
      const res = await fetch(new URL('/orders', url), {
        method: 'POST', signal: AbortSignal.timeout(timeoutMs), body: JSON.stringify(order),
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token ?? ''}` },
      });
      if (!res.ok) throw new Error(`WMS answered ${res.status}`);
      const body = (await res.json()) as { wmsOrderId?: unknown };
      if (typeof body.wmsOrderId !== 'string' || !body.wmsOrderId) throw new Error('WMS answered without wmsOrderId');
      return { wmsOrderId: body.wmsOrderId };
    },
  };
}

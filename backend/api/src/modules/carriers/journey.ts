// Order journey (D9, docs/SPEC-order-workflow.md): one order as 14 stages, from the client's email to the door.
// Pure builders: queries.ts loads the rows, routes.ts serves them. Read-only by design (REQ-JRN-02).
import type { PromiseResult, WarehouseChoice } from '../../core/contracts.js';

export type StageStatus = 'done' | 'current' | 'waiting' | 'at_risk' | 'failed' | 'skipped' | 'not_reached';
export type StageKey = 'received' | 'read' | 'address' | 'promise' | 'warehouse' | 'carrier' | 'approved' | 'told'
  | 'wms' | 'picked' | 'handed' | 'transit' | 'delivered' | 'notice';

export interface Stage {
  n: number;
  key: StageKey;
  label: string;
  status: StageStatus;
  at: string | null;
  actor: string;
  source: 'real' | 'synthetic' | 'rule';
  detail: string;
  /** For a past delivery: what the existing LateLens rule gives on this delivery's facts (never an on-time claim). */
  withLateLens?: string;
}

export interface Journey {
  ref: string;
  kind: 'order' | 'delivery';
  summary: { clientId: string | null; tier: string | null; channel: string; commitment: string | null;
    destination: string | null; promisedDate: string | null; outcome: string };
  synthetic: boolean;
  rounds: { id: number; receivedAt: string; decision: string | null }[];
  stages: Stage[];
}

const LABELS: [StageKey, string][] = [
  ['received', 'Order received'], ['read', 'Order read'], ['address', 'Address checked'], ['promise', 'Promise set'],
  ['warehouse', 'Warehouse chosen'], ['carrier', 'Carrier chosen'], ['approved', 'Approved'], ['told', 'Client told'],
  ['wms', 'Entered in WMS'], ['picked', 'Picked'], ['handed', 'Handed to carrier'], ['transit', 'In transit'],
  ['delivered', 'Delivered'], ['notice', 'Delay notice'],
];

type Part = Omit<Stage, 'n' | 'key' | 'label'>;
const stages = (parts: Record<StageKey, Part>): Stage[] =>
  LABELS.map(([key, label], i) => ({ n: i + 1, key, label, ...parts[key] }));
const notReached = (actor = '—'): Part => ({ status: 'not_reached', at: null, actor, source: 'real', detail: '' });

// ---- Past deliveries (supplied data, cause flags from SPEC §5.1) ----

export interface DeliveryFacts {
  deliveryId: string; orderId: string; clientId: string; tier: string | null; channel: string; emailFormat: string | null;
  receivedAt: string; commitment: string; promisedDate: string; addressStatus: string; pickDate: string; shippedAt: string;
  region: string; nearest: string; fulfilment: string; nearestHadStock: boolean; carrier: string;
  deliveredDate: string; daysLate: number; onTime: boolean; plannedKm: number; actualKm: number | null;
}
export interface CauseFlags {
  f_addr: boolean; f_cutoff: boolean; f_stock: boolean; f_stock_out: boolean; f_skip_nearest: boolean;
  f_lane: boolean; f_bad_lane: boolean; f_d_friday: boolean; f_route: boolean;
}
export interface TrackEvent { event: string; at: string; source: string }
/** The existing rules run on the delivery's facts: checkPromise, pickWarehouse and the lane recommendation's reason. */
export interface Advice { promise: PromiseResult; warehouse: WarehouseChoice; carrier: string | null }

const COMMITMENT: Record<string, string> = { same_day: 'Same day', next_day: 'Next day', standard: 'Standard' };

export function buildDeliveryJourney(d: DeliveryFacts, f: CauseFlags, events: TrackEvent[], advice: Advice): Journey {
  const ev = (name: string) => events.find((e) => e.event === name);
  const transit = ev('in_transit') ?? ev('out_for_delivery');
  const late = !d.onTime;
  const parts: Record<StageKey, Part> = {
    received: { status: 'done', at: d.receivedAt, actor: 'Client', source: 'real',
      detail: d.channel === 'Email'
        ? `Email order (layout ${d.emailFormat ?? '?'}). The recorded time is when it was keyed in, not when it arrived.`
        : `${d.channel} order.` },
    read: d.channel === 'Email'
      ? { status: 'done', at: null, actor: 'Person', source: 'real', detail: 'Read and keyed in by hand.' }
      : { status: 'done', at: null, actor: 'System', source: 'real', detail: `Received through ${d.channel}.` },
    address: f.f_addr
      ? { status: 'failed', at: null, actor: '—', source: 'real', detail: 'The address was incomplete when the order went ahead.',
        withLateLens: 'Decision CONFIRM_ADDRESS: the client is asked for the missing parts before the order moves.' }
      : { status: 'done', at: null, actor: '—', source: 'real', detail: 'Address complete.' },
    promise: f.f_cutoff
      ? { status: 'failed', at: d.receivedAt, actor: '—', source: 'real',
        detail: `Same day promised for ${d.promisedDate}, although the order came in after the 08:00 cut-off.`,
        withLateLens: `Promise ${advice.promise.promiseDate} (${COMMITMENT[advice.promise.commitment]}). ${advice.promise.reason ?? ''}`.trim() }
      : { status: 'done', at: d.receivedAt, actor: '—', source: 'real',
        detail: `${COMMITMENT[d.commitment] ?? d.commitment}: promised for ${d.promisedDate}.` },
    warehouse: f.f_stock
      ? { status: 'failed', at: null, actor: '—', source: 'real',
        detail: `Shipped from ${d.fulfilment}; the nearest warehouse ${d.nearest} ${d.nearestHadStock ? 'had stock' : 'was out of stock'}.`,
        withLateLens: advice.warehouse.reason }
      : { status: 'done', at: null, actor: '—', source: 'real', detail: `Shipped from ${d.fulfilment}, the nearest warehouse.` },
    carrier: f.f_lane
      ? { status: 'failed', at: null, actor: '—', source: 'real',
        detail: f.f_d_friday && !f.f_bad_lane
          ? `Carrier D to the ${d.region} on a Friday, when D is overloaded.`
          : `Carrier ${d.carrier} to the ${d.region}: a lane that is late even on fair data.`,
        withLateLens: f.f_d_friday && !f.f_bad_lane
          ? 'Carrier D is capped on Fridays at its normal daily level; the overflow goes to the next carrier.'
          : advice.carrier ?? undefined }
      : { status: 'done', at: null, actor: '—', source: 'real', detail: `Carrier ${d.carrier} to the ${d.region}.` },
    approved: { status: 'skipped', at: null, actor: '—', source: 'real', detail: 'No approval step today.' },
    told: { status: 'skipped', at: null, actor: '—', source: 'real', detail: 'No confirmation of the promise is sent today.' },
    wms: { status: 'done', at: d.receivedAt, actor: 'Person', source: 'real', detail: `Keyed in by hand as ${d.orderId}.` },
    picked: { status: 'done', at: d.pickDate, actor: d.fulfilment, source: 'real', detail: 'On the pick list.' },
    handed: { status: 'done', at: d.shippedAt, actor: `Carrier ${d.carrier}`, source: 'real', detail: 'Shipped.' },
    transit: f.f_route
      ? { status: 'failed', at: transit?.at ?? null, actor: `Carrier ${d.carrier}`, source: 'synthetic',
        detail: `Route driven ${d.actualKm} km against ${d.plannedKm} km planned (more than 20% over).`,
        withLateLens: 'Not checked: route detours are left to the routing pilot.' }
      : { status: 'done', at: transit?.at ?? null, actor: `Carrier ${d.carrier}`, source: 'synthetic',
        detail: `Tracking events from the ${transit?.source ?? 'carrier'} feed.` },
    delivered: late
      ? { status: 'failed', at: d.deliveredDate, actor: `Carrier ${d.carrier}`, source: 'real',
        detail: `${d.daysLate} day${d.daysLate === 1 ? '' : 's'} late. The client found out the next day.` }
      : { status: 'done', at: d.deliveredDate, actor: `Carrier ${d.carrier}`, source: 'real', detail: 'On time.' },
    notice: { status: 'skipped', at: null, actor: '—', source: 'real', detail: 'No delay notice is sent today.' },
  };
  return {
    ref: `delivery:${d.deliveryId}`, kind: 'delivery', synthetic: true, rounds: [],
    summary: { clientId: d.clientId, tier: d.tier, channel: d.channel, commitment: d.commitment, destination: d.region,
      promisedDate: d.promisedDate, outcome: late ? `${d.daysLate} days late` : 'On time' },
    stages: stages(parts),
  };
}

// ---- New orders (intake tables; stages 10-13 wait for the simulated tracking, REQ-JRN-05) ----

export interface EmailFacts {
  id: number; clientId: string | null; tier: string | null; status: string; receivedAt: string;
  rounds: { id: number; receivedAt: string; decision: string | null }[];
  destination: { city: string | null; state: string | null; zip: string | null } | null;
  commitment: string | null;
  decision: string | null;
  checks: { promise?: PromiseResult | null; warehouse?: WarehouseChoice | null;
    carrier?: { carrier: string; backup: string; reason: string } | null } | null;
  approvals: { action: string; actor: string; at: string; reason: string | null }[];
  outbound: { status: string; at: string }[];
  overrides: { from: string; to: string; reason: string; user: string; at: string }[];
}

export function buildEmailJourney(e: EmailFacts): Journey {
  const did = (action: string) => e.approvals.find((a) => a.action === action);
  const approve = did('approve');
  const reject = did('reject');
  const wms = did('send_to_wms');
  const sent = e.outbound.find((o) => o.status === 'sent');
  const refused = e.outbound.find((o) => o.status === 'refused');
  const known = e.clientId !== null;
  const read = e.decision !== null;
  const clear = e.decision === 'ALL_CLEAR';
  const c = e.checks;
  const override = e.overrides.at(-1);
  const rounds = e.rounds.length > 1 ? ` (${e.rounds.length} rounds with the client)` : '';

  const parts: Record<StageKey, Part> = {
    received: { status: 'done', at: e.receivedAt, actor: 'Client', source: 'real',
      detail: known ? 'Arrival time from the mailbox: the 08:00 cut-off is judged on it.' : 'Unknown sender domain.' },
    read: !known && e.status !== 'WAITING'
      ? { status: 'skipped', at: null, actor: 'Code', source: 'real', detail: 'Unknown sender: no AI call, no reply.' }
      : e.status === 'WAITING'
        ? { status: 'waiting', at: null, actor: 'AI + code', source: 'real', detail: 'A service was not reachable; the next poll retries.' }
        : { status: read ? 'done' : 'failed', at: e.receivedAt, actor: 'AI + code', source: 'real',
          detail: read ? 'Order fields extracted after names, phones and emails were removed.' : 'The order could not be read.' },
    address: !read || !known ? notReached()
      : e.decision === 'CONFIRM_ADDRESS'
        ? { status: 'current', at: null, actor: 'Client', source: 'real', detail: `Waiting for the client to confirm the address${rounds}.` }
        : e.decision === 'MISSING_INFO'
          ? { status: 'failed', at: null, actor: 'Code', source: 'real', detail: `Information missing${rounds}.` }
          : { status: 'done', at: null, actor: 'Code + map', source: 'real', detail: `Address verified${rounds}.` },
    promise: c?.promise
      ? { status: 'done', at: null, actor: 'Warehouse rule', source: 'rule',
        detail: `Promise ${c.promise.promiseDate}.${c.promise.reason ? ` ${c.promise.reason}` : ''}` }
      : notReached(),
    warehouse: c?.warehouse
      ? { status: 'done', at: null, actor: 'Warehouse rule', source: 'rule', detail: c.warehouse.reason }
      : notReached(),
    carrier: c?.carrier
      ? { status: 'done', at: override?.at ?? null, actor: override ? override.user : 'Carriers rule', source: 'rule',
        detail: c.carrier.reason + (override ? `; changed ${override.from} → ${override.to} by ${override.user}: ${override.reason}` : '') }
      : notReached(),
    approved: reject
      ? { status: 'failed', at: reject.at, actor: reject.actor, source: 'real', detail: `Rejected: ${reject.reason ?? 'no reason given'}` }
      : approve
        ? { status: 'done', at: approve.at, actor: approve.actor, source: 'real', detail: 'Approved before anything left.' }
        : clear
          ? { status: 'current', at: null, actor: 'Supervisor', source: 'real', detail: 'Waiting for approval.' }
          : read && known ? { status: 'skipped', at: null, actor: '—', source: 'real', detail: 'Only all-clear orders are approved.' } : notReached(),
    told: reject ? notReached()
      : sent ? { status: 'done', at: sent.at, actor: did('send_reply')?.actor ?? 'Operator', source: 'real', detail: 'Reply sent to an allow-listed address.' }
        : refused ? { status: 'failed', at: refused.at, actor: 'Code', source: 'real', detail: 'Refused: the address is not on the allow-list.' }
          : approve ? { status: 'current', at: null, actor: 'Operator', source: 'real', detail: 'Reply drafted, not sent yet.' } : notReached(),
    wms: reject ? notReached()
      : wms ? { status: 'done', at: wms.at, actor: wms.actor, source: 'synthetic', detail: `Entered in the simulated WMS as WMS-${e.id}.` }
        : approve && clear ? { status: 'current', at: null, actor: 'Operator', source: 'real', detail: 'Approved, not entered yet.' } : notReached(),
    picked: notReached('Warehouse'), handed: notReached('Carrier'), transit: notReached('Carrier'),
    delivered: notReached('Carrier'), notice: notReached(),
  };
  const dest = e.destination ? [e.destination.city, e.destination.state, e.destination.zip].filter(Boolean).join(', ') || null : null;
  return {
    ref: `email:${e.id}`, kind: 'order', synthetic: true, rounds: e.rounds,
    summary: { clientId: e.clientId, tier: e.tier, channel: 'Email', commitment: c?.promise?.commitment ?? e.commitment,
      destination: dest, promisedDate: c?.promise?.promiseDate ?? null, outcome: reject ? 'Rejected' : e.status.replace('_', ' ').toLowerCase() },
    stages: stages(parts),
  };
}

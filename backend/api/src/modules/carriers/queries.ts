import { cached } from '../../core/cache.js';
import type { CarrierId, Commitment, Region } from '../../core/contracts.js';
import { query } from '../../core/db/pool.js';
import type { LaneRow } from './domain.js';
import type { CauseFlags, DeliveryFacts, EmailFacts, TrackEvent } from './journey.js';

export const laneRows = (region: Region, commitment: Commitment) => cached(`lane:${region}:${commitment}`, () =>
  query<LaneRow>('SELECT * FROM lane_scores WHERE region = $1 AND commitment = $2', [region, commitment]));

export const capacityLimits = (region: Region, friday: boolean) => cached(`cap:${region}:${friday}`, async () => {
  const rows = await query<{ carrier_id: CarrierId; daily_limit: number; friday_limit: number }>(
    'SELECT carrier_id, daily_limit, friday_limit FROM carrier_capacity WHERE region = $1', [region],
  );
  return Object.fromEntries(rows.map((r) => [r.carrier_id, friday ? r.friday_limit : r.daily_limit])) as Partial<Record<CarrierId, number>>;
});

export async function usedToday(region: Region, date: string): Promise<Partial<Record<CarrierId, number>>> {
  const rows = await query<{ carrier: CarrierId; n: number }>(
    'SELECT carrier, count(*) AS n FROM recommendations WHERE for_date = $1 AND region = $2 GROUP BY carrier', [date, region],
  );
  return Object.fromEntries(rows.map((r) => [r.carrier, r.n]));
}

export async function logRecommendation(r: { orderRef: string | null; region: Region; commitment: Commitment; carrier: CarrierId; backup: CarrierId; reason: string; date: string }): Promise<void> {
  await query(
    'INSERT INTO recommendations (order_ref, region, commitment, carrier, backup, reason, for_date) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [r.orderRef, r.region, r.commitment, r.carrier, r.backup, r.reason, r.date],
  );
}

export async function insertOverride(o: { orderRef: string; from: string; to: string; reason: string; user: string }): Promise<number> {
  const rows = await query<{ id: number }>(
    'INSERT INTO override_log (order_ref, from_carrier, to_carrier, reason, user_name) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [o.orderRef, o.from, o.to, o.reason, o.user],
  );
  return rows[0].id;
}

export const backtestRows = () => cached('backtest', async () => ({
  rows: (await query<{ choice: string; n: number; on_time: number; mean_rate: number }>('SELECT * FROM carrier_backtest ORDER BY choice'))
    .map((r) => ({ choice: r.choice, n: r.n, onTime: r.on_time, meanRate: r.mean_rate })),
}));

export async function tracking(asOf: string) {
  const freshness = await query<{ carrier: string; source: string; last_event_at: string }>(
    `SELECT carrier_id AS carrier, min(source) AS source, max(ts) AS last_event_at
       FROM carrier_events WHERE ts <= ($1::date + interval '1 day') GROUP BY carrier_id ORDER BY carrier_id`, [asOf],
  );
  const atRisk = await query<{ delivery_id: string; carrier_id: string; promised_date: string }>(
    `SELECT d.delivery_id, d.carrier_id, d.promised_date::date::text AS promised_date
       FROM deliveries_clean d
      WHERE d.promised_date::date = $1::date
        AND NOT EXISTS (SELECT 1 FROM carrier_events e
                         WHERE e.delivery_id = d.delivery_id AND e.event = 'delivered'
                           AND e.ts < ($1::date + interval '1 day'))
      ORDER BY d.carrier_id, d.delivery_id LIMIT 500`, [asOf],
  );
  return {
    synthetic: true as const,
    asOf,
    freshness: freshness.map((f) => ({ carrier: f.carrier, source: f.source, lastEventAt: f.last_event_at })),
    atRisk: atRisk.map((a) => ({ deliveryId: a.delivery_id, carrier: a.carrier_id, promisedDate: a.promised_date })),
  };
}

// ---- Order journey (D9): reads only (REQ-JRN-02) ----

const ts = (col: string) => `to_char(${col}, 'YYYY-MM-DD HH24:MI')`;
const day = (col: string) => `to_char(${col}, 'YYYY-MM-DD')`;

export async function deliveryFacts(id: string) {
  const [row] = await query<DeliveryFacts & CauseFlags & { sla: string }>(
    `SELECT d.delivery_id AS "deliveryId", d.order_id AS "orderId", d.client_id AS "clientId", cl.account_tier AS tier,
            cl.sla_penalty_clause AS sla, d.order_channel AS channel, d.email_format_id::text AS "emailFormat",
            ${ts('d.order_received_ts')} AS "receivedAt", d.commitment_type AS commitment,
            ${day('d.promised_date')} AS "promisedDate", d.address_status AS "addressStatus", ${day('d.pick_list_date')} AS "pickDate",
            ${ts('d.shipped_ts')} AS "shippedAt", d.destination_region AS region, d.nearest_warehouse_id AS nearest,
            d.fulfilment_warehouse_id AS fulfilment, d.nearest_warehouse_had_stock = 'Y' AS "nearestHadStock",
            d.carrier_id AS carrier, ${day('d.delivered_date')} AS "deliveredDate", d.days_late::int AS "daysLate",
            d.on_time = 'Y' AS "onTime", d.planned_route_km::float AS "plannedKm", d.actual_route_km::float AS "actualKm",
            c.f_addr, c.f_cutoff, c.f_stock, c.f_stock_out, c.f_skip_nearest, c.f_lane, c.f_bad_lane, c.f_d_friday, c.f_route
       FROM deliveries_clean d JOIN delivery_causes c USING (delivery_id) LEFT JOIN clients cl ON cl.client_id = d.client_id
      WHERE d.delivery_id = $1`, [id]);
  if (!row) return null;
  const events = await query<TrackEvent>(
    `SELECT event, ${ts('ts')} AS at, source FROM carrier_events WHERE delivery_id = $1 ORDER BY ts`, [id]);
  return { row, events };
}

export async function emailFacts(id: number): Promise<EmailFacts | null> {
  const [e] = await query<{ id: number; client_id: string | null; tier: string | null; status: string; received_at: string }>(
    `SELECT e.id, e.client_id, cl.account_tier AS tier, e.status, e.received_at
       FROM intake_emails e LEFT JOIN clients cl ON cl.client_id = e.client_id WHERE e.id = $1`, [id]);
  if (!e) return null;
  // The email and the client's answers to it, oldest first; the latest extraction carries the current decision.
  const rounds = await query<{ id: number; received_at: string; decision: string | null }>(
    `WITH RECURSIVE chain AS (SELECT id, received_at FROM intake_emails WHERE id = $1
       UNION ALL SELECT n.id, n.received_at FROM intake_emails n JOIN chain ON n.in_reply_to = chain.id)
     SELECT c.id, c.received_at,
            (SELECT x.decision FROM intake_extractions x WHERE x.email_id = c.id ORDER BY x.id DESC LIMIT 1) AS decision
       FROM chain c ORDER BY c.id`, [id]);
  const ids = rounds.map((r) => r.id);
  const [x] = await query<{ extraction: { address?: { city: string | null; state: string | null; zip: string | null };
    requested_commitment?: string | null } | null; decision: string | null; checks: EmailFacts['checks'] }>(
    'SELECT extraction, decision, checks FROM intake_extractions WHERE email_id = ANY($1) ORDER BY id DESC LIMIT 1', [ids]);
  const refs = ids.map((i) => `email:${i}`);
  const approvals = await query<{ action: string; actor: string; at: string; reason: string | null }>(
    `SELECT action, actor, ${ts('created_at')} AS at, payload->>'reason' AS reason
       FROM audit_log WHERE ref = ANY($1) ORDER BY id`, [refs]);
  const outbound = await query<{ status: string; at: string }>(
    `SELECT status, ${ts('created_at')} AS at FROM outbound_messages WHERE email_id = ANY($1) ORDER BY id`, [ids]);
  const overrides = await query<{ from: string; to: string; reason: string; user: string; at: string }>(
    `SELECT from_carrier AS "from", to_carrier AS "to", reason, user_name AS "user", ${ts('created_at')} AS at
       FROM override_log WHERE order_ref = ANY($1) ORDER BY id`, [refs]);
  const a = x?.extraction?.address;
  return {
    id: e.id, clientId: e.client_id, tier: e.tier, status: e.status, receivedAt: e.received_at,
    rounds: rounds.map((r) => ({ id: r.id, receivedAt: r.received_at, decision: r.decision })),
    // City, state and ZIP only: no street, names or contact details (SEC-JRN-01).
    destination: a ? { city: a.city, state: a.state, zip: a.zip } : null,
    commitment: x?.extraction?.requested_commitment ?? null,
    decision: x?.decision ?? null, checks: x?.checks ?? null, approvals, outbound, overrides,
  };
}

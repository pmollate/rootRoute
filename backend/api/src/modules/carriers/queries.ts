import { cached } from '../../core/cache.js';
import type { CarrierId, Commitment, Region } from '../../core/contracts.js';
import { query } from '../../core/db/pool.js';
import type { LaneRow } from './domain.js';

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

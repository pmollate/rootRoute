import { query } from '../../core/db/pool.js';
import { addDays } from '../warehouse/domain.js';
import { byPriority, isPriority } from './priority.js';

export const ALERT_THRESHOLD = 0.5;

/** Facts known before despatch only (REQ-RISK-01). Never route, delivery or outcome columns. */
export interface PreDespatchFacts { f_addr: boolean; f_cutoff: boolean; f_stock: boolean; f_lane: boolean }
export interface RiskRow extends PreDespatchFacts { late_rate: number }

export function riskScore(facts: PreDespatchFacts, lookup: RiskRow[]): number {
  const hit = lookup.find((r) => r.f_addr === facts.f_addr && r.f_cutoff === facts.f_cutoff && r.f_stock === facts.f_stock && r.f_lane === facts.f_lane);
  return hit?.late_rate ?? 0;
}

export interface AlertCandidate extends PreDespatchFacts { deliveryId: string; clientId: string; promisedDate: string; priority: boolean }

export function draftAlert(c: AlertCandidate, score: number, asOf: string) {
  if (score < ALERT_THRESHOLD || asOf >= c.promisedDate) return null;
  const newDate = addDays(c.promisedDate, 1);
  return {
    orderRef: c.deliveryId, risk: score, type: 'delay' as const,
    draft: `Your delivery ${c.deliveryId} is at risk of arriving after ${c.promisedDate}. Our new estimate is ${newDate}. We are sorry and will confirm as soon as it ships. Halcyon Logistics`,
    payload: { ...c, newDate, sentOn: asOf },
  };
}

/** E10 demo: score the deliveries ordered on asOf and draft alerts for the risky ones. */
export async function runAlerts(asOf: string): Promise<number> {
  const lookup = await query<RiskRow>('SELECT f_addr, f_cutoff, f_stock, f_lane, late_rate FROM risk_lookup');
  const rows = await query<{ delivery_id: string; client_id: string; promised_date: string; f_addr: boolean; f_cutoff: boolean; f_stock: boolean; f_lane: boolean; account_tier: string; account_status: string }>(
    `SELECT c.delivery_id, c.client_id, d.promised_date::date::text AS promised_date, c.f_addr, c.f_cutoff, c.f_stock, c.f_lane,
            k.account_tier, k.account_status
       FROM delivery_causes c
       JOIN deliveries_clean d USING (delivery_id)
       JOIN clients k ON k.client_id = c.client_id
      WHERE d.order_received_ts::date = $1::date
      ORDER BY c.delivery_id`, [asOf],
  );
  const candidates = byPriority(rows.map((r) => ({
    deliveryId: r.delivery_id, clientId: r.client_id, promisedDate: r.promised_date, f_addr: r.f_addr, f_cutoff: r.f_cutoff,
    f_stock: r.f_stock, f_lane: r.f_lane, priority: isPriority(r.account_tier, r.account_status === 'threatening_to_leave'),
  })), (c) => c.priority);
  let drafted = 0;
  for (const c of candidates) {
    const alert = draftAlert(c, riskScore(c, lookup), asOf);
    if (!alert) continue;
    await query('INSERT INTO alerts (order_ref, risk, type, draft, payload) VALUES ($1,$2,$3,$4,$5)',
      [alert.orderRef, alert.risk, alert.type, alert.draft, JSON.stringify(alert.payload)]);
    drafted += 1;
  }
  return drafted;
}

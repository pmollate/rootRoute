import type { CarrierId, CarrierOption, CarrierRecommendation, Commitment, Region } from '../../core/contracts.js';

export interface LaneRow {
  region: Region;
  commitment: Commitment;
  carrier_id: CarrierId;
  n: number;
  on_time: number;
  mean_days_late: number;
  mean_rate: number;
  blocked: boolean;
  block_reason: string;
  score_default: number | null;
  score_sla: number | null;
}

/** Carrier D overloads on Fridays; the Friday capacity limits apply then (SPEC §5.2). */
export function isFriday(date: string): boolean {
  return new Date(`${date}T00:00:00Z`).getUTCDay() === 5;
}

const COMMITMENT_LABEL: Record<Commitment, string> = { same_day: 'same-day', next_day: 'next-day', standard: 'standard' };
const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Rank eligible carriers by score (SLA weights for clients with a penalty clause); blocked ones last. */
export function rankLane(rows: LaneRow[], slaClause: boolean): LaneRow[] {
  const score = (r: LaneRow) => (slaClause ? r.score_sla : r.score_default) ?? -1;
  return [...rows].sort((a, b) => Number(a.blocked) - Number(b.blocked) || score(b) - score(a));
}

/** Drop carriers that already used their daily limit; keep order. */
export function applyCapacity(
  ranked: LaneRow[], usedToday: Partial<Record<CarrierId, number>>, limits: Partial<Record<CarrierId, number>>,
): LaneRow[] {
  return ranked.filter((r) => r.blocked || (usedToday[r.carrier_id] ?? 0) < (limits[r.carrier_id] ?? Infinity));
}

/** Assign n orders one by one to the best carrier with capacity left. Returns orders per carrier. */
export function allocateBatch(
  n: number, ranked: LaneRow[], limits: Partial<Record<CarrierId, number>>,
): Partial<Record<CarrierId, number>> {
  const used: Partial<Record<CarrierId, number>> = {};
  for (let i = 0; i < n; i += 1) {
    const pick = applyCapacity(ranked, used, limits).find((r) => !r.blocked);
    if (!pick) break;
    used[pick.carrier_id] = (used[pick.carrier_id] ?? 0) + 1;
  }
  return used;
}

export function reasonFor(best: LaneRow, rows: LaneRow[]): string {
  const blocked = rows.filter((r) => r.blocked).sort((a, b) => a.on_time - b.on_time);
  const other = blocked[0] ?? rows.find((r) => r.carrier_id !== best.carrier_id && !r.blocked);
  const head = `Carrier ${best.carrier_id} for ${best.region} ${COMMITMENT_LABEL[best.commitment]}`;
  if (!other) return `${head}: ${pct(best.on_time)} on time`;
  const diff = best.mean_rate - other.mean_rate;
  const money = `$${Math.abs(diff).toFixed(2)} ${diff >= 0 ? 'more' : 'cheaper'} per shipment`;
  return `${head}: ${pct(best.on_time)} on time vs ${pct(other.on_time)} for ${other.carrier_id}; ${money}`;
}

export function recommendFromLane(
  rows: LaneRow[], slaClause: boolean,
  usedToday: Partial<Record<CarrierId, number>> = {}, limits: Partial<Record<CarrierId, number>> = {},
): CarrierRecommendation {
  const ranked = rankLane(rows, slaClause);
  const available = applyCapacity(ranked, usedToday, limits).filter((r) => !r.blocked);
  if (available.length < 2) throw new Error(`lane ${rows[0]?.region}/${rows[0]?.commitment} has fewer than 2 carriers available`);
  const [best, backup] = available;
  const options: CarrierOption[] = ranked.map((r) => ({
    carrier: r.carrier_id,
    onTime: r.on_time,
    meanRate: r.mean_rate,
    n: r.n,
    score: (slaClause ? r.score_sla : r.score_default) ?? null,
    status: r.blocked ? 'blocked' : r.carrier_id === best.carrier_id ? 'recommended'
      : r.carrier_id === backup.carrier_id ? 'backup' : 'eligible',
    reason: r.blocked ? r.block_reason : available.includes(r) ? 'eligible' : 'at daily capacity',
  }));
  return {
    carrier: best.carrier_id,
    backup: backup.carrier_id,
    reason: reasonFor(best, rows),
    blocked: rows.filter((r) => r.blocked).map((r) => r.carrier_id),
    options,
  };
}

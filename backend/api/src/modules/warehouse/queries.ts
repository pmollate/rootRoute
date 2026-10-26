import { cached } from '../../core/cache.js';
import { query } from '../../core/db/pool.js';

export const SEGMENTS = ['all', 'email', 'at_risk'] as const;
export const REPLAY_SEGMENTS = ['all', 'email', 'at_risk', 'aug_sep'] as const;

export const overview = () => cached('overview', async () => {
  const rows = await query<{ key: string; value: number }>('SELECT key, value FROM kpis');
  const k = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    onTime: k.on_time, benchmark: k.benchmark, deliveries: k.deliveries, late: k.late, penaltiesUsd: k.penalties_usd,
    handlingCostUsd: k.handling_cost_usd, atRiskAccounts: k.at_risk_accounts, atRiskRevenueUsd: k.at_risk_revenue_usd,
    prePickupShare: k.pre_pickup_share,
  };
});

export const causes = (segment: string) => cached(`causes:${segment}`, async () => ({
  segment,
  causes: (await query<{ flag: string; label: string; stage: string; n: number; late_rate: number }>(
    'SELECT flag, label, stage, n, late_rate FROM cause_summary WHERE segment = $1', [segment],
  )).map((r) => ({ flag: r.flag, label: r.label, stage: r.stage, n: r.n, lateRate: r.late_rate })),
}));

export const replay = (segment: string) => cached(`replay:${segment}`, async () => ({
  segment,
  scenarios: (await query<{ scenario: string; label: string; grp: string; on_time: number; late_avoided: number; cost_avoided: number }>(
    'SELECT scenario, label, grp, on_time, late_avoided, cost_avoided FROM scenario_results WHERE segment = $1', [segment],
  )).map((r) => ({ scenario: r.scenario, label: r.label, grp: r.grp, onTime: r.on_time,
    lateAvoided: Math.round(r.late_avoided), costAvoided: Math.round(r.cost_avoided) })),
}));

interface AccountRow {
  client_id: string; client_name: string; account_tier: string; annual_revenue_usd: number; primary_order_channel: string;
  deliveries: number; on_time: number; main_cause: string; complaints: number;
}

interface WarehouseStatsRow {
  warehouse_id: string; warehouse_name: string; orders: number; cutoff_misses: number; cutoff_late_rate: number;
  cutoff_before_11: number; out_of_stock: number; out_of_stock_late_rate: number; skipped_nearest: number;
  skipped_nearest_late_rate: number;
}

export const accounts = () => cached('accounts', async () => ({
  accounts: (await query<AccountRow>('SELECT * FROM accounts ORDER BY annual_revenue_usd DESC')).map((r) => ({
    clientId: r.client_id, clientName: r.client_name, tier: r.account_tier, revenueUsd: r.annual_revenue_usd,
    channel: r.primary_order_channel, deliveries: r.deliveries, onTime: r.on_time, mainCause: r.main_cause, complaints: r.complaints,
  })),
}));

export const warehouses = () => cached('warehouses', async () => {
  const rows = await query<WarehouseStatsRow>('SELECT * FROM warehouse_stats ORDER BY warehouse_id');
  const pick = await query<{ on_time: number }>(
    "SELECT on_time FROM scenario_results WHERE scenario = 'second_pick' AND segment = 'all'",
  );
  return {
    warehouses: rows.map((r) => ({
      warehouseId: r.warehouse_id, name: r.warehouse_name, orders: r.orders, cutoffMisses: r.cutoff_misses,
      cutoffLateRate: r.cutoff_late_rate, cutoffBefore11: r.cutoff_before_11, outOfStock: r.out_of_stock,
      outOfStockLateRate: r.out_of_stock_late_rate, skippedNearest: r.skipped_nearest, skippedNearestLateRate: r.skipped_nearest_late_rate,
    })),
    secondPick: { movedOrders: rows.reduce((a, r) => a + r.cutoff_before_11, 0), onTime: pick[0]?.on_time ?? null },
  };
});

export const attribution = () => cached('attribution', async () => ({
  causes: (await query<{ cause: string; label: string; stage: string; deliveries: number; points_lost: number; share_of_lateness: number }>(
    'SELECT * FROM cause_attribution ORDER BY points_lost DESC',
  )).map((r) => ({ cause: r.cause, label: r.label, stage: r.stage, deliveries: r.deliveries, pointsLost: r.points_lost,
    share: r.share_of_lateness })),
}));

export const causeKpis = () => cached('cause-kpis', async () => ({
  kpis: await query<{ cause: string; label: string; kpi: string; baseline: number; target: string; owner: string }>(
    'SELECT cause, label, kpi, baseline, target, owner FROM cause_kpis',
  ),
}));

export const unpaidPenalties = () => cached('unpaid', async () => {
  const byTier = await query<{ tier: string; n: number }>(
    'SELECT account_tier AS tier, count(*) AS n FROM penalty_reconciliation GROUP BY account_tier ORDER BY account_tier',
  );
  const rows = await query<{ delivery_id: string; client_id: string; account_tier: string; days_late: number; promised_date: string }>(
    'SELECT * FROM penalty_reconciliation ORDER BY account_tier, days_late DESC LIMIT 200',
  );
  return {
    count: byTier.reduce((a, r) => a + r.n, 0),
    byTier,
    rows: rows.map((r) => ({ deliveryId: r.delivery_id, clientId: r.client_id, tier: r.account_tier, daysLate: r.days_late,
      promisedDate: r.promised_date })),
  };
});

// The placement tables are written by the SD-05 stock pipeline (B11); until it has run they do not exist.
const placementReady = async () =>
  (await query<{ ok: boolean }>("SELECT to_regclass('placement_suggestions') IS NOT NULL AS ok"))[0]?.ok ?? false;

export const placement = () => cached('placement', async () => {
  if (!(await placementReady())) return { synthetic: true as const, week: null, suggestions: [], impact: [] };
  const [latest] = await query<{ week: string }>('SELECT max(week) AS week FROM placement_suggestions');
  const suggestions = await query<{ client_id: string; sku: string; from_warehouse: string; to_warehouse: string; qty: number; reason: string }>(
    'SELECT * FROM placement_suggestions WHERE week = $1 ORDER BY qty DESC LIMIT 50', [latest?.week],
  );
  const impact = await query<{ week: string; suggestions: number; avoided_next_week: number }>(
    'SELECT week, suggestions, avoided_next_week FROM placement_impact ORDER BY week',
  );
  return {
    synthetic: true as const,
    week: latest?.week ?? null,
    suggestions: suggestions.map((s) => ({ clientId: s.client_id, sku: s.sku, from: s.from_warehouse, to: s.to_warehouse, qty: s.qty, reason: s.reason })),
    impact: impact.map((i) => ({ week: i.week, suggestions: i.suggestions, avoidedNextWeek: i.avoided_next_week })),
  };
});

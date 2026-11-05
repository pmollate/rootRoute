/**
 * Figures for the pitch deck at /present. Every number is computed from the supplied dataset (48,340 deliveries,
 * orders 1 Apr – 25 Sep 2026): the LateLens read-only tools (overview, delivery_causes, scenario, lane_scores) and
 * docs/IMPACT.md, whose rows are asserted by backend/analytics/tests/test_scenarios.py (AC-DIAG-04, AC-DIAG-07).
 * Run the numbers-auditor agent before the pitch so this file, SPEC §2 and the dashboard agree.
 */

export const DATASET = {
  deliveries: 48_340,
  period: '1 Apr – 25 Sep 2026',
  clients: 280,
  warehouses: 5,
  carriers: 6,
};

export const HEADLINE = {
  onTime: 71.0,
  benchmark: 94,
  late: 14_019,
  /** SLA penalties actually paid: 4,847 × $180 */
  penaltiesUsd: 872_460,
  /** late-delivery handling: 14,019 × $34 */
  handlingUsd: 476_646,
  failureCostUsd: 1_349_106,
  freightUsd: 738_000,
  /** failure cost vs freight bill (SPEC §2) */
  freightMultiple: 1.8,
  prePickupSharePct: 67,
  complaints: 34,
  complaintsPrePickup: 28,
  complaintsNobodyToldUs: 12,
  atRiskAccounts: 9,
  atRiskRevenue: '$14.2M',
  routingContract: '$680K',
};

export type Cause = {
  key: string;
  label: string;
  stage: string;
  /** points of on-time lost, Shapley attribution, sums to 29.0 (IMPACT §2.2) */
  points: number;
  deliveries: number;
  lateRatePct: number;
  beforePickup: boolean;
};

/** Ordered by points lost. */
export const CAUSES: Cause[] = [
  { key: 'lane', label: 'Bad carrier lane, or carrier D on a Friday', stage: 'Carrier', points: 7.6, deliveries: 10_030, lateRatePct: 45, beforePickup: false },
  { key: 'addr', label: 'Incomplete address at intake', stage: 'Intake', points: 7.0, deliveries: 5_994, lateRatePct: 65, beforePickup: true },
  { key: 'stock', label: 'Shipped from a non-nearest warehouse', stage: 'Fulfilment', points: 5.6, deliveries: 6_700, lateRatePct: 50, beforePickup: true },
  { key: 'cutoff', label: 'Same-day order after the 8am cut-off', stage: 'Promise', points: 5.6, deliveries: 4_826, lateRatePct: 61, beforePickup: true },
  { key: 'route', label: 'Route more than 20% over plan', stage: 'Delivery', points: 3.2, deliveries: 2_880, lateRatePct: 63, beforePickup: false },
];

/** Deliveries with none of the five causes, and their late rate. */
export const NO_CAUSE = { deliveries: 22_309, lateRatePct: 0 };

/** Lanes blocked on fair data (late rate, limit 15%). */
export const BAD_LANES = [
  { carrier: 'D', region: 'Midwest', latePct: 48 },
  { carrier: 'D', region: 'Southeast', latePct: 38 },
  { carrier: 'E', region: 'West', latePct: 47 },
  { carrier: 'F', region: 'Northeast', latePct: 43 },
  { carrier: 'F', region: 'Southeast', latePct: 47 },
];

export const CARRIERS = {
  /** carriers A, B, C: raw on-time vs fair data (IMPACT §2.1) */
  abcRaw: 75.3,
  abcFair: 95.2,
  laneLimitPct: 15,
  /** lane rules trained Apr–Jul, on-time on held-out Aug–Sep */
  holdoutOnTime: 78.2,
};

export const EMAIL = {
  incompleteAddressPct: 27.8,
  fixtures: 50,
  fixturesCorrectMin: 48,
  recallMinPct: 95,
  onTimeToday: 70.7,
  onTimeAsBuilt: 89.6,
};

export const WAREHOUSE = {
  afterCutoff: 4_826,
  afterCutoffLatePct: 61,
  skippedNearest: 691,
  nearestOutOfStock: 6_009,
  outOfStockLatePct: 50,
};

/** Replay at expected adoption (scenario adopt_*). */
export const PROGRAMME = [
  { label: 'Today', onTime: 71.0, adoption: '' },
  { label: 'Address check', onTime: 76.2, adoption: '85%' },
  { label: 'Lane rules + Friday cap', onTime: 82.5, adoption: '90%' },
  { label: 'Cut-off-aware promise', onTime: 87.3, adoption: '85%' },
  { label: 'Warehouse fallback', onTime: 91.0, adoption: '60%' },
  { label: 'Route overruns cut (assumed)', onTime: 92.0, adoption: '30%' },
];

export const PROGRAMME_RESULT = { lateAvoided: 10_150, costAvoidedUsd: 980_764 };
export const AS_BUILT = { onTime: 85.9, lateAvoided: 7_191, costAvoidedUsd: 707_950 };

/** Full-fix upper bounds on the same replay (scenario reference rows). */
export const COMPARISON = [
  { label: 'Today', onTime: 71.0, kind: 'today' },
  { label: 'Route overruns only', onTime: 73.6, kind: 'route' },
  { label: 'Carrier lanes only', onTime: 77.4, kind: 'route' },
  { label: 'Carrier lanes + routes', onTime: 80.4, kind: 'route' },
  { label: 'Root Route as built, expected adoption', onTime: 85.9, kind: 'built' },
  { label: 'Root Route as built, every fix applied', onTime: 88.5, kind: 'built' },
  { label: 'Every cause but routes', onTime: 96.3, kind: 'all' },
] as const;

/** IMPACT §1: Halcyon's own KPIs over six months. */
export const KPIS = [
  { kpi: 'On-time delivery rate', today: '71.0%', built: '85.9%', full: '92.0%' },
  { kpi: 'Late deliveries', today: '14,019', built: '6,828', full: '3,869' },
  { kpi: 'Handling + SLA penalties', today: '$1.35M', built: '≈ $641K', full: '≈ $368K' },
  { kpi: 'On-time, email orders', today: '70.7%', built: '89.6%', full: '92.6%' },
  { kpi: 'On-time, 9 at-risk accounts', today: '70.7%', built: '86.8%', full: '92.1%' },
  { kpi: 'Gap to the 94% benchmark', today: '23.0 pts', built: '8.1 pts', full: '2.0 pts' },
];

export const LINKS = {
  app: 'https://rootroute.in',
  dashboard: 'https://rootroute.in/dashboard',
};

export const fmt = (n: number) => n.toLocaleString('en-US');
export const usd = (n: number) => `$${fmt(n)}`;

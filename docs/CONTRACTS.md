# LateLens — Shared Contracts

The single source for anything two resources depend on: shared TypeScript types, the functions one area calls in
another, the tables Python writes, and the JSON the API returns. Change this file in a PR that all three resources
review **before** changing code that depends on it.

Resources: **A = Email orders**, **B = Warehouse & promise (+ platform, diagnosis, decision)**, **C = Carriers (+ deploy)**.

---

## 1. Shared TypeScript types — `backend/api/src/core/contracts.ts` (owner B, created in B1)

```ts
export type Commitment = 'same_day' | 'next_day' | 'standard';
export type Region = 'Midwest' | 'Northeast' | 'Southeast' | 'West';
export type WarehouseId = 'W1' | 'W2' | 'W3' | 'W4' | 'W5';
export type CarrierId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

/** Local warehouse time as written in the data: "YYYY-MM-DD HH:mm". No time zones anywhere. */
export type LocalTimestamp = string;
/** "YYYY-MM-DD" */
export type IsoDate = string;

export interface PromiseResult {
  promiseDate: IsoDate;
  commitment: Commitment;      // may be downgraded from the request
  downgraded: boolean;
  reason: string | null;       // human sentence when downgraded, else null
}

export interface PickWarehouseInput {
  destinationRegion: Region;
  nearestWarehouseId: WarehouseId;
  /** Known stock per warehouse; a missing key means "unknown, assume in stock". */
  stock: Partial<Record<WarehouseId, boolean>>;
}

export interface WarehouseChoice {
  warehouseId: WarehouseId;
  reason: string;
  warnClient: boolean;         // true when no nearby warehouse has stock
}

export interface RecommendInput {
  region: Region;
  commitment: Commitment;
  slaClause: boolean;
  date?: IsoDate;              // for capacity counting; defaults to today
}

export interface CarrierOption {
  carrier: CarrierId;
  onTime: number;              // 0..1, fair data
  meanRate: number;            // USD
  n: number;
  score: number | null;        // null when blocked
  status: 'recommended' | 'backup' | 'eligible' | 'blocked';
  reason: string;              // block reason or ranking note
}

export interface CarrierRecommendation {
  carrier: CarrierId;
  backup: CarrierId;
  reason: string;              // e.g. "Carrier E for Northeast next-day: 97% on time vs 55% for F; $1.62 more per shipment"
  blocked: CarrierId[];
  options: CarrierOption[];
}

/** The five causes (f_addr, f_stock, f_cutoff, f_lane, f_route) and their sub-flags (SPEC §5.1). */
export type CauseFlag =
  | 'f_addr' | 'f_cutoff' | 'f_stock' | 'f_stock_out' | 'f_skip_nearest' | 'f_lane' | 'f_bad_lane' | 'f_d_friday' | 'f_route';

export interface DeliveryCauses {
  deliveryId: string;
  late: boolean;
  flags: Record<CauseFlag, boolean>;
  stages: string[];            // subset of Intake, Promise, Fulfilment, Carrier, Delivery, in that order
}

export interface WarehouseApi {
  checkPromise(commitment: Commitment, receivedAt: LocalTimestamp): PromiseResult;
  nearestWarehouse(clientId: string, region: Region): Promise<WarehouseId>;
  pickWarehouse(input: PickWarehouseInput): Promise<WarehouseChoice>;
}

export interface CarriersApi {
  recommendCarrier(input: RecommendInput): Promise<CarrierRecommendation>;
}

export interface DiagnosisApi {
  getDeliveryCauses(deliveryId: string): Promise<DeliveryCauses | null>;
}
```

### 1.1 After submission: D10 assistant and E19 address link (SPEC §5.16, §5.17; flags default off)

Not in the submitted build. Added in the PR that builds each feature, reviewed by all three resources.

```ts
// backend/api/src/modules/mcp/tools.ts (owner C): the one registry read by the MCP server and the assistant (REQ-ASK-02)
export interface ToolDef<I extends z.ZodRawShape = z.ZodRawShape> {
  name: 'overview' | 'delivery_causes' | 'scenario' | 'lane_scores' | 'recommend_carrier' | 'check_promise';
  title: string;
  description: string;
  input: I;                                // zod shape, validated before the handler runs (REQ-ASK-03)
  readOnly: true;
  run(args: z.infer<z.ZodObject<I>>): Promise<unknown>;   // aggregate figures and rules only (SEC-ASK-04)
}
export const TOOLS: readonly ToolDef[];

// backend/api/src/core/llm/types.ts (P3, owner A; change reviewed by A): one more method on LLM, used only by D10
export interface ToolChatRequest {
  system: string;
  messages: { role: 'user' | 'assistant' | 'tool'; content: string; toolCallId?: string; toolCalls?: ToolCall[] }[];
  tools: { name: string; description: string; parameters: object }[];   // JSON schema from each ToolDef.input
  tag: 'assistant';
  store: false;                            // SEC-ASK-03: no stored completion
}
export interface ToolCall { id: string; name: string; arguments: string }   // arguments: raw JSON from the model
export type ToolChatTurn = { kind: 'tool_calls'; calls: ToolCall[] } | { kind: 'final'; content: string };
// LLM gains: toolChat(req: ToolChatRequest): Promise<ToolChatTurn>   (recorded: keyed by a hash of the whole request)

// backend/api/src/modules/assistant/ (owner C)
export interface AssistantRequest {
  question: string;                        // 1..500 characters (SEC-ASK-01)
  history?: { role: 'user' | 'assistant'; text: string }[];   // at most 6, oldest first
}
export interface AssistantAnswer {
  questionId: string;                      // the id in the log line (NFR-ASK-02)
  answer: string;                          // plain text; the fixed refusal or "could not check" text when those apply
  refused: boolean;
  checked: boolean;                        // every figure found in a tool result (REQ-ASK-04)
  sources: { tool: ToolDef['name']; args: Record<string, unknown>; result: unknown }[];   // built by code (REQ-ASK-05)
  toolCalls: number;
  skipped: string[];                       // tool requests not run (REQ-ASK-03)
}

// backend/api/src/modules/intake/link.ts (owner A; built by C if A agrees, Q-LINK-01)
export interface LinkAddress { line1: string; line2: string | null; city: string; state: string; zip: string }
export interface LinkPin { lat: number; lon: number }
export interface LinkView {
  address: Partial<LinkAddress>;           // the email's address; missing parts absent
  pin: LinkPin | null;                     // the map's best match, null when there is none
  expiresAt: string;                       // ISO 8601 with offset
  synthetic: boolean;
  map: { kind: 'sas' | 'entra'; token: string; expiresAt: string };   // short-lived tile credential (SEC-LINK-08, Q-LINK-02)
}
export interface MapReading { line1: string | null; city: string | null; state: string | null; zip: string | null; distanceM: number }
export type LinkState = 'sent' | 'confirmed' | 'expired' | 'revoked';
```

## 2. Cross-area entry points

| Import from | Export | Owner | Real implementation lands in |
|---|---|---|---|
| `backend/api/src/modules/warehouse/index.ts` | `warehouseApi: WarehouseApi`, `diagnosisApi: DiagnosisApi` | B | B8 (warehouse), B9 (diagnosis) |
| `backend/api/src/modules/carriers/index.ts` | `carriersApi: CarriersApi`; `logOverride({ orderRef, from, to, reason, user }) → id` (the one writer of `override_log`, used by A's order review, E18) | C | C4; `logOverride` A14 |

B1 creates both files with **stubs** so A can build against them on day 1:
- `checkPromise` → promise = received date + 1 day, commitment unchanged, `downgraded: false`, `reason: null`
- `nearestWarehouse` → `{ Midwest: 'W1', Northeast: 'W4', Southeast: 'W3', West: 'W5' }[region]`
- `pickWarehouse` → nearest, reason `"stub"`, `warnClient: false`
- `recommendCarrier` → `{ carrier: 'A', backup: 'B', reason: 'stub', blocked: [], options: [] }`
- `getDeliveryCauses` → `null`

Nobody imports another area's internal files; only these two `index.ts` files.

## 3. Business rules both sides rely on (from the data)

- Promised date = order date + **1** day (same_day), **2** (next_day), **4** (standard), calendar days.
- Pick list: orders at or after **08:00** go on the next day's pick list.
- Honest promise (W1): same_day at or after 08:00 → commitment `next_day`, promise = order date + 2.
- Nearest warehouse by region: Northeast W4, Southeast W3, West W5; Midwest W1 **or** W2 per client
  (table `client_region_nearest`). Midwest partner pair: W1 ↔ W2.
- Bad carrier lanes (blocked every day): D→Midwest, D→Southeast, E→West, F→Northeast, F→Southeast. Carrier D on a
  Friday is a capacity problem: lane scoring leaves those shipments out, and `carrier_capacity.friday_limit` caps D.
- Route detour cause: actual route more than 20% over plan.
- Priority client: `account_tier == 'Tier 1'` or `account_status == 'threatening_to_leave'` (`isPriority()`).
- US state → region map: `backend/synthetic-data/reference/state_regions.json` (owner A, created in A2). Used by Python
  generators and by Node.

## 4. Tables written by Python (`backend/analytics/`)

Python creates and **replaces** these tables on every pipeline run (`if_exists="replace"`, one transaction). Node must
not create or alter them. Booleans are `boolean`, counts `bigint` (Node parses to number), rates `double precision`
in 0..1, money in USD.

| Table | Owner | Columns |
|---|---|---|
| `deliveries_clean` | B | every column of `deliveries.csv` + `dq_bad_dates`, `dq_dup_order_id` |
| `clients`, `carriers`, `warehouses` | B | copies of the supplied CSVs, same columns |
| `complaints` | A | copy of `complaints.csv` + `at_risk` (boolean) |
| `delivery_causes` | B | `delivery_id`, `client_id`, `order_channel`, `commitment_type`, `destination_region`, `carrier_id`, `late`, `f_addr`, `f_cutoff`, `f_stock`, `f_stock_out`, `f_skip_nearest`, `f_lane`, `f_bad_lane`, `f_d_friday`, `f_route`, `fair`, `stages` (comma-separated) |
| `dq_report` | B | `issue`, `count` |
| `kpis` | B | `key`, `value` — keys: `on_time`, `benchmark`, `deliveries`, `late`, `penalties_usd`, `handling_cost_usd`, `at_risk_accounts`, `at_risk_revenue_usd`, `pre_pickup_share` |
| `cause_summary` | B | `segment` (`all`/`email`/`at_risk`), `flag`, `label`, `stage`, `n`, `late_rate` |
| `scenario_results` | B | `scenario`, `label`, `grp` (`reference`/`area`/`as_built`/`phase2`/`adoption`), `segment` (`all`/`email`/`at_risk`/`aug_sep`), `on_time`, `late_avoided`, `cost_avoided` |
| `cause_attribution` | B | `cause`, `label`, `stage`, `deliveries`, `points_lost` (0..1), `share_of_lateness` (0..1) |
| `cause_kpis` | B | `cause`, `label`, `kpi`, `baseline`, `target`, `owner` |
| `accounts` | B | `client_id`, `client_name`, `account_tier`, `annual_revenue_usd`, `primary_order_channel`, `deliveries`, `on_time`, `main_cause`, `complaints` |
| `warehouse_region_distance` | B | `warehouse_id`, `region`, `miles` |
| `client_region_nearest` | B | `client_id`, `region`, `warehouse_id` |
| `warehouse_stats` | B | `warehouse_id`, `warehouse_name`, `orders`, `cutoff_misses`, `cutoff_late_rate`, `cutoff_before_11`, `out_of_stock`, `out_of_stock_late_rate`, `skipped_nearest`, `skipped_nearest_late_rate` |
| `penalty_reconciliation` | B | `delivery_id`, `client_id`, `account_tier`, `warehouse_id` (the site that shipped it), `days_late`, `promised_date`; most days late first |
| `stock_daily` | B (SD-05) | `date`, `warehouse_id`, `client_id`, `sku`, `qty`, `synthetic` |
| `placement_suggestions` | B (SD-05) | `week`, `client_id`, `sku`, `from_warehouse`, `to_warehouse`, `qty`, `reason`, `synthetic` |
| `placement_impact` | B (SD-05) | `week`, `suggestions`, `avoided_next_week`, `synthetic` |
| `lane_scores` | C | `region`, `commitment`, `carrier_id`, `n`, `on_time`, `mean_days_late`, `mean_rate`, `lane_median_late`, `blocked`, `block_reason`, `score_default`, `score_sla` |
| `carrier_capacity` | C (SD-06) | `carrier_id`, `region`, `daily_limit`, `friday_limit`, `synthetic` |
| `carrier_backtest` | C | `choice` (`actual`/`recommended`), `n`, `on_time`, `mean_rate` |
| `carrier_events` | C (SD-07) | `delivery_id`, `carrier_id`, `event` (`picked_up`/`in_transit`/`out_for_delivery`/`delivered`), `ts`, `source` (`api`/`portal`/`batch`), `synthetic` |
| `risk_lookup` | A | `f_addr`, `f_cutoff`, `f_stock`, `f_lane`, `n`, `late_rate` |

Pipeline order (`npm run pipeline`, i.e. `cd backend && python -m analytics.pipeline`): core (B) → warehouse (B) → carriers (C) → intake (A). Each area
module exposes `build(ctx) -> dict[str, DataFrame]`; later modules may read earlier tables from `ctx.tables`.

## 5. Tables written by Node (`backend/db/migrations/`)

| Range | Owner | Tables |
|---|---|---|
| `001–099` | B | `audit_log` |
| `100–199` | A | `client_domains`, `saved_addresses`, `intake_emails`, `intake_extractions`, `outbound_messages`, `inbound_orders`, `alerts`, `complaint_triage`, `intake_polls` (101: one row per Gmail check — trigger `schedule` \| `button`, query, started_at, finished_at, fetched, processed, retried, failed, ok, error); `address_confirm_tokens` and new `saved_addresses` columns (102, E19, after submission; below) |
| `200–299` | B | (none planned) |
| `300–399` | C | `recommendations`, `override_log` |

D10 (assistant) adds **no table**: questions and answers are not stored (SEC-ASK-03).

**Migration `102_address_links.sql`** (A; E19, SPEC §5.17). Reuses `saved_addresses` rather than a new
`client_addresses` table: the intake already reads it for matches and candidates.

| Table | Column | Type | Note |
|---|---|---|---|
| `address_confirm_tokens` | `id` | serial PK | |
| | `token_hash` | char(64) UNIQUE NOT NULL | SHA-256 hex of the token; the token itself is never stored (SEC-LINK-01) |
| | `email_id` | int NOT NULL → `intake_emails(id)` | the order's first email; one live link per order (REQ-LINK-08) |
| | `issued_at`, `expires_at` | timestamptz NOT NULL | lifetime rule in SPEC §5.17 |
| | `issued_by` | text NOT NULL | the operator's `sub` who sent the reply |
| | `used_at`, `revoked_at` | timestamptz | set once; a link with either set, or past `expires_at`, is invalid |
| | `prefill` | jsonb NOT NULL | the address and start pin shown on the page |
| | `confirmed_address` | jsonb | `LinkAddress`, set on confirmation |
| | `lat`, `lon` | double precision | the confirmed pin |
| | `map_reading` | jsonb | the reverse-geocoded reading shown at the second Confirm |
| | `map_lookups` | int NOT NULL DEFAULT 0 | capped at 20 (SEC-LINK-04) |
| | `synthetic` | boolean NOT NULL | true for every demo order |
| `saved_addresses` (new columns) | `source` | text NOT NULL DEFAULT `'seed'` | `seed` \| `link` |
| | `lat`, `lon` | double precision | from the confirmed pin |
| | `email_id` | int → `intake_emails(id)` | the order whose approval saved it |
| | `confirmed_at` | timestamptz | when the client confirmed it |

Index: `address_confirm_tokens (email_id) WHERE used_at IS NULL AND revoked_at IS NULL`. A `source = 'link'` row is
written only when the order is approved (REQ-LINK-05).

## 6. API JSON shapes

Served by `backend/api` (default `http://localhost:3001`); read by the dashboard screens in `frontend/components/dashboard/`.

All numbers are numbers (not strings). Rates are 0..1; the UI formats them. Panels backed by synthetic data include
`"synthetic": true`.

Who may call each route: `backend/api/src/core/permissions.ts` (SPEC-auth §4.2 for writes, §4.4 for reads). With
`AUTH_REQUIRED=on` a GET is open only to the roles of the pages that use it (REQ-AUTH-16); any other role gets
`403 { error: "forbidden" }`.

| Endpoint | Owner | Response |
|---|---|---|
| `GET /api/health` | B | `{ db: "ok" \| "down", llm: string, version: string }` |
| `GET /api/overview` | B | `{ onTime, benchmark, deliveries, late, penaltiesUsd, handlingCostUsd, atRiskAccounts, atRiskRevenueUsd, prePickupShare }` |
| `GET /api/causes?segment=all\|email\|at_risk` | B | `{ segment, causes: [{ flag, label, stage, n, lateRate }] }` |
| `GET /api/replay?segment=all\|email\|at_risk\|aug_sep` | B | `{ segment, scenarios: [{ scenario, label, grp, onTime, lateAvoided, costAvoided }] }` |
| `GET /api/attribution` | B | `{ causes: [{ cause, label, stage, deliveries, pointsLost, share }] }` |
| `GET /api/cause-kpis` | B | `{ kpis: [{ cause, label, kpi, baseline, target, owner }] }` |
| `GET /api/accounts` | B | `{ accounts: [{ clientId, clientName, tier, revenueUsd, channel, deliveries, onTime, mainCause, complaints }] }` |
| `GET /api/warehouses` | B | `{ warehouses: [{ warehouseId, name, orders, cutoffMisses, cutoffLateRate, cutoffBefore11, outOfStock, outOfStockLateRate, skippedNearest, skippedNearestLateRate }], secondPick: { movedOrders, onTime }, freightPerOrder: { nearest, otherSite }, distances: [{ warehouseId, region, miles }] }` |
| `GET /api/penalties/unpaid` | B | `{ count, byTier: [{ tier, n }], rows: [{ deliveryId, clientId, tier, daysLate, promisedDate }] }` (first 200 rows) |
| `GET /api/placement` | B | `{ synthetic: true, week, suggestions: [{ clientId, sku, from, to, qty, reason }], impact: [{ week, suggestions, avoidedNextWeek }] }` |
| `GET /api/carriers?region=&commitment=&sla=true\|false` | C | `{ region, commitment, recommendation: CarrierRecommendation }` |
| `GET /api/carriers/backtest` | C | `{ rows: [{ choice, n, onTime, meanRate }] }` |
| `GET /api/tracking?asOf=YYYY-MM-DD` | C | `{ synthetic: true, asOf, freshness: [{ carrier, source, lastEventAt }], atRisk: [{ deliveryId, carrier, promisedDate }] }` |
| `POST /api/recommend` | C | body `RecommendInput` → `CarrierRecommendation` |
| `POST /api/overrides` | C | body `{ orderRef, from, to, reason, user }` → `{ id }` (needs `x-api-key`) |
| `GET /api/intake` | A | `{ emails: [{ id, source, from, subject, receivedAt, clientId, status, decision, inReplyTo, priority }], pollMinutes, lastPoll: { trigger, startedAt, finishedAt, processed, retried, failed, ok } \| null }` — priority clients first; `pollMinutes` is 0 when the automatic check is off or Gmail is not set up; `status` RECEIVED \| WAITING \| AWAITING_APPROVAL \| APPROVED \| SENT \| ENTERED \| REJECTED. With `CONFIRM_LINK=on` each email also has `link: { state: LinkState, expiresAt } \| null` (newest link; `expired` is computed when read and shown as "Address not confirmed", REQ-LINK-06) |
| `GET /api/intake/:id` | A | `{ email: { id, source, from, subject, body, redactedBody, receivedAt, clientId, status, inReplyTo }, extraction, decision, checks: { address, promise, warehouse, carrier }, replyDraft, replySource }` — `redactedBody` is what the AI model saw; `replyDraft` has names put back (what would be sent). With `CONFIRM_LINK=on`: a `CONFIRM_ADDRESS` draft holds `[CONFIRM_LINK]`, and the response adds `link` as in `GET /api/intake` |
| `POST /api/intake/email` | A | body `{ from, subject, body, receivedAt, inReplyTo? }` → `{ id, status, decision, reason? }` (needs `x-api-key`); `status: WAITING`, `decision: null` when PII redaction or the model is unreachable (posting again retries); an unknown sender domain → status AWAITING_APPROVAL, decision MISSING_INFO, reason "unknown sender", with no PII or model call (E16) |
| `POST /api/intake/fetch` | A | body `{ query?, max? }` → `{ pollId, query, fetched, processed, retried, failed, ok, error, results: [{ id, status, decision }] }` — runs the same Gmail check as the timer (E15): waiting emails again, then new mail since the last successful check less 2 minutes; a message in a thread we hold is the client's answer (needs `x-api-key`; 503 without `GMAIL_*`; 409 while another check runs). The log line `intake fetched from Gmail` (and the timer's `gmail poll done`) carries `emailIds` (NFR-03) |
| `GET /api/intake/review` | A | `{ orders: [{ id, from, clientId, clientName, tier, priority, receivedAt, items, region, promiseDate, warehouseId, carrier, carrierReason, choices: [{ carrier, status, onTime, reason }], blocked }] }` — ALL_CLEAR orders awaiting approval, priority first; `choices` never holds a blocked carrier (E18). With `CONFIRM_LINK=on` each order adds `addressSource: "email" \| "saved" \| "link"` and, for `link`, `emailAddress`, `confirmedAddress` and `mapReading` (REQ-LINK-11) |
| `POST /api/intake/:id/action` | A | body `{ action: "approve" \| "reject" \| "send_reply" \| "send_to_wms", reply?, reason?, carrier? }` → `{ status }` (needs `x-api-key` while `AUTH_REQUIRED=off`); `send_reply` 403 off the allow-list, 503 without Gmail; `reject` needs `reason` (400) and only for an ALL_CLEAR order awaiting approval (status REJECTED); `approve` with a different `carrier` needs `reason` (400), refuses a blocked carrier (409) and logs `override_log` (via C's `logOverride`) with the signed-in user; the actor comes from the token, never the body. With `CONFIRM_LINK=on`: `send_reply` on a `CONFIRM_ADDRESS` email mints the link (the sent text holds it, `outbound_messages.body` keeps `[CONFIRM_LINK]`); `approve` of a link-confirmed order also writes the `saved_addresses` row (`source = 'link'`) |
| `POST /api/orders` | A | API order JSON `{ order_ref, client_id, ship_to, items }` → `201 { id, status, address }` or `422 { id, missing }` (needs `x-api-key`) |
| `POST /api/orders/edi` | A | text/plain body (simplified EDI 850) → `{ id, status: "accepted" \| "held", missing }` (needs `x-api-key`) |
| `GET /api/complaints` | A | `{ complaints: [{ complaintId, clientId, deliveryId, category, date, text, atRisk, tier, escalate, triage: { stages, prePickup, escalate, draft, source, at } \| null }] }` — escalations (Tier 1 or at-risk) first, then complaint id order; `triage` is the latest saved one |
| `POST /api/complaints/:id/triage` | A | → `{ complaintId, deliveryId, stages, prePickup, escalate, draft, source }` |
| `POST /api/alerts/run` | A | body `{ asOf }` → `{ drafted: number }` (needs `x-api-key`) |
| `POST /api/mcp` | C | MCP Streamable HTTP (stateless, JSON responses). Tools, all read-only: `overview`, `delivery_causes`, `scenario`, `lane_scores`, `recommend_carrier`, `check_promise`. Needs `Authorization: Bearer <MCP_TOKEN>`; 401 without it, 503 when `MCP_TOKEN` is unset. From D10 the tools come from `modules/mcp/tools.ts` (§1.1); nothing else changes |
| `POST /api/assistant` | C | *After submission (D10, SPEC §5.16).* body `AssistantRequest` → `AssistantAnswer`. Every role (SPEC-auth §4.2); `x-api-key` while `AUTH_REQUIRED=off`. 404 when `ASK_ASSISTANT` is off; 400 `{ error: "too_long" }` over 500 characters; 429 `{ error: "rate_limited" }`; 503 `{ error: "assistant_unavailable" }` when the model is unreachable or a recording is missing. Writes no table |
| `GET /api/confirm/:token` | A | *After submission (E19, SPEC §5.17).* Public, token-gated. → `LinkView`; 404 `{ error: "link_invalid" }` for an unknown, expired, used or revoked link, byte-identical in every case; 404 also when `CONFIRM_LINK` is off. Never uses up the link |
| `POST /api/confirm/:token` | A | *After submission (E19).* Public, token-gated; through the web proxy's `Origin` check. body `{ address: LinkAddress, pin: LinkPin, checkId? }` → `{ status: "confirmed" }`; 409 `{ error: "needs_second_confirm", reading: MapReading, checkId }` (REQ-LINK-03); 400 `{ error: "invalid" }` (SEC-LINK-10, link stays unused); 404 `link_invalid`; 429 `rate_limited` |

## 7. Environment variables (`.env.example`, owner B)

`DATABASE_URL`, `TEST_DATABASE_URL`, `PORT` (3001), `LLM_PROVIDER` (`azure-openai` \| `recorded`),
`AZURE_OPENAI_ENDPOINT` (v1 endpoint, ends `/openai/v1/`), `AZURE_OPENAI_API_KEY`,
`AZURE_OPENAI_DEPLOYMENT` (the deployment name in Foundry), `PII_PROVIDER` (`azure-language` \| `recorded`),
`AZURE_LANGUAGE_ENDPOINT`, `AZURE_LANGUAGE_KEY`, `ADDRESS_PROVIDER` (`azure-maps` \| `recorded`), `AZURE_MAPS_KEY`,
`RECORD` (`1` to save AI and map responses), `API_KEY`, `ALLOW_LIST` (comma-separated),
`GMAIL_ACCOUNT` (the demo inbox; the Gmail scripts refuse any other account), `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`,
`GMAIL_REFRESH_TOKEN` (from `npm --prefix backend/api run gmail:auth`; secret, reads the inbox),
`INTAKE_POLL_MINUTES` (default 10; how often the API checks Gmail by itself, 0 = off; tests set 0),
After submission (SPEC §5.16, §5.17; values are design settings, not data): `ASK_ASSISTANT` (`on` \| `off`, default off;
read by API and web), `ASK_MAX_TOOL_CALLS` (default 5), `ASK_RATE_PER_MINUTE` (default 10); `CONFIRM_LINK` (`on` \| `off`,
default off; API and web), `CONFIRM_LINK_HOURS` (default 24), `CONFIRM_LINK_RATE_PER_MINUTE` (default 10, web),
`AZURE_MAPS_CLIENT_ID` (API only: the Maps account id for the tile credential, Q-LINK-02). No `NEXT_PUBLIC_` variable is
added for either feature; the Maps key stays server-side (SEC-LINK-08).
`NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_API_KEY` (dashboard in `frontend/`; `next.config.mjs` loads the root `.env`; the demo key is visible in the browser, acceptable for synthetic data only).

## 8. Team rules

- Branches: `a/<topic>`, `b/<topic>`, `c/<topic>`. PR into `main`; squash-merge; CI must be green.
- A change to this file or to `backend/db/migrations/` needs a review from another resource.
- Every test names the acceptance criteria it covers, e.g. `it('AC-PRO-01: …')` / `def test_ac_diag_01_…`.
- Commit messages: `feat(a): …`, `fix(b): …`, `test(c): …`, `docs: …`.
- Never edit `Halcyon-Hackathon-Dataset/`. Never commit `.env` or anything under `backend/synthetic-data/out/`.
- Folders per resource: A owns `backend/analytics/intake`, `backend/api/src/modules/intake`, `frontend/components/dashboard/intake`, `frontend/app/dashboard/intake`; B owns `core` and `warehouse` in the same places plus `overview` and `replay` screens; C owns `carriers` (and `mcp`, and after submission `backend/api/src/modules/assistant` and `frontend/components/dashboard/assistant`). E19 sits in A's folders (`modules/intake/link.ts`, migration 102, `frontend/app/confirm/`), built by C only if A agrees (SPEC Q-LINK-01). Shared: `frontend/config/dashboard.ts` (screen list), `frontend/components/dashboard/ui.tsx`.

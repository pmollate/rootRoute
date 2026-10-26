# SPEC: Carrier Optimization Solver (Halcyon, Phase 1)

Status: ready to implement · Owner: Halcyon team · Stack: Python 3.11+, PostgreSQL, Azure Functions

---

## 0. Purpose

Turn the existing prototype in `Carrier_Optimizer/` into a tested, configurable solver that, once a day per warehouse, assigns every picklisted order to exactly one carrier at the lowest total expected cost, while never using a known-bad lane.

Target result (replay, Aug–Sep 2026, train Apr–Jul): on-time 71.0% → ~77.7%, cost per shipment $50.80 → ~$42.08, orders on blocked lanes 21% → 0%.

---

## 1. What is already in the repo

| File | What it is | Keep / change |
|---|---|---|
| `Carrier_Optimizer/carrier_optimizer.py` | Working prototype: lane-lookup risk, daily LP (SciPy HiGHS), greedy baselines, replay scoring | **Refactor** into the package in §7. Logic is the reference implementation. |
| `Carrier_Optimizer/halcyon_lane_scorecard.xlsx` | Lane scorecard (carrier × region) and carrier D weekday sheet | **Reference only.** Use as a regression fixture for §10. |
| `Carrier_Optimizer/Halcyon_Phase1_Carrier_Intelligence_Optimized.pdf` | Write-up: plan, scorecard, rules, true cost, optimizer, replay, Azure workflow, SQL | **Reference only.** Source of business rules. |

### Known gaps in the prototype (must fix)

1. **Hidden input.** It reads `c.pkl`, a prepared pickle that is not in the repo. Data prep must be rebuilt from raw CSVs (§3.2).
2. **Hard-coded paths** (`c.pkl`, `Halcyon-Hackathon-Dataset/clients.csv`). Move to config/CLI.
3. **Script, not a library.** All logic runs at import. Split into modules with pure functions.
4. **Hard-coded constants** (`BLOCK_P`, `D_FRI_CAP`, `SURGE`, `REDELIV`, `PENALTY`, `BIG`). Move to config (§6). Learn `REDELIV` and `PENALTY` from data where possible.
5. **Friday flag stands in for load.** `fri` is used as the overload signal. Keep for v1 (lookup); the risk-provider interface (§8) must allow a load-aware provider (ML model) later.
6. **No tests, no API, no logging.**

---

## 2. Definitions

| Term | Meaning |
|---|---|
| Lane | (carrier, destination_region) |
| Clean shipment | address_status = complete AND fulfilment_warehouse = nearest_warehouse AND NOT (same_day AND order hour ≥ 08) AND actual_route_km ≤ 1.2 × planned_route_km |
| Clean late rate | Late rate on clean shipments only. Isolates the carrier's own effect. |
| Late cost (per order) | $ lost if this order is late = redelivery (+ penalty if client has `sla_penalty_clause = Y`) |
| Expected cost (arc cost) | rate(carrier, region) + P(late) × late cost |
| Blocked arc | P(late) > `block_p`, or lane has fewer than `min_lane_n` clean shipments |
| Capacity | carrier's normal busy-day volume: p95 of daily shipments in train. D on Fridays: `d_fri_cap` |
| Surge | $ per order above capacity (spot booking). Makes capacity soft so the LP is always feasible. |
| Switch cost | $ friction for moving an order off its current carrier. Dial between "pure cost" (0) and "minimal disruption". |

---

## 3. Inputs

### 3.1 Raw files (from `Halcyon-Hackathon-Dataset/` or the same tables in PostgreSQL)

| File / table | Columns used |
|---|---|
| `deliveries.csv` / `shipments` | delivery_id, order_id, client_id, order_channel, order_received_ts, commitment_type, promised_date, address_status, shipped_ts, destination_region, nearest_warehouse_id, fulfilment_warehouse_id, distance_miles, carrier_id, carrier_rate_usd, planned_route_km, actual_route_km, delivered_date, days_late, on_time, redelivery_cost_usd |
| `clients.csv` / `clients` | client_id, account_tier, sla_penalty_clause |
| `sla_penalties.csv` / `sla_penalties` | delivery_id, penalty_usd |
| `carriers.csv` / `carriers` | carrier_id, has_api, delivery_event_feed, preferred_supplier_agreement (future use, §13) |

### 3.2 Data prep (replaces `c.pkl`) — `halcyon_carrier/data.py`

Must reproduce exactly:

1. Parse timestamps: `order_received_ts`, `shipped_ts`; dates: `promised_date`, `delivered_date`.
2. Drop rows where `delivered_date < shipped_ts.normalize()` → expect **450** rows dropped.
3. Drop duplicate `order_id`, keep first in file order → expect **21** dropped. Result: **47,869** rows.
4. `penalty` = sum of `sla_penalties.penalty_usd` per `delivery_id`, 0 if none.
5. `late` = (on_time == "N") as int; `fri` = shipped weekday == Friday; `day` = shipped_ts normalized.
6. `cutoff_miss` = same_day AND order hour ≥ `cutoff_hour`; `detour` = actual_route_km > 1.2 × planned_route_km (NaN → False); `wrong_wh` = nearest ≠ fulfilment.
7. `clean` per §2. Join `clients` for `sla_penalty_clause`, `account_tier`.
8. `late_cost` = `redelivery_cost` + `penalty_amount` × (clause == "Y").

Post-dispatch fields (`actual_route_km`, `delivered_date`, `days_late`) are allowed **only** for labels and the clean flag, never as decision inputs.

---

## 4. Outputs

### 4.1 `recommendations` (one row per order per run)

| Column | Type | Notes |
|---|---|---|
| run_id | uuid | one per (warehouse, day) run |
| delivery_id | text | PK with run_id |
| original_carrier | char(1) | carrier before optimization |
| recommended_carrier | char(1) | |
| expected_cost_usd | numeric | arc cost of the pick (excl. switch cost) |
| p_late | numeric | from the risk provider |
| moved | bool | recommended ≠ original |
| over_capacity | bool | assigned via surge |
| reason | text | e.g. `"B: expected $15.82, clean late 0%; F blocked on Southeast (47%)"` |
| provider | text | `lookup` or `ml:<model_version>` |
| config_hash | text | hash of the config used |

### 4.2 Replay report (CLI)

CSV + markdown with, per scenario: on_time, moved, cost_per_ship, freight, on_blocked_lane, model_obj_per_ship (same fields as the prototype's `score()`).

---

## 5. Algorithm

### 5.1 Learn parameters (train window only)

- `P[carrier, region, fri]` = clean late rate and count (from clean shipments).
- `RATE[carrier, region]` = mean `carrier_rate_usd`.
- `CAP[carrier]` = p95 of daily shipment count per carrier.
- `BASE[address_status, wrong_wh, cutoff_miss, detour]` = late rate on lanes with clean late rate ≤ 1% (used only by replay, §5.6).

### 5.2 Arc cost

```
p = P[car, region, fri]            # None if missing or count < min_lane_n
if p is None or p > block_p: cost = BIG
else:                        cost = RATE[car, region] + p * late_cost(order)
```

### 5.3 Daily LP (one per warehouse-day; the prototype solves one per day across warehouses)

Group the day's orders into segments `s = (region, late_cost, original_carrier)` with count `n_s`.

Variables: `x[s, c] ≥ 0` orders of segment s to carrier c; `o[c] ≥ 0` overflow above capacity.

```
minimize   Σ_s Σ_c x[s,c] · (arc_cost(c, s) + switch_cost · [c ≠ orig_s])  +  Σ_c surge · o[c]
subject to Σ_c x[s,c] = n_s                      for every segment s
           Σ_s x[s,c] − o[c] ≤ cap(c, fri)       for every carrier c
```

- `cap(c, fri)` = `d_fri_cap` if c == D and Friday, else `CAP[c]`.
- Solver: `scipy.optimize.linprog(method="highs")`. Must return status 0; otherwise raise.
- Integrality: transportation structure with integer RHS → LP optimum is integral. **Capacities must be integers** (floor them) or rounding can drop or double-assign orders. Assert every order gets exactly one carrier.

### 5.4 Map back to orders

Within a segment, fill the original carrier first, then others in fixed order A→F (deterministic).

### 5.5 Baselines (keep for comparison)

- `greedy_full`: per order in delivery_id order, cheapest arc + surge if over cap.
- `greedy_minimal`: keep original carrier if not blocked and under cap, else greedy.

### 5.6 Replay scoring (evaluation only)

For each order: if carrier unchanged, use actual `late`; if moved, use `BASE[cause profile]` (falls back to actual late). Cost = rate + late × late_cost; surge counted on carrier-day loads above cap. Report the §4.2 fields.

---

## 6. Config — `config.yaml`

| Key | Default | Note |
|---|---|---|
| data_dir | `./Halcyon-Hackathon-Dataset` | or `db_url` |
| train_end | `2026-08-01` | train < train_end ≤ test |
| cutoff_hour | 8 | pick-list cutoff |
| block_p | 0.30 | clean late rate that blocks a lane |
| min_lane_n | 50 | min clean shipments to trust a lane |
| d_fri_cap | 60 | highest proven-safe D Friday volume (assumption) |
| cap_quantile | 0.95 | |
| surge_cost | 5.0 | assumption; replace with real spot rates |
| switch_cost | 5.0 | recommended start; 0 = pure cost optimum |
| redelivery_cost | learned | mean redelivery on late shipments (~$34) |
| penalty_amount | 180.0 | contract amount per breach |
| big | 10000 | blocked-arc cost |

---

## 7. Target repo layout

```
Carrier_Optimizer/
  carrier_optimizer.py              # keep as reference (do not import)
  halcyon_lane_scorecard.xlsx       # reference / fixture
  Halcyon_Phase1_..._Optimized.pdf  # reference
halcyon_carrier/
  __init__.py
  config.py        # load + validate config.yaml, config_hash()
  data.py          # §3.2 load_and_clean(), split_train_test()
  params.py        # §5.1 learn_params(train) -> Params dataclass
  risk.py          # RiskProvider protocol, LookupRisk (v1), MLRisk stub (v2)
  cost.py          # arc_cost(), late_cost()
  solver.py        # §5.3–5.4 optimize_day()
  baselines.py     # §5.5 greedy_full(), greedy_minimal()
  replay.py        # §5.6 score(), run_replay()
  reasons.py       # human-readable reason strings
  io_db.py         # read today's orders, write recommendations (PostgreSQL)
  cli.py           # `halcyon-carrier replay|run --date --warehouse`
functions/
  daily_optimize/  # Azure Function, timer 08:00 per warehouse -> run()
  recommendations_api/  # HTTP GET /recommendations?warehouse&date
tests/
  test_data.py  test_params.py  test_solver.py  test_replay.py  test_regression.py
config.yaml
pyproject.toml   # numpy, pandas, scipy, pyyaml, psycopg[binary], pytest
```

---

## 8. Interfaces

```python
@dataclass(frozen=True)
class Params:
    p_lane: pd.DataFrame          # index (carrier, region, fri) -> mean, size
    rate: pd.Series               # index (carrier, region)
    cap: dict[str, int]
    base: pd.Series               # index (address_status, wrong_wh, cutoff_miss, detour)

class RiskProvider(Protocol):
    name: str
    def p_late(self, orders: pd.DataFrame, carrier: str, fri: bool) -> np.ndarray: ...
    # returns NaN where unknown (treated as blocked)

class LookupRisk:  # v1, reproduces the prototype
    def __init__(self, params: Params, min_lane_n: int): ...

class MLRisk:      # v2 hook: LightGBM model from carrier_recommender_ml.py (not in this zip)
    def __init__(self, model_path: str): ...   # raise NotImplementedError until wired

def optimize_day(orders: pd.DataFrame, params: Params, risk: RiskProvider,
                 cfg: Config, switch_cost: float | None = None) -> pd.DataFrame:
    """Returns one row per order: delivery_id, recommended_carrier, expected_cost_usd,
    p_late, moved, over_capacity, reason. Raises SolverError if status != 0."""

def run_replay(cfg: Config) -> pd.DataFrame: ...
def run(cfg: Config, day: date, warehouse: str) -> uuid.UUID: ...   # writes recommendations
```

Note: with `LookupRisk`, arc costs vary only by segment, so segment-level LP (§5.3) is exact. A per-order provider (`MLRisk`) needs per-order variables `x[i, c]`; implement `optimize_day` so it switches to per-order variables when the provider is per-order.

---

## 9. Runtime (Azure)

- **Timer Function `daily_optimize`**: 08:00 local per warehouse. Reads today's picklisted orders from PostgreSQL, loads `Params` (cached, rebuilt nightly), runs `optimize_day`, writes `recommendations`. Must finish in < 30 s per warehouse.
- **Fail-safe**: on solver error → write `greedy_minimal` picks with `provider = "fallback"`; on any other error → keep original carriers, log, alert.
- **HTTP Function `recommendations_api`**: `GET /recommendations?warehouse=W1&date=2026-10-26` → rows from §4.1.
- **Logging**: run_id, warehouse, n_orders, objective value, moved %, blocked arcs used (must be 0), runtime ms.

---

## 10. Tests and acceptance

### Unit / property (pytest)

- Data prep drops exactly 450 + 21 rows; 47,869 remain.
- `clean` flag matches §2 on hand-built rows.
- Arc cost: F→Southeast and E→West are blocked (`BIG`); A→Midwest is not.
- Solver: every order assigned exactly once; no blocked arc used whenever any feasible alternative exists; overflow only above capacity; result deterministic across runs.
- Switch cost monotonic: higher switch_cost → moved % never increases.
- Infeasible-looking day (demand > total capacity) still solves via surge.
- Capacities are integers.

### Regression (must match prototype, tolerance ±0.3 pts on rates, ±$0.30 on costs)

Train Apr–Jul, test Aug–Sep 2026:

| Scenario | on_time | moved | cost_per_ship |
|---|---|---|---|
| Today | 0.7103 | 0.000 | 50.80 |
| Greedy full | 0.7771 | 0.831 | 42.24 |
| Greedy minimal-change | 0.7776 | 0.238 | 43.09 |
| Optimizer switch $0 | 0.7770 | 0.840 | 42.08 |
| Optimizer switch $2 | 0.7765 | 0.542 | 42.34 |
| Optimizer switch $5 | 0.7769 | 0.231 | 43.13 |

Also check against `halcyon_lane_scorecard.xlsx` (full-period lane late % and clean late % within ±0.1 pts).

### Acceptance criteria

- `halcyon-carrier replay` reproduces the regression table.
- `halcyon-carrier run --date --warehouse` writes a complete `recommendations` set in < 30 s.
- 0% of orders on blocked lanes in every run.
- No hard-coded paths or constants outside `config.yaml`.
- All tests pass in CI.

---

## 11. Non-functional

- Deterministic: same inputs + config → identical output.
- Pure functions in `params`, `cost`, `solver`, `replay`; I/O only in `data`, `io_db`, `cli`, `functions/`.
- Type hints; `ruff` + `mypy` clean.

---

## 12. Assumptions to state in demos

- Surge $5 and switch $5 are placeholders.
- D Friday cap 60 is the highest proven-safe volume; real break point unknown (no data between 60 and 140/day).
- Replay estimates outcomes of moved orders; prove in production with shadow mode, then a pilot.
- Penalties in the source are ~30% under-recorded; the contract $180 is used.

---

## 13. Out of scope now (hooks only)

| Item | Hook |
|---|---|
| ML risk model (LightGBM, per-order, load-aware) | `MLRisk` in `risk.py`; per-order LP in `solver.py` |
| Weather / traffic / holidays | new features in `MLRisk` |
| Claims cost, accessorials | `cost.py` |
| Contract minimums (F preferred supplier), per-lane diversity caps | extra constraint rows in `solver.py` |
| Tender acceptance data | feature + capacity adjustment |
| Exploration (2–5% to 2nd-best), weekly retrain, drift alerts | `functions/` + monitoring |
| Staff overrides locked into the LP | fix `x[i, c] = 1` for locked orders |

---

## 14. Implementation order (for the agent)

1. `config.py`, `data.py` + `test_data.py` (row counts).
2. `params.py`, `risk.py` (`LookupRisk`), `cost.py` + unit tests.
3. `solver.py` (segment LP, integer caps, assertion) + property tests.
4. `baselines.py`, `replay.py`, `cli.py replay` + `test_regression.py`.
5. `reasons.py`; `io_db.py`; `cli.py run`.
6. Azure Functions + fail-safe + logging.
7. Leave `MLRisk` as a stub with `NotImplementedError` and a TODO pointing to `carrier_recommender_ml.py`.

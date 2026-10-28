# LateLens — Resource C (Carriers + deployment) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the carrier preference spreadsheet with lane rules computed on fair data (block D Midwest/Southeast, E West, F Northeast/Southeast; cap D on Fridays), recommend a carrier and backup with a reason for every order within capacity, show it on the Carriers screen with a backtest and synthetic tracking, and deploy the whole app to Azure.

**Architecture:** Python (`backend/analytics/carriers/`) computes `lane_scores`, `carrier_capacity`, `carrier_backtest` and `carrier_events`; Node (`backend/api/src/modules/carriers/`) looks them up, applies the capacity cap and serves the recommendation through `carriersApi` (CONTRACTS §2) and REST. C also owns Azure setup, the CD workflow, the MCP server and the smoke test.

**Tech Stack:** Python 3.12, pandas · Node 22, TypeScript, Fastify 5, zod 4, Vitest, `@modelcontextprotocol/sdk` (stretch) · Next.js 15 + React 19 (Carriers screen in `frontend/`) · Azure (App Service, Static Web Apps, PostgreSQL Flexible Server, Key Vault, Application Insights), GitHub Actions with OIDC · Playwright (stretch).

**Read first:** `docs/SPEC.md` §2.3, §5.2, §5.13, §5.14, §9.3, §12.1 (SD-06, SD-07); `docs/CONTRACTS.md` §1–2, §4 (C rows), §5 (300–399), §6 (C rows).

**Prototype status:** every block below ran before this plan was written. The lane rules reproduce SPEC §2.3 and block exactly the five bad lanes (D Midwest, D Southeast, E West, F Northeast, F Southeast); D's Friday overload is handled by a Friday capacity cap instead of a block; the recommender reproduces the spec's reason string exactly; the backtest lifts Aug–Sep from 71.3% to 78.2% (your teammate's ML branch reached about 78%). Database route tests, Azure, MCP over HTTP and Playwright could not run on the planning machine.

## Global Constraints

- Lane metrics use FAIR deliveries only (no address, stock or cut-off cause), leaving out carrier D's Friday shipments: those fail from overload, which the Friday cap fixes. Never block on raw late rate (REQ-CAR-02).
- Block rule exactly: fair n < 30, or fair late rate > 15%, or > 2 × lane median. Scores: 60/25/15 (default), 75/15/10 (SLA clause).
- Python computes every metric; Node only ranks, caps and phrases (SPEC §4.2).
- Synthetic capacity and tracking carry `synthetic = true` and show a "Synthetic data" badge on screen.
- No Azure password in GitHub: CD signs in with OIDC; app secrets live in Key Vault.
- Commit messages `feat(c): …`; tests name their ACs.
- **This Mac:** fix the npm cache once: `sudo chown -R $(id -u):$(id -g) ~/.npm`.

## File Structure (C creates or owns)

```
backend/analytics/carriers/{__init__,lanes,capacity,backtest,tracking}.py   backend/carrier-optimization-engine/ (teammate's ML work, already merged)
backend/analytics/tests/{test_carriers_lanes,test_capacity,test_backtest,test_tracking}.py
backend/synthetic-data/generators/{sd06_capacity,sd07_tracking}.py   requirements-ml.txt
backend/db/migrations/300_carriers.sql
backend/api/src/modules/carriers/{index,domain,queries,routes}.ts   backend/api/src/modules/mcp/routes.ts (stretch)
backend/api/test/carriers/{domain.test,lane.fixture}.ts  backend/api/test/routes/{carriers,backtest,tracking,mcp}.test.ts  backend/api/test/mcp.test.ts
frontend/components/dashboard/carriers/  frontend/app/dashboard/carriers/page.tsx  (Carriers screen)
frontend/playwright.config.ts  frontend/e2e/smoke.spec.ts (stretch)
infra/setup.sh  .github/workflows/cd.yml
```

## Schedule

| Day | Tasks | Depends on |
|---|---|---|
| Mon 26 | C1, C2 | B3 (`analytics` package with `fair` flag) on `main` |
| Tue 27 | C3, C4, C5 | B1 skeleton; A uses `carriersApi` once C4 merges |
| Wed 28 | C6, C7, **C8 (deploy by end of day)** | B and A routes on `main` |
| Thu 29 AM | C9 (stretch), C10 (stretch); deployment and backup video in the overview plan §6 | — |

---

### Task C1: Check the merged carrier optimizer

The `carrier_optimizer` branch is already merged into `main` and lives in `backend/carrier-optimization-engine/` (no `.DS_Store` or `.pyc` left). This task only keeps its heavy packages out of the main install.

**Files:**
- Create: `requirements-ml.txt`

- [x] **Step 1: Confirm the state.** `git ls-files backend/carrier-optimization-engine` lists `carrier_recommender_ml.py`, `carrier_risk_model.txt`, `model_report.md`, `replay_results.csv`; `git ls-files | grep -E '\.DS_Store|\.pyc'` prints nothing.

- [x] **Step 2: Its packages.** `requirements-ml.txt`:

```text
# Only for backend/carrier-optimization-engine (the LightGBM model). Not needed by the pipeline or CI.
lightgbm>=4.3
scipy>=1.11
scikit-learn>=1.4
```

- [x] **Step 3: Check.** `python -m pytest && ruff check backend/analytics` — Expected: still clean (the optimizer is outside the linted folders).

- [x] **Step 4: Commit.** `git add requirements-ml.txt && git commit -m "chore(c): separate requirements for the carrier optimizer"`

---

### Task C2: Lane scores and block rules (C1, C2)

**Files:**
- Create: `backend/analytics/carriers/lanes.py`
- Modify: `backend/analytics/carriers/__init__.py` (replaces B's stub)
- Test: `backend/analytics/tests/test_carriers_lanes.py`

**Interfaces:**
- Consumes: `ctx.d` with `fair`, `f_d_friday`, `late`, `days_late`, `carrier_rate_usd` (B3). The result must equal `BAD_LANES` in `backend/analytics/core/load.py`.
- Produces: `lane_metrics(d)`, `lane_scores(d)` → table `lane_scores` (72 rows: 4 regions × 3 commitments × 6 carriers) with columns of CONTRACTS §4; constants `MIN_N = 30`, `MAX_LATE = 0.15`, `MEDIAN_MULTIPLE = 2.0`, `WEIGHTS`.

- [x] **Step 1: Write the failing test** (AC-CAR-01, AC-CAR-02, the spec's Northeast next-day example):

```python
import pandas as pd
import pytest

from analytics.carriers import lanes


@pytest.fixture(scope="module")
def scores(d):
    return lanes.lane_scores(d)


def test_ac_car_01_fair_only(d, scores):
    assert int(scores.n.sum()) == int((d.fair & ~d.f_d_friday).sum())


def test_ac_car_02_exact_blocks(scores):
    blocked = {(r.carrier_id, r.region) for r in scores[scores.blocked].itertuples()}
    assert blocked == {("D", "Midwest"), ("D", "Southeast"), ("E", "West"), ("F", "Northeast"), ("F", "Southeast")}
    per_lane = scores[scores.blocked].groupby(["carrier_id", "region"]).commitment.nunique()
    assert (per_lane == 3).all()


def test_northeast_next_day_lane(scores):
    lane = scores.query("region == 'Northeast' and commitment == 'next_day'").set_index("carrier_id")
    assert round(lane.loc["E", "on_time"], 2) == 0.97 and round(lane.loc["F", "on_time"], 2) == 0.55
    assert lane.loc["E", "mean_rate"] - lane.loc["F", "mean_rate"] == pytest.approx(1.62, abs=0.005)
    assert lane.score_default.idxmax() == "E"
    assert pd.isna(lane.loc["F", "score_default"]) and not lane.loc["D", "blocked"]
```

- [x] **Step 2: Run it.** `python -m pytest backend/analytics/tests/test_carriers_lanes.py` — Expected: FAIL, `ImportError: cannot import name 'lanes'`.

- [x] **Step 3: Implement** `backend/analytics/carriers/lanes.py`:

```python
"""Lane scores and block rules on FAIR data (SPEC §5.2, C1-C2).

Carrier D's Friday shipments are left out of lane scoring: D is reliable in the Northeast and West on other days, and
its Friday failures come from overload (39% of Friday volume), which the Friday capacity cap fixes (SPEC §5.2).
"""
import numpy as np
import pandas as pd

LANE = ["region", "commitment"]
WEIGHTS = {"score_default": (0.60, 0.25, 0.15), "score_sla": (0.75, 0.15, 0.10)}
MIN_N = 30
MAX_LATE = 0.15
MEDIAN_MULTIPLE = 2.0


def lane_metrics(d: pd.DataFrame) -> pd.DataFrame:
    fair = d[d.fair & ~d.f_d_friday]
    g = fair.groupby(["destination_region", "commitment_type", "carrier_id"]).agg(
        n=("late", "size"),
        late=("late", "mean"),
        mean_days_late=("days_late", lambda s: s.clip(lower=0).mean()),
        mean_rate=("carrier_rate_usd", "mean"),
    ).reset_index().rename(columns={"destination_region": "region", "commitment_type": "commitment"})
    g["on_time"] = 1 - g.late
    g["lane_median_late"] = g.groupby(LANE).late.transform("median")
    return g


def block_reason(row: pd.Series) -> str:
    if row.n < MIN_N:
        return f"only {row.n} fair deliveries"
    if row.late > MAX_LATE:
        return f"{row.late:.0%} late on fair data (limit {MAX_LATE:.0%})"
    if row.late > MEDIAN_MULTIPLE * row.lane_median_late:
        return f"{row.late:.0%} late, over {MEDIAN_MULTIPLE:.0f}x the lane median {row.lane_median_late:.0%}"
    return ""


def _minmax(s: pd.Series) -> pd.Series:
    span = s.max() - s.min()
    return (s - s.min()) / span if span > 0 else s * 0.0


def lane_scores(d: pd.DataFrame) -> pd.DataFrame:
    g = lane_metrics(d)
    g["block_reason"] = g.apply(block_reason, axis=1)
    g["blocked"] = g.block_reason.ne("")
    for col in WEIGHTS:
        g[col] = np.nan
    for _, lane in g.groupby(LANE):
        ok = lane[~lane.blocked]
        for col, (w_on, w_days, w_cost) in WEIGHTS.items():
            score = 100 * (w_on * ok.on_time + w_days * (1 - _minmax(ok.mean_days_late)) + w_cost * (1 - _minmax(ok.mean_rate)))
            g.loc[ok.index, col] = score
    cols = ["region", "commitment", "carrier_id", "n", "on_time", "mean_days_late", "mean_rate", "lane_median_late",
            "blocked", "block_reason", "score_default", "score_sla"]
    return g[cols].sort_values(["region", "commitment", "carrier_id"]).reset_index(drop=True)
```

and `backend/analytics/carriers/__init__.py`:

```python
"""Carriers pipeline step (owner C)."""
import pandas as pd

from analytics.carriers import lanes
from analytics.core.context import Ctx


def build(ctx: Ctx) -> dict[str, pd.DataFrame]:
    d = ctx.d
    return {
        "lane_scores": lanes.lane_scores(d),
    }
```

- [x] **Step 4: Run.** `python -m pytest && npm run pipeline:test` — Expected: 3 new tests pass; `lane_scores` written.

- [x] **Step 5: Commit.** `git add backend/analytics && git commit -m "feat(c): lane scores and block rules on fair data"`

---

### Task C3: Synthetic carrier capacity contracts and the Friday cap (SD-06, C10, C11)

**Files:**
- Create: `backend/analytics/carriers/capacity.py`, `backend/synthetic-data/generators/sd06_capacity.py`
- Modify: `backend/analytics/carriers/__init__.py`
- Test: `backend/analytics/tests/test_capacity.py`

**Interfaces:**
- Produces: table `carrier_capacity` (24 rows: carrier × region, `daily_limit = ceil(1.1 × p95 of daily volume on days other than Friday)`, `friday_limit = daily_limit` so D is held at its normal level on Fridays, `synthetic = true`).

- [x] **Step 1: Write the failing test** (includes AC-CAR-08 at data level: every D `friday_limit` is below D's observed Friday peak):

```python
from analytics.carriers import capacity


def test_capacity_positive_and_synthetic(d):
    cap = capacity.carrier_capacity(d)
    assert len(cap) == 24 and (cap.daily_limit > 0).all() and cap.synthetic.all()


def test_ac_car_08_friday_cap_holds_d_at_its_weekday_level(d):
    cap = capacity.carrier_capacity(d).set_index(["carrier_id", "region"])
    fri = d[d.order_received_ts.dt.day_of_week.eq(4) & d.carrier_id.eq("D")]
    friday_peak = fri.groupby([fri.shipped_ts.dt.date, "destination_region"]).size().groupby("destination_region").max()
    for region, peak in friday_peak.items():
        assert cap.loc[("D", region), "friday_limit"] < peak
```

- [x] **Step 2: Run.** Expected: FAIL, `ImportError`.

- [x] **Step 3: Implement:**

```python
"""SD-06 synthetic carrier capacity contracts (SPEC §12.1), from observed daily volume on days other than Friday.

friday_limit caps every carrier at its normal daily level, so Friday overflow goes to the next carrier (SPEC §5.2).
"""
import numpy as np
import pandas as pd

HEADROOM = 1.10


def carrier_capacity(d: pd.DataFrame) -> pd.DataFrame:
    weekdays = d[d.order_received_ts.dt.day_of_week.ne(4)]
    daily = weekdays.groupby([weekdays.shipped_ts.dt.date, "carrier_id", "destination_region"]).size().rename("n").reset_index()
    p95 = daily.groupby(["carrier_id", "destination_region"]).n.quantile(0.95).reset_index()
    p95["daily_limit"] = np.ceil(p95.n * HEADROOM).astype(int)
    p95["friday_limit"] = p95.daily_limit
    p95["synthetic"] = True
    return p95.rename(columns={"destination_region": "region"})[["carrier_id", "region", "daily_limit", "friday_limit", "synthetic"]]
```

```python
"""SD-06: synthetic carrier capacity contracts (owner C). The pipeline builds the same table in memory.

Run from the repo root:  python backend/synthetic-data/generators/sd06_capacity.py
"""
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BACKEND))

from analytics.carriers.capacity import carrier_capacity  # noqa: E402
from analytics.core.load import load  # noqa: E402

OUT = BACKEND / "synthetic-data" / "out"

if __name__ == "__main__":
    d, _ = load()
    OUT.mkdir(parents=True, exist_ok=True)
    carrier_capacity(d).to_csv(OUT / "carrier_capacity.csv", index=False)
    print(f"wrote {OUT / 'carrier_capacity.csv'}")
```

`backend/analytics/carriers/__init__.py`:

```python
"""Carriers pipeline step (owner C)."""
import pandas as pd

from analytics.carriers import capacity, lanes
from analytics.core.context import Ctx


def build(ctx: Ctx) -> dict[str, pd.DataFrame]:
    d = ctx.d
    return {
        "lane_scores": lanes.lane_scores(d),
        "carrier_capacity": capacity.carrier_capacity(d),
    }
```

- [x] **Step 4: Run.** `python -m pytest && python backend/synthetic-data/generators/sd06_capacity.py` — Expected: pass; `backend/synthetic-data/out/carrier_capacity.csv` written.

- [x] **Step 5: Commit.** `git add backend/analytics backend/synthetic-data/generators && git commit -m "feat(c): synthetic carrier capacity contracts (SD-06)"`

---

### Task C4: Recommender in Node (C3, C4, C6) — replaces the stub A is using

**Files:**
- Create: `backend/api/src/modules/carriers/domain.ts`, `backend/api/src/modules/carriers/queries.ts`, `backend/api/src/modules/carriers/routes.ts`, `backend/db/migrations/300_carriers.sql`
- Modify: `backend/api/src/modules/carriers/index.ts` (stub → real)
- Test: `backend/api/test/carriers/lane.fixture.ts`, `backend/api/test/carriers/domain.test.ts`, `backend/api/test/routes/carriers.test.ts` (needs test database)

**Interfaces:**
- Consumes: tables `lane_scores`, `carrier_capacity`, `recommendations`.
- Produces: `LaneRow`, `isFriday(date)`, `rankLane(rows, slaClause)`, `applyCapacity(ranked, usedToday, limits)`, `allocateBatch(n, ranked, limits)`, `reasonFor(best, rows)`, `recommendFromLane(rows, slaClause, usedToday?, limits?) -> CarrierRecommendation`; real `carriersApi.recommendCarrier(input)` (uses `friday_limit` on Fridays, logs to `recommendations` for daily capacity counts); `laneRows(region, commitment)` (also used by MCP); endpoints `GET /api/carriers`, `GET /api/carriers/backtest`, `GET /api/tracking`, `POST /api/recommend`, `POST /api/overrides` (backtest and tracking return data after C5 and C6).

- [x] **Step 1: Write the failing tests** (AC-CAR-03, -04, -06, -07, -08):

```ts
import type { LaneRow } from '../../src/modules/carriers/domain.js';

// Northeast next-day lane as computed by analytics/carriers/lanes.py on the supplied data (D's Friday shipments excluded).
const base = { region: 'Northeast', commitment: 'next_day', mean_days_late: 0.1, block_reason: '' } as const;
export const NE_NEXT_DAY: LaneRow[] = [
  { ...base, carrier_id: 'A', n: 617, on_time: 0.955, mean_rate: 14.945, blocked: false, score_default: 85.488, score_sla: 88.815 },
  { ...base, carrier_id: 'B', n: 582, on_time: 0.938, mean_rate: 14.426, blocked: false, score_default: 62.732, score_sla: 74.657 },
  { ...base, carrier_id: 'C', n: 398, on_time: 0.962, mean_rate: 16.043, blocked: false, score_default: 82.592, score_sla: 87.085 },
  { ...base, carrier_id: 'D', n: 338, on_time: 0.95, mean_rate: 12.28, blocked: false, score_default: 77.731, score_sla: 84.677 },
  { ...base, carrier_id: 'E', n: 309, on_time: 0.968, mean_rate: 12.835, blocked: false, score_default: 95.846, score_sla: 96.098 },
  { ...base, carrier_id: 'F', n: 445, on_time: 0.546, mean_rate: 11.219, blocked: true, block_reason: '45% late on fair data (limit 15%)', score_default: null, score_sla: null },
];
```

```ts
import { describe, expect, it } from 'vitest';
import { allocateBatch, isFriday, rankLane, recommendFromLane } from '../../src/modules/carriers/domain.js';
import { NE_NEXT_DAY } from './lane.fixture.js';

describe('carrier recommendation', () => {
  it('AC-CAR-03: Northeast next-day recommends E with a backup and a reason', () => {
    const rec = recommendFromLane(NE_NEXT_DAY, false);
    expect(rec.carrier).toBe('E');
    expect(rec.backup).not.toBe('E');
    expect(rec.backup).not.toBe('F');
    expect(rec.reason).toBe('Carrier E for Northeast next-day: 97% on time vs 55% for F; $1.62 more per shipment');
    expect(rec.blocked).toEqual(['F']);
  });

  it('uses SLA weights for clients with a penalty clause', () => {
    expect(rankLane(NE_NEXT_DAY, true).map((r) => r.carrier_id).slice(0, 3)).toEqual(['E', 'A', 'C']);
  });

  it('AC-CAR-04: with a 40% share no carrier takes more than 40 of 100 orders', () => {
    const ranked = rankLane(NE_NEXT_DAY, false);
    const limits = { A: 40, B: 40, C: 40, D: 40, E: 40 };
    const used = allocateBatch(100, ranked, limits);
    expect(Math.max(...Object.values(used).map(Number))).toBeLessThanOrEqual(40);
    expect(Object.values(used).reduce((a, b) => a + (b ?? 0), 0)).toBe(100);
  });

  it('AC-CAR-08: on a Friday, D at its Friday limit is skipped and the order overflows to the next carrier', () => {
    expect(isFriday('2026-09-18')).toBe(true);
    expect(isFriday('2026-09-17')).toBe(false);
    const dFirst = NE_NEXT_DAY.map((r) => (r.carrier_id === 'D' ? { ...r, score_default: 99 } : r));
    const rec = recommendFromLane(dFirst, false, { D: 19 }, { D: 19 });
    expect(rec.carrier).toBe('E');
    expect(rec.options.find((o) => o.carrier === 'D')?.reason).toBe('at daily capacity');
  });

  it('AC-CAR-07: contract capacity N caps the favoured carrier at N', () => {
    const used = allocateBatch(35, rankLane(NE_NEXT_DAY, false), { E: 25 });
    expect(used.E).toBe(25);
    expect(used.A).toBe(10);
  });
});
```

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { pool, query } from '../../src/core/db/pool.js';
import { buildApp } from '../../src/server.js';
import { hasDb } from '../db.js';

describe.skipIf(!hasDb)('carrier routes (needs test database)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => pool.end());

  it('AC-CAR-03 through the API', async () => {
    const r = (await app.inject({ method: 'GET', url: '/api/carriers?region=Northeast&commitment=next_day' })).json();
    expect(r.recommendation.reason).toBe('Carrier E for Northeast next-day: 97% on time vs 55% for F; $1.62 more per shipment');
  });

  it('AC-CAR-06: an override is logged with order, from, to, reason and user', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/overrides', headers: { 'x-api-key': 'test-key' },
      payload: { orderRef: 'ORD-1', from: 'E', to: 'A', reason: 'client asked for A', user: 'ops' } });
    expect(res.statusCode).toBe(200);
    const [row] = await query('SELECT order_ref, from_carrier, to_carrier, reason, user_name FROM override_log WHERE id = $1', [res.json().id]);
    expect(row).toEqual({ order_ref: 'ORD-1', from_carrier: 'E', to_carrier: 'A', reason: 'client asked for A', user_name: 'ops' });
  });
});
```

- [x] **Step 2: Run.** `npm --prefix backend/api test -- test/carriers` — Expected: FAIL, cannot find `domain.js`.

- [x] **Step 3: Implement.** Migration and domain logic:

```sql
-- Owner C. Carrier recommendation log and operator overrides (CONTRACTS §5).
CREATE TABLE recommendations (
  id serial PRIMARY KEY,
  order_ref text,
  region text NOT NULL,
  commitment text NOT NULL,
  carrier text NOT NULL,
  backup text NOT NULL,
  reason text NOT NULL,
  for_date text NOT NULL,                -- "YYYY-MM-DD", used for daily capacity counts
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recommendations_day ON recommendations (for_date, region, carrier);

CREATE TABLE override_log (
  id serial PRIMARY KEY,
  order_ref text NOT NULL,
  from_carrier text NOT NULL,
  to_carrier text NOT NULL,
  reason text NOT NULL,
  user_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

```ts
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
```

Queries, the real `carriersApi`, routes:

```ts
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
```

```ts
// Public entry point of the Carriers area (CONTRACTS §2). Other areas import only this file.
import type { CarriersApi } from '../../core/contracts.js';
import { isFriday, recommendFromLane } from './domain.js';
import { capacityLimits, laneRows, logRecommendation, usedToday } from './queries.js';

export const carriersApi: CarriersApi = {
  async recommendCarrier({ region, commitment, slaClause, date }) {
    const day = date ?? new Date().toISOString().slice(0, 10);
    const limits = await capacityLimits(region, isFriday(day));
    const rec = recommendFromLane(await laneRows(region, commitment), slaClause, await usedToday(region, day), limits);
    await logRecommendation({ orderRef: null, region, commitment, carrier: rec.carrier, backup: rec.backup, reason: rec.reason, date: day });
    return rec;
  },
};
```

```ts
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireApiKey } from '../../core/auth.js';
import { carriersApi } from './index.js';
import { recommendFromLane } from './domain.js';
import { backtestRows, insertOverride, laneRows, tracking } from './queries.js';

const Region = z.enum(['Midwest', 'Northeast', 'Southeast', 'West']);
const Commitment = z.enum(['same_day', 'next_day', 'standard']);
const RecommendBody = z.object({ region: Region, commitment: Commitment, slaClause: z.boolean(), date: z.string().optional() });
const OverrideBody = z.object({ orderRef: z.string().min(1), from: z.string().min(1), to: z.string().min(1), reason: z.string().min(3), user: z.string().min(1) });

const routes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: { region?: string; commitment?: string; sla?: string } }>('/carriers', async (req, reply) => {
    const region = Region.safeParse(req.query.region ?? 'Northeast');
    const commitment = Commitment.safeParse(req.query.commitment ?? 'next_day');
    if (!region.success || !commitment.success) return reply.code(400).send({ error: 'bad region or commitment' });
    const rows = await laneRows(region.data, commitment.data);
    return { region: region.data, commitment: commitment.data, recommendation: recommendFromLane(rows, req.query.sla === 'true') };
  });

  app.get('/carriers/backtest', async () => backtestRows());

  app.get<{ Querystring: { asOf?: string } }>('/tracking', async (req, reply) => {
    const asOf = req.query.asOf ?? '2026-09-10';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return reply.code(400).send({ error: 'asOf must be YYYY-MM-DD' });
    return tracking(asOf);
  });

  app.post('/recommend', async (req, reply) => {
    const body = RecommendBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.message });
    return carriersApi.recommendCarrier(body.data);
  });

  app.post('/overrides', { preHandler: requireApiKey }, async (req, reply) => {
    const body = OverrideBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.message });
    return { id: await insertOverride(body.data) };
  });
};

export default routes;
```

- [x] **Step 4: Run.** `npm run migrate:test && npm --prefix backend/api test && npm --prefix backend/api run lint` — Expected: domain tests 5 passed; route tests pass with the test database.

- [x] **Step 5: Commit and tell A** the real `carriersApi` is on `main`. `git add backend/api backend/db && git commit -m "feat(c): carrier recommender with capacity cap, overrides"`

---

### Task C5: Backtest (C7)

**Files:**
- Create: `backend/analytics/carriers/backtest.py`
- Modify: `backend/analytics/carriers/__init__.py`
- Test: `backend/analytics/tests/test_backtest.py`, `backend/api/test/routes/backtest.test.ts` (needs test database)

**Interfaces:**
- Produces: table `carrier_backtest` (`actual` vs `recommended`, Aug–Sep, with on-time and mean rate). Friday orders never go to D in the recommended plan. Prototype result: 71.3% → 78.2%, mean rate $15.23 → $13.03.

- [x] **Step 1: Write the failing tests** (AC-CAR-05):

```python
from analytics.carriers import backtest


def test_ac_car_05_backtest(d):
    bt = backtest.backtest(d).set_index("choice")
    assert set(bt.index) == {"actual", "recommended"}
    assert bt.loc["recommended", "on_time"] > bt.loc["actual", "on_time"]
```

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { pool } from '../../src/core/db/pool.js';
import { buildApp } from '../../src/server.js';
import { hasDb } from '../db.js';

describe.skipIf(!hasDb)('backtest route (needs test database)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => pool.end());

  it('AC-CAR-05 through the API', async () => {
    const r = (await app.inject({ method: 'GET', url: '/api/carriers/backtest' })).json();
    expect(r.rows.map((x: { choice: string }) => x.choice)).toEqual(['actual', 'recommended']);
  });
});
```

- [x] **Step 2: Run.** Expected: FAIL, `ImportError`.

- [x] **Step 3: Implement:**

```python
"""C7 backtest: lane rules trained on Apr-Jul, tested on Aug-Sep (SPEC §5.2).

Friday orders never go to carrier D in the recommended plan (the Friday cap moves D's overflow to the next carrier).
"""
import pandas as pd

from analytics.carriers.lanes import lane_scores

SPLIT = pd.Timestamp("2026-08-01")
KEY = ["destination_region", "commitment_type", "carrier_id", "f_addr", "f_stock", "f_cutoff"]
LANE = ["destination_region", "commitment_type"]


def _best(lanes: pd.DataFrame) -> pd.DataFrame:
    ok = lanes[~lanes.blocked].sort_values("score_default", ascending=False).drop_duplicates(["region", "commitment"])
    return ok.rename(columns={"region": "destination_region", "commitment": "commitment_type", "carrier_id": "rec"})[
        [*LANE, "rec", "mean_rate"]]


def backtest(d: pd.DataFrame) -> pd.DataFrame:
    train, test = d[d.order_received_ts < SPLIT], d[d.order_received_ts >= SPLIT]
    lanes = lane_scores(train)
    any_day = _best(lanes)
    friday = _best(lanes[lanes.carrier_id.ne("D")])
    is_fri = test.order_received_ts.dt.day_of_week.eq(4)
    t = pd.concat([test[~is_fri].merge(any_day, on=LANE, how="left"), test[is_fri].merge(friday, on=LANE, how="left")],
                  ignore_index=True)
    # Estimate each order's late chance on the recommended carrier from train orders of the same lane, carrier and
    # pre-pickup causes; Friday D overload is not in that estimate because the plan never puts D on a Friday.
    lookup = train[~train.f_d_friday].groupby(KEY).late.mean()
    lane_mean = train[~train.f_d_friday].groupby([*LANE, "carrier_id"]).late.mean()
    rec = t[KEY].assign(carrier_id=t.rec)
    est = pd.Series(lookup.reindex(pd.MultiIndex.from_frame(rec[KEY])).to_numpy(), index=t.index)
    fallback = lane_mean.reindex(pd.MultiIndex.from_frame(rec[[*LANE, "carrier_id"]])).to_numpy()
    est = est.fillna(pd.Series(fallback, index=t.index))
    return pd.DataFrame([
        {"choice": "actual", "n": len(t), "on_time": 1 - t.late.mean(), "mean_rate": t.carrier_rate_usd.mean()},
        {"choice": "recommended", "n": len(t), "on_time": 1 - est.mean(), "mean_rate": t.mean_rate.mean()},
    ])
```

```python
"""Carriers pipeline step (owner C)."""
import pandas as pd

from analytics.carriers import backtest, capacity, lanes
from analytics.core.context import Ctx


def build(ctx: Ctx) -> dict[str, pd.DataFrame]:
    d = ctx.d
    return {
        "lane_scores": lanes.lane_scores(d),
        "carrier_capacity": capacity.carrier_capacity(d),
        "carrier_backtest": backtest.backtest(d),
    }
```

- [x] **Step 4: Run.** `python -m pytest && npm run pipeline:test && npm --prefix backend/api test -- test/routes/backtest` — Expected: pass.

- [x] **Step 5: Commit.** `git add backend/analytics backend/api && git commit -m "feat(c): Apr-Jul / Aug-Sep backtest of lane rules"`

**Tuesday check-in:** `carriersApi` real; `/api/carriers?region=Northeast&commitment=next_day` returns the spec's reason string.

---

### Task C6: Synthetic tracking feeds and adapters (SD-07, C8)

**Files:**
- Create: `backend/analytics/carriers/tracking.py`, `backend/synthetic-data/generators/sd07_tracking.py`
- Modify: `backend/analytics/carriers/__init__.py` (final)
- Test: `backend/analytics/tests/test_tracking.py`, `backend/api/test/routes/tracking.test.ts` (needs test database)

**Interfaces:**
- Produces: feed files in `backend/synthetic-data/out/tracking/` (JSON lines for A–C, weekly portal HTML for D, weekly CSV for E–F; ~15 MB, gitignored); `events(d)`, `write_feeds(d, out)`, `read_feeds(out)`; table `carrier_events` (193,360 rows, `synthetic = true`). `/api/tracking?asOf=` (C4) now returns freshness per carrier and deliveries at risk.

- [x] **Step 1: Write the failing tests** (AC-TRK-01, AC-TRK-02):

```python
from analytics.carriers import tracking


def test_ac_trk_01_roundtrip(d, tmp_path):
    sample = d.sample(600, random_state=1)
    tracking.write_feeds(sample, tmp_path)
    ev = tracking.read_feeds(tmp_path)
    assert set(ev.source) == {"api", "portal", "batch"}
    counts = ev.groupby("delivery_id").event.nunique()
    assert len(counts) == 600 and (counts == 4).all()
    picked = ev[ev.event.eq("picked_up")].set_index("delivery_id").ts
    assert (picked.sort_index() == sample.set_index("delivery_id").shipped_ts.sort_index()).all()
```

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { pool, query } from '../../src/core/db/pool.js';
import { buildApp } from '../../src/server.js';
import { hasDb } from '../db.js';

describe.skipIf(!hasDb)('tracking route (needs test database)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => pool.end());

  it('AC-TRK-02: a delivery promised 2026-09-10 and delivered later is at risk at end of 2026-09-10', async () => {
    const [late] = await query<{ delivery_id: string }>(
      "SELECT delivery_id FROM deliveries_clean WHERE promised_date::date = '2026-09-10' AND delivered_date::date > '2026-09-10' LIMIT 1");
    const r = (await app.inject({ method: 'GET', url: '/api/tracking?asOf=2026-09-10' })).json();
    expect(r.synthetic).toBe(true);
    expect(r.atRisk.map((a: { deliveryId: string }) => a.deliveryId)).toContain(late.delivery_id);
  });
});
```

- [x] **Step 2: Run.** Expected: FAIL, `ImportError`.

- [x] **Step 3: Implement:**

```python
"""SD-07 synthetic carrier tracking feeds and adapters (SPEC §5.13, C8).

Each carrier publishes events in its own style: JSON lines (A, B, C), weekly portal HTML pages (D), weekly batch CSV
files (E, F). Adapters normalise all three into one carrier_events table.
"""
import json
import re
from pathlib import Path

import pandas as pd

BACKEND = Path(__file__).resolve().parents[2]
OUT = BACKEND / "synthetic-data" / "out" / "tracking"
API, PORTAL, BATCH = ["A", "B", "C"], ["D"], ["E", "F"]


def events(d: pd.DataFrame) -> pd.DataFrame:
    base = d[["delivery_id", "carrier_id", "shipped_ts", "delivered_date"]]
    parts = [
        base.assign(event="picked_up", ts=base.shipped_ts),
        base.assign(event="in_transit", ts=base.shipped_ts + pd.Timedelta(hours=6)),
        base.assign(event="out_for_delivery", ts=base.delivered_date + pd.Timedelta(hours=8)),
        base.assign(event="delivered", ts=base.delivered_date + pd.Timedelta(hours=14)),
    ]
    out = pd.concat(parts)[["delivery_id", "carrier_id", "event", "ts"]]
    return out.sort_values(["carrier_id", "ts", "delivery_id"]).reset_index(drop=True)


def write_feeds(d: pd.DataFrame, out: Path = OUT) -> Path:
    ev = events(d)
    ev["stamp"] = ev.ts.dt.strftime("%Y-%m-%d %H:%M")
    ev["week"] = ev.ts.dt.strftime("%G-W%V")
    out.mkdir(parents=True, exist_ok=True)
    for c in API:
        with open(out / f"api_{c}.jsonl", "w") as f:
            for r in ev[ev.carrier_id.eq(c)].itertuples():
                f.write(json.dumps({"shipment_ref": r.delivery_id, "status": r.event, "at": r.stamp}) + "\n")
    for c in PORTAL:
        for week, g in ev[ev.carrier_id.eq(c)].groupby("week"):
            rows = "".join(f"<tr><td>{r.delivery_id}</td><td>{r.event.replace('_', ' ').upper()}</td><td>{r.stamp}</td></tr>"
                           for r in g.itertuples())
            (out / f"portal_{c}_{week}.html").write_text(
                f"<html><body><h1>Carrier {c} tracking - SYNTHETIC</h1><table>{rows}</table></body></html>")
    for c in BATCH:
        for week, g in ev[ev.carrier_id.eq(c)].groupby("week"):
            g[["delivery_id", "event", "stamp"]].rename(columns={"delivery_id": "REF", "event": "CODE", "stamp": "TIME"}) \
                .to_csv(out / f"batch_{c}_{week}.csv", index=False)
    return out


ROW = re.compile(r"<tr><td>([^<]+)</td><td>([^<]+)</td><td>([^<]+)</td></tr>")


def read_feeds(out: Path = OUT) -> pd.DataFrame:
    frames = []
    for c in API:
        j = pd.read_json(out / f"api_{c}.jsonl", lines=True, dtype={"at": str})
        frames.append(pd.DataFrame({"delivery_id": j.shipment_ref, "carrier_id": c, "event": j.status,
                                    "ts": j["at"], "source": "api"}))
    for path in sorted(out.glob("portal_*.html")):
        c = path.name.split("_")[1]
        rows = ROW.findall(path.read_text())
        frames.append(pd.DataFrame([{"delivery_id": r[0], "carrier_id": c, "event": r[1].lower().replace(" ", "_"),
                                     "ts": r[2], "source": "portal"} for r in rows]))
    for path in sorted(out.glob("batch_*.csv")):
        c = path.name.split("_")[1]
        b = pd.read_csv(path, dtype=str)
        frames.append(pd.DataFrame({"delivery_id": b.REF, "carrier_id": c, "event": b.CODE, "ts": b.TIME,
                                    "source": "batch"}))
    ev = pd.concat(frames, ignore_index=True)
    ev["ts"] = pd.to_datetime(ev.ts).astype("datetime64[us]")
    ev["synthetic"] = True
    return ev
```

```python
"""SD-07: synthetic carrier tracking feeds in three formats (owner C). The pipeline also calls write_feeds().

Run from the repo root:  python backend/synthetic-data/generators/sd07_tracking.py
"""
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BACKEND))

from analytics.carriers.tracking import write_feeds  # noqa: E402
from analytics.core.load import load  # noqa: E402

if __name__ == "__main__":
    d, _ = load()
    print(f"wrote feeds to {write_feeds(d)}")
```

Final `backend/analytics/carriers/__init__.py`:

```python
"""Carriers pipeline step (owner C)."""
import pandas as pd

from analytics.carriers import backtest, capacity, lanes, tracking
from analytics.core.context import Ctx


def build(ctx: Ctx) -> dict[str, pd.DataFrame]:
    d = ctx.d
    tracking.write_feeds(d)
    return {
        "lane_scores": lanes.lane_scores(d),
        "carrier_capacity": capacity.carrier_capacity(d),
        "carrier_backtest": backtest.backtest(d),
        "carrier_events": tracking.read_feeds(),
    }
```

- [x] **Step 4: Run.** `python -m pytest && npm run pipeline:test && npm --prefix backend/api test -- test/routes/tracking` — Expected: pass (writing 193k events takes under a minute).

- [x] **Step 5: Commit.** `git add backend/analytics backend/synthetic-data/generators backend/api && git commit -m "feat(c): synthetic carrier tracking feeds and adapters (SD-07)"`

---

### Task C7: Carriers screen (C5)

**Files:**
- Create: `frontend/components/dashboard/carriers/CarriersScreen.tsx`, `frontend/app/dashboard/carriers/page.tsx`
- Test: `frontend/components/dashboard/carriers/CarriersScreen.test.tsx`

**Interfaces:**
- Consumes: `/api/carriers`, `/api/carriers/backtest`, `/api/tracking`, `POST /api/overrides`; `Segmented`, `Pill`, `Table`, `SyntheticBadge`, `postJSON` (B2).
- Produces: `/dashboard/carriers`: region / promise / SLA pickers, ranked carriers marked recommended / backup / blocked with reasons, backtest table, tracking panel with the synthetic badge, override form.

- [x] **Step 1: Write the failing test:**

```tsx
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mockApi, renderScreen } from '../test-utils';
import { CarriersScreen } from './CarriersScreen';

describe('Carriers', () => {
  it('shows the recommendation reason, a blocked carrier and the synthetic tracking badge', async () => {
    mockApi({
      '/api/carriers?region=Northeast&commitment=next_day&sla=false': { recommendation: {
        carrier: 'E', backup: 'A', blocked: ['F'],
        reason: 'Carrier E for Northeast next-day: 97% on time vs 55% for F; $1.62 more per shipment',
        options: [
          { carrier: 'E', onTime: 0.968, meanRate: 12.84, n: 309, score: 96, status: 'recommended', reason: 'eligible' },
          { carrier: 'F', onTime: 0.546, meanRate: 11.22, n: 445, score: null, status: 'blocked', reason: '45% late on fair data (limit 15%)' },
        ] } },
      '/api/carriers/backtest': { rows: [] },
      '/api/tracking?asOf=2026-09-10': { synthetic: true, asOf: '2026-09-10', freshness: [], atRisk: [] },
    });
    renderScreen(<CarriersScreen />);
    expect(await screen.findByText(/97% on time vs 55% for F/)).toBeTruthy();
    expect(await screen.findByText('45% late on fair data (limit 15%)')).toBeTruthy();
    expect(await screen.findByText('Synthetic data')).toBeTruthy();
  });
});
```

- [x] **Step 2: Run.** `npm --prefix frontend test` — Expected: FAIL, cannot resolve `./CarriersScreen`.

- [x] **Step 3: Implement** the screen and its route:

```tsx
'use client';

import { useState } from 'react';
import { Pill, ScreenHead, Section, Segmented, Status, SyntheticBadge, Table, type Tone, ui } from '@/components/dashboard/ui';
import { postJSON } from '@/lib/api';
import { useApi } from '@/hooks/useApi';
import { int, pct, usd2 } from '@/lib/metrics';

interface Option { carrier: string; onTime: number; meanRate: number; n: number; score: number | null; status: string; reason: string }
interface Rec { carrier: string; backup: string; reason: string; blocked: string[]; options: Option[] }
interface Tracking { asOf: string; freshness: { carrier: string; source: string; lastEventAt: string }[]; atRisk: { deliveryId: string; carrier: string }[] }

const REGIONS = [['Midwest', 'Midwest'], ['Northeast', 'Northeast'], ['Southeast', 'Southeast'], ['West', 'West']] as const;
const COMMITMENTS = [['same_day', 'Same day'], ['next_day', 'Next day'], ['standard', 'Standard']] as const;
const STATUS_TONE: Record<string, Tone> = { recommended: 'good', backup: 'neutral', eligible: 'neutral', blocked: 'bad' };

export function CarriersScreen() {
  const [region, setRegion] = useState<(typeof REGIONS)[number][0]>('Northeast');
  const [commitment, setCommitment] = useState<(typeof COMMITMENTS)[number][0]>('next_day');
  const [sla, setSla] = useState(false);
  const [override, setOverride] = useState({ orderRef: '', to: '', reason: '', user: '' });
  const [overrideMsg, setOverrideMsg] = useState('');
  const lane = useApi<{ recommendation: Rec }>(`/api/carriers?region=${region}&commitment=${commitment}&sla=${sla}`);
  const bt = useApi<{ rows: { choice: string; n: number; onTime: number; meanRate: number }[] }>('/api/carriers/backtest');
  const tr = useApi<Tracking>('/api/tracking?asOf=2026-09-10');
  const rec = lane.data?.recommendation;

  async function saveOverride() {
    try {
      const r = await postJSON<{ id: number }>('/api/overrides', { ...override, from: rec?.carrier ?? '' });
      setOverrideMsg(`Logged override #${r.id}`);
    } catch (e) {
      setOverrideMsg((e as Error).message);
    }
  }

  return (
    <>
      <ScreenHead title="Carrier choice by lane" />
      <p className={ui.lede}>Scored on deliveries with no address, stock or cut-off problem. Five lanes fail every day and are blocked.
        Carrier D is capped on Fridays, when it carries 39% of shipments and breaks; on other days it is a cheap, reliable option in the
        Northeast and West.</p>
      <Section title="Which carrier for this lane?">
        <div className={ui.row}>
          <Segmented label="Region" value={region} options={REGIONS} onChange={setRegion} />
          <Segmented label="Delivery promise" value={commitment} options={COMMITMENTS} onChange={setCommitment} />
          <label className={ui.muted}><input type="checkbox" checked={sla} onChange={(e) => setSla(e.target.checked)} /> Client has an SLA penalty clause</label>
        </div>
        <Status loading={lane.loading} error={lane.error} />
        {rec && (
          <>
            <p><strong>{rec.reason}</strong> Backup: {rec.backup}.</p>
            <Table rows={rec.options} columns={[
              { key: 'c', label: 'Carrier', render: (o) => o.carrier },
              { key: 's', label: 'Status', render: (o) => <Pill tone={STATUS_TONE[o.status] ?? 'neutral'}>{o.status}</Pill> },
              { key: 'o', label: 'On-time (fair data)', align: 'right', render: (o) => pct(o.onTime, 0) },
              { key: 'r', label: 'Mean rate', align: 'right', render: (o) => usd2(o.meanRate) },
              { key: 'n', label: 'Deliveries', align: 'right', render: (o) => int(o.n) },
              { key: 'w', label: 'Why', render: (o) => (o.status === 'blocked' ? o.reason : o.score == null ? '' : `score ${o.score.toFixed(0)}`) },
            ]} />
          </>
        )}
      </Section>
      <Section title="Backtest: rules trained Apr–Jul, tested Aug–Sep">
        <Status loading={bt.loading} error={bt.error} />
        {bt.data && <Table rows={bt.data.rows} columns={[
          { key: 'c', label: 'Carrier choice', render: (r) => r.choice },
          { key: 'o', label: 'On-time', align: 'right', render: (r) => pct(r.onTime) },
          { key: 'm', label: 'Mean rate', align: 'right', render: (r) => usd2(r.meanRate) },
          { key: 'n', label: 'Deliveries', align: 'right', render: (r) => int(r.n) },
        ]} />}
      </Section>
      <Section title="Tracking across all six carriers" badge={<SyntheticBadge />}>
        <Status loading={tr.loading} error={tr.error} />
        {tr.data && (
          <>
            <p className={ui.muted}>As of {tr.data.asOf}: {int(tr.data.atRisk.length)} deliveries promised that day have no delivered event.</p>
            <Table rows={tr.data.freshness} columns={[
              { key: 'c', label: 'Carrier', render: (f) => f.carrier },
              { key: 's', label: 'Feed', render: (f) => f.source },
              { key: 'l', label: 'Last event', render: (f) => f.lastEventAt },
            ]} />
          </>
        )}
      </Section>
      <Section title="Override a recommendation">
        <div className={ui.row}>
          <input className={ui.input} aria-label="Order ref" placeholder="Order ref" value={override.orderRef} onChange={(e) => setOverride({ ...override, orderRef: e.target.value })} />
          <input className={ui.input} aria-label="Use carrier" placeholder="Use carrier" value={override.to} onChange={(e) => setOverride({ ...override, to: e.target.value })} />
          <input className={ui.input} aria-label="Reason" placeholder="Reason" value={override.reason} onChange={(e) => setOverride({ ...override, reason: e.target.value })} />
          <input className={ui.input} aria-label="Your name" placeholder="Your name" value={override.user} onChange={(e) => setOverride({ ...override, user: e.target.value })} />
          <button type="button" className={ui.button} onClick={saveOverride}>Log override</button>
        </div>
        {overrideMsg && <p className={ui.muted}>{overrideMsg}</p>}
      </Section>
    </>
  );
}
```

```tsx
import type { Metadata } from 'next';
import { CarriersScreen } from '@/components/dashboard/carriers/CarriersScreen';

export const metadata: Metadata = { title: 'Carriers' };

export default function Page() {
  return <CarriersScreen />;
}
```

- [x] **Step 4: Run.** `npm --prefix frontend test && npm run typecheck` — Expected: PASS. In the browser: West / standard shows E blocked and D eligible; Midwest shows D blocked and F eligible.

- [x] **Step 5: Commit.** `git add frontend && git commit -m "feat(c): Carriers screen"`

---

### Task C8: Azure environment and continuous deployment (P5) — deployed by Wednesday evening

**Files:**
- Create: `infra/setup.sh`, `.github/workflows/cd.yml`

**Interfaces:**
- Produces: API at `https://<NAME>-api.azurewebsites.net`, web on Static Web Apps, Postgres filled by the pipeline, secrets in Key Vault, App Insights receiving the API logs (intake logs carry `emailId` — AC-NFR-03).

**As built (27 Oct)** — `infra/setup.sh` and `.github/workflows/cd.yml` in the repo are the source of truth; the code
blocks below are the original plan. Changes, each forced by the code or the network:
- The Next.js app (landing page + dashboard) runs on a second App Service app (`rootroute01-web`) on the same B1 plan,
  not Static Web Apps: its middleware needs a Node server. Both apps run Node 24 LTS (22 is near end of support).
- The AI layer is Azure OpenAI or recorded (A1–A3), not Anthropic. First deploy: `LLM_PROVIDER=recorded`; setup.sh
  stores `AZURE_OPENAI_*` in Key Vault and switches the API over when they are exported.
- The Postgres password is generated by setup.sh and lives only in Key Vault. CD reads `database-url` and `api-key`
  from Key Vault, so GitHub holds only the three OIDC ids (`AZURE_CLIENT_ID`, `AZURE_TENANT_ID`,
  `AZURE_SUBSCRIPTION_ID`) and the variables `AZURE_RG`, `NAME`.
- CD opens the Postgres firewall to its own runner IP for the job and removes the rule at the end (no 0.0.0.0–255.255.255.255 rule).
- App Insights is created on a Log Analytics workspace with the core CLI (`az resource create`), because the Evoke
  proxy blocks CLI extension downloads. Firewall rules also use `az resource` (their flags changed between CLI versions).
- Step 4 ran from a Mac on 27 Oct (pipeline, migrate, seed against Azure Postgres; zip deploy of both apps). On the
  Evoke network, run az with `REQUESTS_CA_BUNDLE` set to the Mac's trusted roots
  (`security find-certificate -a -p /Library/Keychains/System.keychain /System/Library/Keychains/SystemRootCertificates.keychain`),
  and open the firewall for both outgoing IPs (`api.ipify.org` and `ifconfig.me` differ).
- Live: API https://rootroute01-api.azurewebsites.net (health `"db":"ok"`), web https://rootroute01-web.azurewebsites.net.

- [x] **Step 1: Check access.** `az login && az account show` — you need permission to create a resource group and an app registration in the subscription. If not, ask the subscription owner today.

- [x] **Step 2: Setup script** `infra/setup.sh`:

```bash
#!/usr/bin/env bash
# Create the LateLens demo environment once (owner C). Requires: az login, and PG_PASSWORD + ANTHROPIC_API_KEY exported.
# Usage: RG=rg-unhandled-rejections LOC=centralindia NAME=rootroute01 GITHUB_REPO=saiprasad-37/root-route ./infra/setup.sh
set -euo pipefail
: "${RG:=rg-unhandled-rejections}" "${LOC:=centralindia}" "${NAME:?set NAME, e.g. rootroute01}" "${GITHUB_REPO:?set GITHUB_REPO owner/name}"
: "${PG_PASSWORD:?export PG_PASSWORD}" "${ANTHROPIC_API_KEY:?export ANTHROPIC_API_KEY}"
DEMO_API_KEY="${DEMO_API_KEY:-$(openssl rand -hex 16)}"

az group show -n "$RG" -o none 2>/dev/null || az group create -n "$RG" -l "$LOC" -o none   # never re-save the organisers' group: it drops their tags

# PostgreSQL Flexible Server (Burstable, public access limited to Azure services)
az postgres flexible-server create -g "$RG" -n "$NAME-db" -l "$LOC" --tier Burstable --sku-name Standard_B1ms \
  --version 16 --admin-user latelens --admin-password "$PG_PASSWORD" --public-access 0.0.0.0 --yes -o none
az postgres flexible-server db create -g "$RG" -s "$NAME-db" -d latelens -o none
DATABASE_URL="postgres://latelens:${PG_PASSWORD}@${NAME}-db.postgres.database.azure.com:5432/latelens?sslmode=require"

# Key Vault for secrets
az keyvault create -g "$RG" -n "$NAME-kv" -l "$LOC" --enable-rbac-authorization false -o none
az keyvault secret set --vault-name "$NAME-kv" -n database-url --value "$DATABASE_URL" -o none
az keyvault secret set --vault-name "$NAME-kv" -n anthropic-api-key --value "$ANTHROPIC_API_KEY" -o none
az keyvault secret set --vault-name "$NAME-kv" -n api-key --value "$DEMO_API_KEY" -o none

# Application Insights
az extension add --name application-insights -y -o none
AI_CONN=$(az monitor app-insights component create -g "$RG" -l "$LOC" --app "$NAME-ai" --query connectionString -o tsv)

# API on App Service (Linux, Node 22) reading secrets through Key Vault references
az appservice plan create -g "$RG" -n "$NAME-plan" --is-linux --sku B1 -o none
az webapp create -g "$RG" -p "$NAME-plan" -n "$NAME-api" --runtime "NODE:22-lts" -o none
az webapp config set -g "$RG" -n "$NAME-api" --startup-file "node backend/api/dist/index.js" -o none
PRINCIPAL=$(az webapp identity assign -g "$RG" -n "$NAME-api" --query principalId -o tsv)
az keyvault set-policy -n "$NAME-kv" --object-id "$PRINCIPAL" --secret-permissions get list -o none
KV="https://$NAME-kv.vault.azure.net/secrets"
az webapp config appsettings set -g "$RG" -n "$NAME-api" -o none --settings \
  "DATABASE_URL=@Microsoft.KeyVault(SecretUri=$KV/database-url/)" \
  "ANTHROPIC_API_KEY=@Microsoft.KeyVault(SecretUri=$KV/anthropic-api-key/)" \
  "API_KEY=@Microsoft.KeyVault(SecretUri=$KV/api-key/)" \
  "LLM_PROVIDER=claude" "LLM_MODEL=claude-opus-5-5" "ALLOW_LIST=ops-test@latelens.example,orders@client190.example" \
  "APPLICATIONINSIGHTS_CONNECTION_STRING=$AI_CONN" "ApplicationInsightsAgent_EXTENSION_VERSION=~3" "NODE_ENV=production"

# Web on Static Web Apps
az staticwebapp create -g "$RG" -n "$NAME-web" -l eastus2 --sku Free -o none
SWA_TOKEN=$(az staticwebapp secrets list -g "$RG" -n "$NAME-web" --query properties.apiKey -o tsv)

# GitHub Actions sign-in with OIDC (no stored Azure password)
APP_ID=$(az ad app create --display-name "$NAME-github" --query appId -o tsv)
az ad sp create --id "$APP_ID" -o none
az ad app federated-credential create --id "$APP_ID" --parameters "{\"name\":\"main\",\"issuer\":\"https://token.actions.githubusercontent.com\",\"subject\":\"repo:${GITHUB_REPO}:environment:demo\",\"audiences\":[\"api://AzureADTokenExchange\"]}" -o none
az role assignment create --assignee "$APP_ID" --role Contributor --scope "$(az group show -n "$RG" --query id -o tsv)" -o none

cat <<OUT
Add to GitHub (Settings > Environments > demo):
  secrets: AZURE_CLIENT_ID=$APP_ID  AZURE_TENANT_ID=$(az account show --query tenantId -o tsv)
           AZURE_SUBSCRIPTION_ID=$(az account show --query id -o tsv)  DATABASE_URL=<value in Key Vault database-url>
           AZURE_STATIC_WEB_APPS_API_TOKEN=<run: az staticwebapp secrets list -g $RG -n $NAME-web>  DEMO_API_KEY=<Key Vault api-key>
  variables: API_APP_NAME=$NAME-api  API_URL=https://$NAME-api.azurewebsites.net
Also allow the CD runner to reach Postgres:  az postgres flexible-server firewall-rule create -g $RG -n $NAME-db -r github --start-ip-address 0.0.0.0 --end-ip-address 255.255.255.255
(remove that rule after the hackathon). SWA token length: ${#SWA_TOKEN}
OUT
```

Run it once:

```bash
export PG_PASSWORD='<strong password>' ANTHROPIC_API_KEY='<key>'
RG=rg-unhandled-rejections LOC=centralindia NAME=rootroute01 GITHUB_REPO=saiprasad-37/root-route ./infra/setup.sh
```

Expected: the closing message lists the GitHub secrets and variables to add. The repo owner adds them under Settings → Environments → `demo`.

- [x] **Step 3: Workflow** `.github/workflows/cd.yml` (runs after `ci` passes on `main`, or by hand):

```yaml
name: cd
on:
  workflow_run:
    workflows: [ci]
    types: [completed]
    branches: [main]
  workflow_dispatch:

permissions:
  id-token: write
  contents: read

jobs:
  deploy:
    if: github.event_name == 'workflow_dispatch' || github.event.workflow_run.conclusion == 'success'
    runs-on: ubuntu-latest
    environment: demo
    env:
      DATABASE_URL: ${{ secrets.DATABASE_URL }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
          cache: pip
      - run: pip install -r requirements.txt
      - run: npm run data
      - name: Fill computed tables
        run: npm run pipeline
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
      - run: npm --prefix backend/api ci
      - run: npm run migrate
      - run: npm run seed
      - name: Package the API (keeps backend/ paths so the API finds synthetic-data/reference)
        run: |
          npm run build:api
          mkdir -p deploy/backend/api deploy/backend/synthetic-data
          cp -R backend/api/dist backend/api/package.json backend/api/package-lock.json deploy/backend/api/
          cp -R backend/synthetic-data/reference deploy/backend/synthetic-data/
          npm --prefix deploy/backend/api ci --omit=dev --no-audit --no-fund
      - uses: azure/login@v2
        with:
          client-id: ${{ secrets.AZURE_CLIENT_ID }}
          tenant-id: ${{ secrets.AZURE_TENANT_ID }}
          subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}
      - uses: azure/webapps-deploy@v3
        with:
          app-name: ${{ vars.API_APP_NAME }}
          package: deploy
      - name: Deploy the Next.js app (landing page + dashboard)
        uses: Azure/static-web-apps-deploy@v1
        env:
          NEXT_PUBLIC_API_URL: ${{ vars.API_URL }}
          NEXT_PUBLIC_API_KEY: ${{ secrets.DEMO_API_KEY }}
        with:
          azure_static_web_apps_api_token: ${{ secrets.AZURE_STATIC_WEB_APPS_API_TOKEN }}
          action: upload
          app_location: frontend
          output_location: ""
      - name: Smoke check
        run: |
          for i in $(seq 1 30); do
            curl -fsS "${{ vars.API_URL }}/api/health" | grep -q '"db":"ok"' && exit 0
            sleep 10
          done
          echo "API health check failed"; exit 1
```

- [x] **Step 4: First deployment.** Merge to `main`, or run the workflow from the Actions tab. Expected: the "Smoke check" step finds `"db":"ok"`. Open the Static Web App URL: Overview shows 71.0%.

- [x] **Step 5: Check logs.** Process one email through the deployed Order emails screen, then in Application Insights → Logs search for its `emailId`. Expected: the "intake email decided" line appears (AC-NFR-03).
  As built (28 Oct): App Insights collected requests only; the API's pino lines on stdout never reached it. A diagnostic
  setting `app-logs` on `rootroute01-api` now sends `AppServiceConsoleLogs` and `AppServiceAppLogs` to the same
  workspace (`rootroute01-logs`, in `infra/setup.sh`). Query: `AppServiceConsoleLogs | where ResultDescription has
  '"emailId":8'` returns "intake email decided" (ALL_CLEAR) about 3 minutes after the email; `"emailId":7` returns
  "intake action" (approve). Gap for A: emails fetched by the Gmail poll log only `pollId`, not each `emailId`, so
  AC-NFR-03 holds for pasted emails and actions, not yet for polled ones.

- [x] **Step 6: Commit.** `git add infra .github/workflows/cd.yml && git commit -m "ci(c): Azure setup script and continuous deployment"`
  Done as 36aeee2 (setup script and CD, #20), 430ef5b (OIDC subject fix, #21) and 466391a (API logs to the workspace, #29).

**Wednesday check-in:** the deployed URL shows all five screens on live data.

---

### Task C9 (stretch): "Ask LateLens" MCP server (D7)

**Files:**
- Create: `backend/api/src/modules/mcp/routes.ts`
- Test: `backend/api/test/mcp.test.ts`, `backend/api/test/routes/mcp.test.ts` (needs test database)

**Interfaces:**
- Consumes: `q.overview/causes/replay` (B9), `laneRows` + `recommendFromLane` (C4), `checkPromise` (B8).
- Produces: `POST /api/mcp` (Streamable HTTP, stateless, needs `x-api-key`) with read-only tools `overview`, `delivery_causes`, `scenario`, `lane_scores`, `check_promise`; `buildMcpServer()`.

- [ ] **Step 1: Install.** `npm --prefix backend/api install @modelcontextprotocol/sdk`

- [ ] **Step 2: Write the failing tests** (AC-MCP-01, AC-MCP-02):

```ts
import { describe, expect, it } from 'vitest';
import { buildMcpServer } from '../src/modules/mcp/routes.js';

describe('MCP server (D7)', () => {
  it('AC-MCP-01: exposes only the read-only tools', () => {
    const server = buildMcpServer() as unknown as { _registeredTools: Record<string, unknown> };
    expect(Object.keys(server._registeredTools).sort()).toEqual(['check_promise', 'delivery_causes', 'lane_scores', 'overview', 'scenario']);
  });
});
```

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { pool } from '../../src/core/db/pool.js';
import { buildApp } from '../../src/server.js';
import { hasDb } from '../db.js';

describe.skipIf(!hasDb)('MCP route (needs test database)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => pool.end());

  it('AC-MCP-02: the MCP endpoint refuses requests without the key', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/mcp', payload: {} })).statusCode).toBe(401);
  });
});
```

- [ ] **Step 3: Run.** Expected: FAIL, cannot find `mcp/routes.js`.

- [ ] **Step 4: Implement:**

```ts
// D7 (stretch, owner C): read-only LateLens tools over MCP (Streamable HTTP, stateless).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireApiKey } from '../../core/auth.js';
import { recommendFromLane } from '../carriers/domain.js';
import { laneRows } from '../carriers/queries.js';
import { checkPromise } from '../warehouse/domain.js';
import * as q from '../warehouse/queries.js';

const json = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data) }] });
const Region = z.enum(['Midwest', 'Northeast', 'Southeast', 'West']);
const Commitment = z.enum(['same_day', 'next_day', 'standard']);

/** Only read-only tools (REQ-MCP-01). Nothing here sends email, approves orders or writes to the database. */
export function buildMcpServer(): McpServer {
  const server = new McpServer({ name: 'latelens', version: '0.1.0' });
  server.registerTool('overview', { description: 'Headline KPIs: on-time rate, late deliveries, penalties, at-risk accounts.' },
    async () => json(await q.overview()));
  server.registerTool('delivery_causes', {
    description: 'Late rate by cause and stage for all orders, email orders or at-risk accounts.',
    inputSchema: { segment: z.enum(['all', 'email', 'at_risk']) },
  }, async ({ segment }) => json(await q.causes(segment)));
  server.registerTool('scenario', {
    description: "Replay of 'what if this were fixed' scenarios, including the routing vendor and LateLens as built.",
    inputSchema: { segment: z.enum(['all', 'email', 'at_risk', 'aug_sep']) },
  }, async ({ segment }) => json(await q.replay(segment)));
  server.registerTool('lane_scores', {
    description: 'Carrier on-time, rate and block status for one region and delivery promise.',
    inputSchema: { region: Region, commitment: Commitment },
  }, async ({ region, commitment }) => json(recommendFromLane(await laneRows(region, commitment), false)));
  server.registerTool('check_promise', {
    description: 'The delivery date Halcyon can honestly promise for an order received at a local time.',
    inputSchema: { commitment: Commitment, receivedAt: z.string().describe('YYYY-MM-DD HH:mm') },
  }, async ({ commitment, receivedAt }) => json(checkPromise(commitment, receivedAt)));
  return server;
}

const routes: FastifyPluginAsync = async (app) => {
  app.post('/mcp', { preHandler: requireApiKey }, async (req, reply) => {
    const server = buildMcpServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    reply.hijack();
    reply.raw.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req.raw, reply.raw, req.body);
  });
};

export default routes;
```

- [ ] **Step 5: Run and try it.** `npm --prefix backend/api test -- test/mcp test/routes/mcp` — Expected: pass. Then connect an MCP client (for example Claude Desktop's custom connector) to `https://<NAME>-api.azurewebsites.net/api/mcp` with header `x-api-key`, and ask "What would LateLens as built achieve compared with the routing vendor?" — the answer must quote 92.0% for the full programme and 78.3% for the routing vendor.

- [ ] **Step 6: Commit.** `git add backend/api && git commit -m "feat(c): read-only MCP server for Ask LateLens (D7)"`

---

### Task C10 (stretch): Playwright smoke test of every screen (P6)

**Files:**
- Create: `frontend/playwright.config.ts`, `frontend/e2e/smoke.spec.ts`
- Modify: `frontend/package.json` (script, dev package)

- [ ] **Step 1: Install.** `npm --prefix frontend install -D @playwright/test && npx --prefix frontend playwright install chromium` (install before creating the files, so `npm run typecheck` keeps passing).

- [ ] **Step 2: Config and test** (AC-UI-01, AC-UI-03 at 375 px; the Vitest config only picks up `components/` and `lib/`, so these never run under Vitest):

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  use: { baseURL: process.env.WEB_URL ?? 'http://localhost:3000', viewport: { width: 375, height: 812 } },
});
```

```ts
// P6 (stretch, owner C): every screen loads at phone width without horizontal scrolling (AC-UI-01, AC-UI-03).
import { expect, test } from '@playwright/test';

const SCREENS = ['/dashboard/overview', '/dashboard/intake', '/dashboard/warehouses', '/dashboard/carriers', '/dashboard/replay'];

for (const path of SCREENS) {
  test(`${path} renders at 375px`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(path);
    await expect(page.locator('h2').first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  });
}

test('overview shows 71.0% on-time', async ({ page }) => {
  await page.goto('/dashboard/overview');
  await expect(page.getByText('71.0%')).toBeVisible();
});
```

Add to `frontend/package.json` scripts:

```json
"e2e": "playwright test",
```

- [ ] **Step 3: Run** against the deployed app, from `frontend/`: `WEB_URL=https://<static web app url> npm run e2e` — Expected: 6 passed. Run it again after every deployment on Thursday.

- [ ] **Step 4: Commit.** `git add frontend && git commit -m "test(c): Playwright smoke test of the dashboard at phone width"`

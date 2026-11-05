# Route reordering demo (C9c, synthetic) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Labs card that shows one delivery's invented stops, a dispatcher-style planned order, a shorter reordered
order and the delivery's real planned and actual km, clearly badged as synthetic.

**Architecture:**
- A seeded SD-11 generator invents stops per delivery and scales the nearest-neighbour planned tour to the real
  `planned_route_km`.
- A numpy 2-opt pass reorders it. The pipeline's `routes` step writes a `route_demo` table.
- Node only looks rows up for `GET /api/labs/route-demo[/:deliveryId]`. A React card in Labs draws them in SVG.

**Tech Stack:** Python 3.12, pandas, numpy · Node 22, TypeScript, Fastify 5, Vitest · Next.js 15, React 19, Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-05-route-reordering-demo-design.md`. Read it first, plus SPEC §5.18 (C9a) and
§12.1 (synthetic data register).

## Global Constraints

- **Synthetic only:** stop positions, both orders and `optimised_km` are invented. Only `planned_km`, `actual_km` and
  `overran` are real.
- **No reuse:** nothing reads `route_demo` except `GET /api/labs/route-demo[/:deliveryId]`. That rules out headline
  figures, the replay, Overview, Carriers, the assistant and MCP (REQ-RDEMO-06).
- **Every screen using it shows the "Synthetic data" badge** (CLAUDE.md).
- **Python computes, Node looks up.** `route_demo` has one writer: the pipeline's `routes` step.
- **The planned order is nearest-neighbour, never random.** Its length equals `planned_route_km` to 0.01 km.
  `optimised_km` ≤ `planned_km`.
- **Scale runs skip the table:** `ROUTE_DEMO=off` leaves it out, and `analytics/bench.py` sets that for every scale run.
- **Card wording:** no verdicts and no vendor (OS-01, OS-02). The card says "reordered"; the API says "optimised".
- **The fixed card sentence, verbatim:** "Stop positions are invented (SD-11): the saving shows what reordering does on
  these points, not on Halcyon's routes. The overrun compares the actual route with the plan, so a shorter plan does not
  change it."
- **Labs roles:** `warehouse_supervisor`, `carrier_manager`, `leadership`, `admin`, the same as `GET /api/compare`
  (`ACCOUNTS_READ`).
- **Tests name their AC ids.**
- **Commits:** the user has said not to commit for now. Each task's commit step is held until the user asks.
- **Shared folder:** another Claude session may be working in this checkout. Stage only this plan's files.

## File Structure

```
backend/synthetic-data/generators/sd11_route_stops.py   stops_for(), tour_km(), nearest_neighbour() — the SD-11 generator
backend/analytics/routes/demo.py                          two_opt(), route_demo(d) — reordering and the table
backend/analytics/routes/__init__.py                      (modify) add route_demo unless ROUTE_DEMO=off
backend/analytics/bench.py                                (modify) scale runs set ROUTE_DEMO=off
backend/analytics/tests/test_route_demo.py                AC-RDEMO-01..03
backend/analytics/tests/test_pipeline.py                  (modify) CONTRACT_TABLES += route_demo
backend/api/src/modules/carriers/routeDemo.ts             shapeRouteDemo(), types
backend/api/src/modules/carriers/queries.ts               (modify) routeDemoRow(), routeDemoExamples()
backend/api/src/modules/carriers/routes.ts                (modify) the two GET routes
backend/api/src/core/permissions.ts                       (modify) two entries, ACCOUNTS_READ
backend/api/test/carriers/routeDemo.test.ts               shape (no DB)
backend/api/test/routes/route-demo.test.ts                AC-RDEMO-04, -06 (DB)
frontend/components/dashboard/replay/RouteDemoCard.tsx    the Labs card
frontend/components/dashboard/replay/RouteDemoCard.test.tsx  AC-RDEMO-05
frontend/components/dashboard/replay/replay.module.css    (modify) card styles
frontend/components/dashboard/replay/ReplayScreen.tsx     (modify) mount the card after <CompareCard />
docs/SPEC.md, docs/CONTRACTS.md, docs/SPEC-auth.md        (modify) Task 1
```

---

### Task 1: SPEC v0.21 scope change and contracts

**Files:**
- Modify: `docs/SPEC.md`: status line, a v0.21 change note above v0.20, §3 table and Pitch-only line, OS-03, a new §5.19
  before `## 6. Data model`, §6 table list, §7 API list, §12.1 SD-11 row, a §14.1 row at the end of the table.
- Modify: `docs/CONTRACTS.md`: §4 table row, §6 endpoint rows.
- Modify: `docs/SPEC-auth.md`: §4.4 GET-route table.

**Interfaces:**
- Produces: REQ-RDEMO-01..06 and AC-RDEMO-01..06, the ids every later test names.

- [x] **Step 1:** Change `Status: draft v0.20` to `Status: draft v0.21`. Add above `**Changes in v0.20**`:

```markdown
**Changes in v0.21** (5 Nov, team decision): new feature C9c "Route reordering demo (synthetic)" (§3, new §5.19). A
Labs card shows one delivery's invented stops (SD-11), a nearest-neighbour planned order scaled to the real
`planned_route_km`, a shorter 2-opt reordering, and the real planned and actual km. OS-03 is reworded: an optimiser for
Halcyon's real routes stays out (C9b); C9c is allowed only as a badged synthetic illustration that feeds no headline
figure, the replay, the assistant or MCP. Design: `docs/superpowers/specs/2026-11-05-route-reordering-demo-design.md`.
```

- [x] **Step 2:** In the §3 table, add a row after the `C9a` row:

```markdown
| C9c | Route reordering demo: one delivery's invented stops (SD-11), planned vs reordered order, real planned and actual km; Labs card | Carriers | Stretch (after submission; synthetic) | §5.19 |
```

  Then replace the OS-03 row with:

```markdown
| OS-03 | Building a routing engine or route optimiser for Halcyon's real routes (C9b) | It is the vendor's product, and the supplied data has no stop locations, stop order or road network to optimise (only `stops_on_route`, `planned_route_km`, `actual_route_km`); revisit after the pilot. Reporting what the route data shows (C9a, §5.18) is in scope, and so is a badged synthetic illustration of reordering (C9c, §5.19) that feeds no headline figure, the replay, the assistant or MCP | §3 Pitch only; v0.19; v0.21 |
```

- [x] **Step 3:** Insert §5.19 before `\n---\n\n## 6. Data model (PostgreSQL)`. Its content is spec §1, plus the REQ table
  from spec §6 verbatim, plus this AC table:

```markdown
| ID | Acceptance criterion |
|---|---|
| AC-RDEMO-01 | Given delivery `D000001` with 10 stops and 71.7 planned km, when SD-11 runs twice, then both runs give the same 10 points, and the nearest-neighbour tour over them measures 71.7 km ± 0.01; given 6, 23 and 40 stops, the same holds. |
| AC-RDEMO-02 | Given every row of `route_demo` from the supplied data, then `planned_order` and `optimised_order` are each a permutation of `0..n_stops-1` and `optimised_km` ≤ `planned_km` + 0.01. |
| AC-RDEMO-03 | Given the pipeline runs, then `route_demo` has one row per delivery (48,340), `synthetic` true on all, and exactly one row each with `example` `overrun`, `on_plan` and `no_distance`; given `ROUTE_DEMO=off`, then no `route_demo` table is produced. |
| AC-RDEMO-04 | Given the table, when `GET /api/labs/route-demo` is called, then it lists the three examples; when `GET /api/labs/route-demo/D000001` is called, then it returns the §4 shape with `synthetic: true`; `D1`, `x`, `D0000001` get 400, `D999999` gets 404, a missing table gets 503; `order_desk` and `customer_support` get 403 with `AUTH_REQUIRED=on`. |
| AC-RDEMO-05 | Given an API response, when the Labs card renders, then it shows the "Synthetic data" badge, the fixed sentence, planned km marked real, reordered km marked synthetic with "x% shorter than the plan", actual km with "over plan by y%" when it overran or "no actual distance recorded" when null, and the three example chips; a 404 shows "No delivery with that id."; no text matches `sign|vendor|approve`. |
| AC-RDEMO-06 | Given the source of `backend/api/src/modules/mcp/` and `backend/api/src/modules/assistant/`, and of `backend/analytics/core/`, then none mentions `route_demo`. |
```

- [x] **Step 4:** In §12.1, add after the `SD-10` row:

```markdown
| SD-11 | Stop positions per delivery for the C9c demo: `stops_on_route` points around the fulfilment warehouse, nearest-neighbour planned order scaled to the real `planned_route_km` (`sd11_route_stops.py` → `route_demo`) | Real delivery id (seed), `stops_on_route`, `planned_route_km`; positions invented | C9c | Carriers | GPS traces or stop sequences from carriers (§14) |
```

  In §6, append `· route_demo (delivery_id, n_stops, stops, planned_order, optimised_order, planned_km, optimised_km,
  actual_km, overran, example, synthetic; C9c, synthetic)` after the `route_overruns` entry. In §7, add
  `` `GET /api/labs/route-demo[/:deliveryId]` (C9c) `` after `` `GET /api/routes/overruns` (C9a) ``.

- [x] **Step 5:** Append to the §14.1 table, as its last row:

```markdown
| 5 Nov | May Root Route show route reordering at all, given OS-03 and the vendor's product? | Team (Priyank) | Yes, as a synthetic one-route illustration in Labs only, badged, feeding no headline figure, the replay, the assistant or MCP; an optimiser for real routes stays out (C9b) | v0.21: C9c, §5.19, OS-03 reworded, SD-11 (§12.1); design and plan `2026-11-05-route-reordering-demo` |
```

- [x] **Step 6:** In CONTRACTS §4, add after the `route_overruns` row:

```markdown
| `route_demo` | C (SD-11) | C9c (SPEC §5.19): `delivery_id`, `n_stops`, `stops` (JSON text: `[[x, y], …]` km from the fulfilment warehouse, stop-number order), `planned_order`, `optimised_order` (JSON text: stop numbers, depot implied at both ends), `planned_km` (real), `optimised_km` (synthetic), `actual_km` (real, null when blank), `overran` (boolean, `f_route`), `example` (`overrun`/`on_plan`/`no_distance` on one row each, else null), `synthetic` (true). Not written when `ROUTE_DEMO=off` |
```

  In CONTRACTS §6, add after the `GET /api/routes/overruns` row:

```markdown
| `GET /api/labs/route-demo` | C | C9c: `{ synthetic: true, examples: [{ deliveryId, kind }] }`; 503 when the table is empty or missing; Labs roles (SPEC-auth §4.4) |
| `GET /api/labs/route-demo/:deliveryId` | C | C9c: `{ synthetic: true, deliveryId, nStops, stops: [number, number][], plannedOrder: number[], optimisedOrder: number[], plannedKm, optimisedKm, actualKm: number \| null, overran }`; 400 `{ error: "bad_delivery_id" }` unless `D` + 6 digits; 404 `{ error: "not_found" }`; 503 when the table is empty or missing; Labs roles |
```

- [x] **Step 7:** In SPEC-auth §4.4, change the `compare` row's first cell to
  `` `compare` (D11, SPEC §5.8), `labs/route-demo`, `labs/route-demo/:deliveryId` (C9c, SPEC §5.19) ``.

- [x] **Step 8:** Check: `grep -c "RDEMO-0" docs/SPEC.md` prints at least `12`, and
  `grep -n "route_demo" docs/CONTRACTS.md` shows the §4 row and the two §6 rows.

- [ ] **Step 9 (held):** commit `docs(c): C9c route reordering demo (SPEC v0.21, REQ-RDEMO-01..06)`.

---

### Task 2: SD-11 generator (stops and planned order)

**Files:**
- Create: `backend/synthetic-data/generators/sd11_route_stops.py`
- Test: `backend/analytics/tests/test_route_demo.py`

**Interfaces:**
- Produces:
  - `stops_for(delivery_id: str, n_stops: int, planned_km: float) -> tuple[np.ndarray, list[int]]`: points of shape
    `(n_stops, 2)` in km, and the planned order.
  - `tour_km(points: np.ndarray, order: list[int]) -> float`: depot → stops in order → depot.
  - `nearest_neighbour(points: np.ndarray) -> list[int]`.

- [x] **Step 1: Check how generators are imported.** Run
  `grep -rn "synthetic-data/generators\|sd07_tracking\|import sd0" backend/analytics backend/synthetic-data | head`. If
  generators are loaded by path (`importlib` or a `sys.path` entry), follow that pattern in the test and in Task 3. The
  code below assumes a helper `_load_sd11()` in the test that loads the file by path.

- [x] **Step 2: Write the failing tests.** Create `backend/analytics/tests/test_route_demo.py`:

```python
"""Route reordering demo (C9c, SPEC §5.19): SD-11 stops, 2-opt reordering, the route_demo table."""
import importlib.util
from pathlib import Path

import numpy as np
import pytest

GEN = Path(__file__).resolve().parents[2] / "synthetic-data" / "generators" / "sd11_route_stops.py"


def _load_sd11():
    spec = importlib.util.spec_from_file_location("sd11_route_stops", GEN)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


sd11 = _load_sd11()


def test_ac_rdemo_01_seeded_and_scaled():
    """AC-RDEMO-01: same id, same stops; the planned tour measures planned_route_km."""
    a, order_a = sd11.stops_for("D000001", 10, 71.7)
    b, order_b = sd11.stops_for("D000001", 10, 71.7)
    assert a.shape == (10, 2) and np.array_equal(a, b) and order_a == order_b
    assert sd11.tour_km(a, order_a) == pytest.approx(71.7, abs=0.01)
    other, _ = sd11.stops_for("D000002", 10, 71.7)
    assert not np.array_equal(a, other)


@pytest.mark.parametrize("n", [6, 23, 40])
def test_ac_rdemo_01_any_stop_count(n):
    """AC-RDEMO-01: 6, 23 and 40 stops (the data's range is 6-40)."""
    pts, order = sd11.stops_for("D012345", n, 88.4)
    assert sorted(order) == list(range(n))
    assert sd11.tour_km(pts, order) == pytest.approx(88.4, abs=0.01)


def test_planned_order_is_nearest_neighbour():
    """Spec §3: a dispatcher-style plan, never a random order (which would inflate the saving)."""
    pts, order = sd11.stops_for("D000777", 15, 50.0)
    assert order == sd11.nearest_neighbour(pts)


def test_refuses_a_non_positive_plan():
    with pytest.raises(ValueError):
        sd11.stops_for("D000001", 10, 0.0)
```

- [x] **Step 3:** Run `cd backend && ../.venv/bin/python -m pytest -q analytics/tests/test_route_demo.py`. Expected:
  errors, because `sd11_route_stops.py` doesn't exist yet.

- [x] **Step 4: Implement.** Create `backend/synthetic-data/generators/sd11_route_stops.py`:

```python
"""SD-11 (SPEC §12.1, §5.19, C9c): synthetic stop positions per delivery for the route reordering demo.

Seeded by the delivery id, so the same delivery always gets the same stops. The fulfilment warehouse is the depot at
(0, 0). The planned order is a nearest-neighbour tour (a reasonable dispatcher's plan), and every point is scaled so that
tour measures the delivery's real planned_route_km. Positions are invented: the supplied data has none.
"""
import hashlib

import numpy as np

DEPOT = np.zeros(2)


def seed_for(delivery_id: str) -> int:
    return int.from_bytes(hashlib.sha256(delivery_id.encode()).digest()[:8], "little")


def tour_km(points: np.ndarray, order: list[int]) -> float:
    """Depot → points in `order` → depot, straight-line km."""
    path = np.vstack([DEPOT, points[order], DEPOT])
    return float(np.linalg.norm(np.diff(path, axis=0), axis=1).sum())


def nearest_neighbour(points: np.ndarray) -> list[int]:
    left, pos, order = list(range(len(points))), DEPOT, []
    while left:
        i = left.pop(int(np.argmin(np.linalg.norm(points[left] - pos, axis=1))))
        order.append(i)
        pos = points[i]
    return order


def stops_for(delivery_id: str, n_stops: int, planned_km: float) -> tuple[np.ndarray, list[int]]:
    """`n_stops` points uniform in a unit disc around the depot, scaled so the nearest-neighbour tour is `planned_km`."""
    if planned_km <= 0 or n_stops < 1:
        raise ValueError(f"{delivery_id}: need planned_km > 0 and at least one stop")
    rng = np.random.default_rng(seed_for(delivery_id))
    r, angle = np.sqrt(rng.random(n_stops)), rng.random(n_stops) * 2 * np.pi
    points = np.column_stack([r * np.cos(angle), r * np.sin(angle)])
    order = nearest_neighbour(points)  # scaling keeps the order: nearest stays nearest
    return points * (planned_km / tour_km(points, order)), order
```

- [x] **Step 5:** Run the same pytest command. Expected: 6 passed.

- [ ] **Step 6 (held):** commit `feat(c): SD-11 synthetic route stops (REQ-RDEMO-01)`.

---

### Task 3: 2-opt reordering and the `route_demo` table

**Files:**
- Create: `backend/analytics/routes/demo.py`
- Modify: `backend/analytics/routes/__init__.py`, `backend/analytics/bench.py` (`_one_in_subprocess`),
  `backend/analytics/tests/test_pipeline.py` (`CONTRACT_TABLES`)
- Test: `backend/analytics/tests/test_route_demo.py` (append)

**Interfaces:**
- Consumes: `stops_for`, `tour_km` from Task 2, loaded by path as in the test.
- Produces:
  - `two_opt(points: np.ndarray, order: list[int]) -> list[int]`.
  - `route_demo(d: pd.DataFrame) -> pd.DataFrame` with the CONTRACTS §4 columns. `stops` and both orders are JSON text.
  - The pipeline's `routes` step returns `route_demo` unless `ROUTE_DEMO=off`.

- [x] **Step 1: Write the failing tests.** Append to `test_route_demo.py`:

```python
import json
import os

from analytics.routes import demo


def test_two_opt_never_lengthens_and_keeps_every_stop():
    """AC-RDEMO-02 on one route: a permutation, no longer than the plan."""
    pts, planned = sd11.stops_for("D000042", 25, 60.0)
    best = demo.two_opt(pts, planned)
    assert sorted(best) == list(range(25))
    assert sd11.tour_km(pts, best) <= sd11.tour_km(pts, planned) + 1e-9


@pytest.fixture(scope="module")
def table(d):
    return demo.route_demo(d)


def test_ac_rdemo_02_every_row(table):
    """AC-RDEMO-02: every row of the supplied data."""
    for r in table.itertuples():
        for col in ("planned_order", "optimised_order"):
            assert sorted(json.loads(getattr(r, col))) == list(range(r.n_stops)), (r.delivery_id, col)
    assert (table.optimised_km <= table.planned_km + 0.01).all()


def test_ac_rdemo_03_rows_examples_and_real_columns(d, table):
    """AC-RDEMO-03: one row per delivery, synthetic, three examples; the real columns are the data's."""
    assert len(table) == 48_340 and table.synthetic.all()
    assert table.example.value_counts().to_dict() == {"overrun": 1, "on_plan": 1, "no_distance": 1}
    real = d.set_index("delivery_id")
    t = table.set_index("delivery_id")
    assert (t.planned_km == real.planned_route_km.loc[t.index]).all()
    assert (t.overran == real.f_route.loc[t.index]).all()
    ex = t[t.example.notna()]
    assert bool(ex.loc[ex.example.eq("overrun").idxmax(), "overran"])
    assert pd.isna(ex.loc[ex.example.eq("no_distance").idxmax(), "actual_km"])


def test_ac_rdemo_03_off_switch(monkeypatch, d):
    """AC-RDEMO-03: ROUTE_DEMO=off leaves the table out (the scale runs)."""
    from analytics.core.context import Ctx
    from analytics.core.load import DATA_DIR
    from analytics.core.scenarios import cause_attribution
    from analytics import routes
    monkeypatch.setenv("ROUTE_DEMO", "off")
    ctx = Ctx(d=d, clients=None, data_dir=DATA_DIR, tables={"cause_attribution": cause_attribution(d)})
    assert "route_demo" not in routes.build(ctx)
```

  Add `import pandas as pd` to the imports at the top of the file.

- [x] **Step 2:** Run the pytest command from Task 2. Expected: the new tests fail with `ImportError` (no `demo` module).

- [x] **Step 3: Implement.** Create `backend/analytics/routes/demo.py`:

```python
"""Route reordering demo (C9c, SPEC §5.19): 2-opt over SD-11's invented stops, written to route_demo.

Synthetic: positions, both orders and optimised_km are invented. Only planned_km, actual_km and overran are real.
Nothing but GET /api/labs/route-demo reads this table (REQ-RDEMO-06).
"""
import importlib.util
import json
from pathlib import Path

import numpy as np
import pandas as pd

_GEN = Path(__file__).resolve().parents[2] / "synthetic-data" / "generators" / "sd11_route_stops.py"
_spec = importlib.util.spec_from_file_location("sd11_route_stops", _GEN)
sd11 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(sd11)


def two_opt(points: np.ndarray, order: list[int]) -> list[int]:
    """Best-improvement 2-opt with the depot fixed at both ends; never returns a longer tour."""
    pts = np.vstack([sd11.DEPOT, points])            # index 0 is the depot
    route = np.array([0, *[i + 1 for i in order], 0])
    dist = np.linalg.norm(pts[:, None] - pts[None, :], axis=2)
    improved = True
    while improved:
        improved = False
        for i in range(1, len(route) - 2):
            js = np.arange(i + 1, len(route) - 1)
            a, b = route[i - 1], route[i]
            gain = dist[a, b] + dist[route[js], route[js + 1]] - dist[a, route[js]] - dist[b, route[js + 1]]
            k = int(np.argmax(gain))
            if gain[k] > 1e-9:
                j = js[k]
                route[i:j + 1] = route[i:j + 1][::-1]
                improved = True
    return [int(x) - 1 for x in route[1:-1]]


def _examples(t: pd.DataFrame) -> pd.Series:
    """One overrun, one on-plan and one no-distance delivery: the lowest delivery id of each kind whose reordering
    is shorter than the plan (fallback: the lowest id of that kind)."""
    kinds = {
        "overrun": t.overran,
        "on_plan": ~t.overran & t.actual_km.notna(),
        "no_distance": t.actual_km.isna(),
    }
    example = pd.Series([None] * len(t), index=t.index, dtype=object)
    for kind, mask in kinds.items():
        if mask.any():
            shorter = mask & (t.optimised_km < t.planned_km)
            pick = t[shorter if shorter.any() else mask]
            example[pick.sort_values("delivery_id").index[0]] = kind
    return example


def route_demo(d: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for r in d[["delivery_id", "stops_on_route", "planned_route_km", "actual_route_km", "f_route"]].itertuples(index=False):
        pts, planned = sd11.stops_for(r.delivery_id, int(r.stops_on_route), float(r.planned_route_km))
        best = two_opt(pts, planned)
        rows.append({
            "delivery_id": r.delivery_id, "n_stops": int(r.stops_on_route),
            "stops": json.dumps(np.round(pts, 3).tolist()),
            "planned_order": json.dumps(planned), "optimised_order": json.dumps(best),
            "planned_km": float(r.planned_route_km), "optimised_km": round(sd11.tour_km(pts, best), 3),
            "actual_km": None if pd.isna(r.actual_route_km) else float(r.actual_route_km),
            "overran": bool(r.f_route),
        })
    t = pd.DataFrame(rows)
    t["example"] = _examples(t)
    t["synthetic"] = True
    return t
```

  In `backend/analytics/routes/__init__.py`, change `build` to:

```python
import os

import pandas as pd

from analytics.core.context import Ctx
from analytics.routes import demo, overruns


def build(ctx: Ctx) -> dict[str, pd.DataFrame]:
    attribution = ctx.tables["cause_attribution"].set_index("cause")
    points = float(attribution.points_lost["f_route"])
    out = {"route_overruns": overruns.route_overruns(ctx.d, ctx.csv("sla_penalties.csv"), points)}
    if os.environ.get("ROUTE_DEMO", "on") != "off":   # C9c (SPEC §5.19); the scale runs set it off
        out["route_demo"] = demo.route_demo(ctx.d)
    return out
```

  Keep the existing module docstring.

  In `backend/analytics/bench.py` `_one_in_subprocess`, change the `subprocess.run` line to:

```python
    p = subprocess.run(cmd, cwd=BACKEND, capture_output=True, text=True, env={**os.environ, "ROUTE_DEMO": "off"})
```

  In `backend/analytics/tests/test_pipeline.py`, add `"route_demo"` to `CONTRACT_TABLES` next to `"route_overruns"`.

- [x] **Step 4:** Run `cd backend && ../.venv/bin/python -m pytest -q analytics/tests`. Expected: all pass, which was 102
  before plus the new ones.
  - Then time the new step: `../.venv/bin/python -m analytics.pipeline --dry-run`. The `routes:` line should take under
    180 s. If it takes longer, see the risk row in the spec before going further.
  - Then run `../.venv/bin/python -m analytics.bench` and check the golden checks still pass for x1, x10 and
    second-client.

- [x] **Step 5:** Write the test database: `set -a && . ../.env && set +a && ../.venv/bin/python -m analytics.pipeline --test-db`.
  Expected: `wrote 28 tables`.

- [ ] **Step 6 (held):** commit `feat(c): route_demo table with 2-opt reordering (REQ-RDEMO-02, -03)`.

---

### Task 4: API `GET /api/labs/route-demo[/:deliveryId]`

**Files:**
- Create: `backend/api/src/modules/carriers/routeDemo.ts`, `backend/api/test/carriers/routeDemo.test.ts`,
  `backend/api/test/routes/route-demo.test.ts`
- Modify: `backend/api/src/modules/carriers/queries.ts`, `backend/api/src/modules/carriers/routes.ts`,
  `backend/api/src/core/permissions.ts`

**Interfaces:**
- Consumes: the `route_demo` table from Task 3.
- Produces:
  - `RouteDemo`, the CONTRACTS §6 JSON.
  - `routeDemoRow(id: string): Promise<RouteDemo | null | 'no_table'>`.
  - `routeDemoExamples(): Promise<{ deliveryId: string; kind: string }[] | null>`.

- [x] **Step 1: Write the failing shape test.** Create `backend/api/test/carriers/routeDemo.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DELIVERY_ID, shapeRouteDemo } from '../../src/modules/carriers/routeDemo.js';

describe('route demo shape (C9c, CONTRACTS §6)', () => {
  it('AC-RDEMO-04: parses the JSON columns and marks the answer synthetic', () => {
    const r = shapeRouteDemo({
      delivery_id: 'D000001', n_stops: 2, stops: '[[1.5,0],[0,2]]', planned_order: '[0,1]', optimised_order: '[1,0]',
      planned_km: 7, optimised_km: 6.5, actual_km: null, overran: false, example: null, synthetic: true,
    });
    expect(r).toEqual({ synthetic: true, deliveryId: 'D000001', nStops: 2, stops: [[1.5, 0], [0, 2]], plannedOrder: [0, 1],
      optimisedOrder: [1, 0], plannedKm: 7, optimisedKm: 6.5, actualKm: null, overran: false });
  });

  it('AC-RDEMO-04: a delivery id is D plus six digits', () => {
    for (const ok of ['D000001', 'D999999']) expect(DELIVERY_ID.test(ok), ok).toBe(true);
    for (const bad of ['D1', 'x', 'D0000001', 'd000001', '']) expect(DELIVERY_ID.test(bad), bad).toBe(false);
  });
});
```

- [x] **Step 2:** Run `cd backend/api && npx vitest run test/carriers/routeDemo.test.ts`. Expected: FAIL, because the module
  doesn't exist.

- [x] **Step 3: Implement the shape.** Create `backend/api/src/modules/carriers/routeDemo.ts`:

```ts
/** Route reordering demo (C9c, SPEC §5.19). Python writes `route_demo` (SD-11, synthetic); this only reshapes a row. */

export const DELIVERY_ID = /^D\d{6}$/;

export interface RouteDemoDbRow {
  delivery_id: string; n_stops: number; stops: string; planned_order: string; optimised_order: string;
  planned_km: number; optimised_km: number; actual_km: number | null; overran: boolean; example: string | null;
  synthetic: boolean;
}

export interface RouteDemo {
  synthetic: true; deliveryId: string; nStops: number; stops: [number, number][]; plannedOrder: number[];
  optimisedOrder: number[]; plannedKm: number; optimisedKm: number; actualKm: number | null; overran: boolean;
}

export const shapeRouteDemo = (r: RouteDemoDbRow): RouteDemo => ({
  synthetic: true, deliveryId: r.delivery_id, nStops: r.n_stops, stops: JSON.parse(r.stops),
  plannedOrder: JSON.parse(r.planned_order), optimisedOrder: JSON.parse(r.optimised_order),
  plannedKm: r.planned_km, optimisedKm: r.optimised_km, actualKm: r.actual_km, overran: r.overran,
});
```

  Run the test again. Expected: PASS.

- [x] **Step 4: Write the failing route test.** Create `backend/api/test/routes/route-demo.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { clearCache } from '../../src/core/cache.js';
import { rolesFor } from '../../src/core/permissions.js';
import { pool, query } from '../../src/core/db/pool.js';
import { buildApp } from '../../src/server.js';
import { hasDb } from '../db.js';
import { AUTH_ON, bearer } from '../token.js';

afterAll(() => pool.end());

describe('route demo: who may read (SPEC-auth §4.4)', () => {
  it('AC-RDEMO-04: the Labs roles, as GET /api/compare; order_desk and customer_support are refused', async () => {
    for (const url of ['/api/labs/route-demo', '/api/labs/route-demo/:deliveryId']) expect(rolesFor('GET', url)).toEqual(rolesFor('GET', '/api/compare'));
    const a = await buildApp({ auth: AUTH_ON });
    for (const role of ['order_desk', 'customer_support']) {
      const r = await a.inject({ method: 'GET', url: '/api/labs/route-demo/D000001', headers: await bearer({ sub: 'u1', roles: [role] }) });
      expect([role, r.statusCode]).toEqual([role, 403]);
    }
    await a.close();
  });

  it('AC-RDEMO-06: no assistant, MCP or core analytics code reads route_demo', () => {
    const root = fileURLToPath(new URL('../../', import.meta.url));
    const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
    const files = [...walk(join(root, 'src/modules/mcp')), ...walk(join(root, 'src/modules/assistant')),
      ...walk(join(root, '../analytics/core'))].filter((f) => /\.(ts|py|md)$/.test(f));
    expect(files.length).toBeGreaterThan(5);
    expect(files.filter((f) => readFileSync(f, 'utf8').includes('route_demo'))).toEqual([]);
  });
});

describe.skipIf(!hasDb)('GET /api/labs/route-demo (needs test database)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });

  it('AC-RDEMO-04: the three examples, then one route in the §6 shape', async () => {
    const ex = (await app.inject({ method: 'GET', url: '/api/labs/route-demo' })).json();
    expect(ex.synthetic).toBe(true);
    expect(ex.examples.map((e: { kind: string }) => e.kind).sort()).toEqual(['no_distance', 'on_plan', 'overrun']);
    const r = (await app.inject({ method: 'GET', url: '/api/labs/route-demo/D000001' })).json();
    expect(r).toMatchObject({ synthetic: true, deliveryId: 'D000001', nStops: 10, plannedKm: 71.7, actualKm: 74.4, overran: false });
    expect(r.stops).toHaveLength(10);
    expect([...r.optimisedOrder].sort((a: number, b: number) => a - b)).toEqual([...Array(10).keys()]);
    expect(r.optimisedKm).toBeLessThanOrEqual(r.plannedKm + 0.01);
  });

  it('AC-RDEMO-04: 400 for a bad id, 404 for an unknown one, 503 when the table is missing', async () => {
    for (const id of ['D1', 'x', 'D0000001']) {
      const r = await app.inject({ method: 'GET', url: `/api/labs/route-demo/${id}` });
      expect([id, r.statusCode, r.json()]).toEqual([id, 400, { error: 'bad_delivery_id' }]);
    }
    const nf = await app.inject({ method: 'GET', url: '/api/labs/route-demo/D999999' });
    expect([nf.statusCode, nf.json()]).toEqual([404, { error: 'not_found' }]);
    await query('ALTER TABLE route_demo RENAME TO route_demo_hidden');
    try {
      clearCache();
      for (const url of ['/api/labs/route-demo', '/api/labs/route-demo/D000001']) {
        expect((await app.inject({ method: 'GET', url })).statusCode, url).toBe(503);
      }
    } finally {
      await query('ALTER TABLE route_demo_hidden RENAME TO route_demo');
      clearCache();
    }
  });
});
```

  `D000001` is the dataset's first row: 10 stops, planned 71.7 km, actual 74.4 km, so not an overrun. Confirm with
  `head -2 Halcyon-Hackathon-Dataset/deliveries.csv` before running.

- [x] **Step 5:** Run `npx vitest run test/routes/route-demo.test.ts`. Expected: FAIL. The routes return 404 from Fastify
  and the permission check fails.

- [x] **Step 6: Implement.** In `queries.ts`:
  - Add `import { shapeRouteDemo, type RouteDemo, type RouteDemoDbRow } from './routeDemo.js';`.
  - Add, next to `routeOverruns()`:

```ts
/** C9c (SPEC §5.19). 'no_table' while the pipeline has not written route_demo (42P01) or it is empty. */
export async function routeDemoRow(id: string): Promise<RouteDemo | null | 'no_table'> {
  try {
    const [any] = await query<{ n: number }>('SELECT count(*)::int AS n FROM (SELECT 1 FROM route_demo LIMIT 1) t');
    if (!any?.n) return 'no_table';
    const [row] = await query<RouteDemoDbRow>('SELECT * FROM route_demo WHERE delivery_id = $1', [id]);
    return row ? shapeRouteDemo(row) : null;
  } catch (err) {
    if ((err as { code?: string }).code === '42P01') return 'no_table';
    throw err;
  }
}

export async function routeDemoExamples(): Promise<{ deliveryId: string; kind: string }[] | null> {
  try {
    const rows = await cached('route_demo_examples', () => query<{ delivery_id: string; example: string }>(
      'SELECT delivery_id, example FROM route_demo WHERE example IS NOT NULL ORDER BY example'));
    return rows.length ? rows.map((r) => ({ deliveryId: r.delivery_id, kind: r.example })) : null;
  } catch (err) {
    if ((err as { code?: string }).code === '42P01') return null;
    throw err;
  }
}
```

  In `routes.ts`, add `routeDemoExamples, routeDemoRow` to the `./queries.js` import and
  `import { DELIVERY_ID } from './routeDemo.js';`. Then, after the `/routes/overruns` route:

```ts
  /** C9c (SPEC §5.19, REQ-RDEMO-04): one delivery's synthetic reordering demo (SD-11). Labs only. */
  app.get('/labs/route-demo', async (_req, reply) => {
    const examples = await routeDemoExamples();
    return examples ? { synthetic: true, examples } : reply.code(503).send({ error: 'route demo not computed yet: run the pipeline' });
  });

  app.get<{ Params: { deliveryId: string } }>('/labs/route-demo/:deliveryId', async (req, reply) => {
    if (!DELIVERY_ID.test(req.params.deliveryId)) return reply.code(400).send({ error: 'bad_delivery_id' });
    const r = await routeDemoRow(req.params.deliveryId);
    if (r === 'no_table') return reply.code(503).send({ error: 'route demo not computed yet: run the pipeline' });
    return r ?? reply.code(404).send({ error: 'not_found' });
  });
```

  In `permissions.ts`, after the `'GET /api/compare'` line:

```ts
  'GET /api/labs/route-demo': { roles: ACCOUNTS_READ }, // C9c: Labs (SPEC §5.19)
  'GET /api/labs/route-demo/:deliveryId': { roles: ACCOUNTS_READ }, // C9c: Labs
```

- [x] **Step 7:** Run `npx vitest run test/carriers/routeDemo.test.ts test/routes/route-demo.test.ts test/routes/permissions.test.ts`
  and `npx tsc --noEmit -p .`. Expected: all pass, and the typecheck is clean.

- [x] **Step 8:** Run the full `npx vitest run`. Expected: green, apart from recorded assistant tests if another session
  changed the prompt (note them; don't re-record here).

- [ ] **Step 9 (held):** commit `feat(c): GET /api/labs/route-demo (REQ-RDEMO-04, -06)`.

---

### Task 5: Labs card

**Files:**
- Create: `frontend/components/dashboard/replay/RouteDemoCard.tsx`, `frontend/components/dashboard/replay/RouteDemoCard.test.tsx`
- Modify: `frontend/components/dashboard/replay/replay.module.css` (append), `frontend/components/dashboard/replay/ReplayScreen.tsx`

**Interfaces:**
- Consumes: `GET /api/labs/route-demo` and `GET /api/labs/route-demo/:deliveryId` (Task 4 shapes).
- Produces: `<RouteDemoCard />`, which takes no props, and the exported constant `DEMO_CAVEAT`.

- [x] **Step 1: Write the failing test.** Create `RouteDemoCard.test.tsx`:

```tsx
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { mockApi, renderScreen } from '../test-utils';
import { DEMO_CAVEAT, RouteDemoCard } from './RouteDemoCard';

const route = (over: Record<string, unknown> = {}) => ({
  synthetic: true, deliveryId: 'D000010', nStops: 3, stops: [[10, 0], [0, 10], [-10, 0]], plannedOrder: [0, 2, 1],
  optimisedOrder: [0, 1, 2], plannedKm: 80, optimisedKm: 68, actualKm: 100, overran: true, ...over,
});
const EXAMPLES = { synthetic: true, examples: [
  { deliveryId: 'D000010', kind: 'overrun' }, { deliveryId: 'D000001', kind: 'on_plan' }, { deliveryId: 'D000005', kind: 'no_distance' }] };

describe('Labs route reordering card (C9c, SPEC §5.19)', () => {
  afterEach(cleanup);

  it('AC-RDEMO-05: badge, caveat, the three figures marked real or synthetic, and the example chips', async () => {
    mockApi({ '/api/labs/route-demo': EXAMPLES, '/api/labs/route-demo/D000010': route() });
    renderScreen(<RouteDemoCard />);
    expect(await screen.findByText('Synthetic data')).toBeTruthy();
    expect(screen.getByText(DEMO_CAVEAT)).toBeTruthy();
    expect(DEMO_CAVEAT).toBe("Stop positions are invented (SD-11): the saving shows what reordering does on these points, not on Halcyon's routes. The overrun compares the actual route with the plan, so a shorter plan does not change it.");
    const chips = screen.getByRole('group', { name: 'Example deliveries' });
    expect(within(chips).getAllByRole('button').map((b) => b.textContent)).toEqual(['D000010 · overran', 'D000001 · within 20%', 'D000005 · no distance']);
    fireEvent.click(within(chips).getByRole('button', { name: /D000010/ }));
    const figs = await screen.findByRole('list', { name: 'Route figures' });
    expect(within(figs).getByText('80.0 km')).toBeTruthy();
    expect(within(figs).getByText(/real, planned_route_km/)).toBeTruthy();
    expect(within(figs).getByText('68.0 km')).toBeTruthy();
    expect(within(figs).getByText(/synthetic, 15\.0% shorter than the plan/)).toBeTruthy();
    expect(within(figs).getByText('100.0 km')).toBeTruthy();
    expect(within(figs).getByText(/real, over plan by 25\.0%/)).toBeTruthy();
    expect(screen.getByRole('img', { name: /D000010: 3 invented stops/ })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/sign|vendor|approve/i);
  });

  it('AC-RDEMO-05: no actual distance, a typed id, and a 404', async () => {
    mockApi({ '/api/labs/route-demo': EXAMPLES, '/api/labs/route-demo/D000005': route({ deliveryId: 'D000005', actualKm: null, overran: false }) });
    renderScreen(<RouteDemoCard />);
    const box = await screen.findByLabelText('Delivery id');
    fireEvent.change(box, { target: { value: 'd000005' } });
    fireEvent.submit(box.closest('form')!);
    expect(await screen.findByText(/no actual distance recorded/)).toBeTruthy();
    fireEvent.change(box, { target: { value: 'D999999' } });
    fireEvent.submit(box.closest('form')!);
    expect(await screen.findByText('No delivery with that id.')).toBeTruthy();
  });
});
```

  `mockApi` answers unknown paths with 404 and `{ error: 'not found' }`; the API answers `{ error: 'not_found' }`.
  `getJSON` (`lib/api.ts` `check`) throws `new Error(data.error)`, so the card matches `/not.?found/i` on the message and
  shows "No delivery with that id." Any other error shows the fixed `Status` message.

- [x] **Step 2:** Run `cd frontend && npx vitest run components/dashboard/replay/RouteDemoCard.test.tsx`. Expected: FAIL,
  because the module doesn't exist.

- [x] **Step 3: Implement.** Create `RouteDemoCard.tsx`:

```tsx
'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Status, SyntheticBadge } from '@/components/dashboard/ui';
import { useApi } from '@/hooks/useApi';
import { getJSON } from '@/lib/api';
import s from './replay.module.css';

/** GET /api/labs/route-demo[/:deliveryId] (CONTRACTS §6, SPEC §5.19). Stops and both orders are SD-11, invented. */
interface RouteDemo {
  synthetic: true; deliveryId: string; nStops: number; stops: [number, number][]; plannedOrder: number[];
  optimisedOrder: number[]; plannedKm: number; optimisedKm: number; actualKm: number | null; overran: boolean;
}
interface Examples { synthetic: true; examples: { deliveryId: string; kind: string }[] }

export const DEMO_CAVEAT = "Stop positions are invented (SD-11): the saving shows what reordering does on these points, not on Halcyon's routes. The overrun compares the actual route with the plan, so a shorter plan does not change it.";
const KIND: Record<string, string> = { overrun: 'overran', on_plan: 'within 20%', no_distance: 'no distance' };
const ID = /^D\d{6}$/;
const km = (x: number) => `${x.toFixed(1)} km`;
const pct1 = (x: number) => `${(x * 100).toFixed(1)}%`;

/** The route as an SVG path through the depot (0, 0), scaled into a 0..100 box. */
function pathOf(r: RouteDemo, order: number[], fit: (p: [number, number]) => [number, number]): string {
  const pts: [number, number][] = [[0, 0], ...order.map((i) => r.stops[i]), [0, 0]];
  return pts.map((p, i) => `${i ? 'L' : 'M'}${fit(p).join(' ')}`).join(' ');
}

function Drawing({ r }: { r: RouteDemo }) {
  const span = Math.max(1e-9, ...r.stops.flatMap(([x, y]) => [Math.abs(x), Math.abs(y)]));
  const fit = ([x, y]: [number, number]): [number, number] => [50 + (x / span) * 44, 50 - (y / span) * 44];
  return (
    <svg className={s.rdSvg} viewBox="0 0 100 100" role="img"
      aria-label={`${r.deliveryId}: ${r.nStops} invented stops, planned and reordered routes from the warehouse`}>
      <path d={pathOf(r, r.plannedOrder, fit)} className={s.rdPlanned} />
      <path d={pathOf(r, r.optimisedOrder, fit)} className={s.rdOptimised} />
      {r.stops.map((p, i) => {
        const [cx, cy] = fit(p);
        return <circle key={i} cx={cx} cy={cy} r={1.6} className={s.rdStop}>
          <title>{`Stop ${i + 1}: planned ${r.plannedOrder.indexOf(i) + 1}, reordered ${r.optimisedOrder.indexOf(i) + 1}`}</title>
        </circle>;
      })}
      <rect x={47.5} y={47.5} width={5} height={5} className={s.rdDepot}><title>Fulfilment warehouse</title></rect>
    </svg>
  );
}

export function RouteDemoCard() {
  const ex = useApi<Examples>('/api/labs/route-demo');
  const [typed, setTyped] = useState('');
  const [id, setId] = useState<string | null>(null);
  const [state, setState] = useState<{ r?: RouteDemo; error?: 'not_found' | 'failed'; loading: boolean }>({ loading: false });

  useEffect(() => {
    if (!id) return;
    let live = true;
    setState({ loading: true });
    getJSON<RouteDemo>(`/api/labs/route-demo/${id}`)
      .then((r) => live && setState({ r, loading: false }))
      .catch((e: Error) => live && setState({ error: /not.?found/i.test(e.message) ? 'not_found' : 'failed', loading: false }));
    return () => { live = false; };
  }, [id]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = typed.trim().toUpperCase();
    if (ID.test(v)) setId(v); else setState({ error: 'not_found', loading: false });
  };
  const r = state.r;

  return (
    <section className={s.card} aria-labelledby="rd-head">
      <div className={s.rdHead}>
        <h2 id="rd-head">One route: planned vs reordered</h2>
        <SyntheticBadge />
      </div>
      <form className={s.rdForm} onSubmit={submit}>
        <label>Delivery id <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="D000123" /></label>
        <button type="submit">Show route</button>
      </form>
      {ex.data && (
        <div className={s.rdChips} role="group" aria-label="Example deliveries">
          {ex.data.examples.map((x) => (
            <button key={x.deliveryId} type="button" onClick={() => { setTyped(x.deliveryId); setId(x.deliveryId); }}>
              {x.deliveryId} · {KIND[x.kind] ?? x.kind}
            </button>
          ))}
        </div>
      )}
      <Status loading={ex.loading || state.loading} error={ex.error ?? (state.error === 'failed' ? 'failed' : undefined)} skeleton="block" />
      {state.error === 'not_found' && <p className={s.rdNote} role="alert">No delivery with that id.</p>}
      {r && !state.error && (
        <div className={s.rdBody}>
          <Drawing r={r} />
          <div>
            <ul className={s.rdLegend}>
              <li><i className={s.rdKeyPlanned} />Planned order</li>
              <li><i className={s.rdKeyOptimised} />Reordered</li>
            </ul>
            <ul className={s.rdFigs} aria-label="Route figures">
              <li><b>{km(r.plannedKm)}</b><span>planned (real, planned_route_km)</span></li>
              <li><b>{km(r.optimisedKm)}</b><span>reordered (synthetic, {pct1(1 - r.optimisedKm / r.plannedKm)} shorter than the plan)</span></li>
              <li><b>{r.actualKm == null ? '—' : km(r.actualKm)}</b>
                <span>{r.actualKm == null ? 'driven: no actual distance recorded'
                  : `driven (real, ${r.overran ? `over plan by ${pct1(r.actualKm / r.plannedKm - 1)}` : 'not more than 20% over the plan'})`}</span></li>
            </ul>
          </div>
        </div>
      )}
      <p className={s.rdNote}>{DEMO_CAVEAT}</p>
    </section>
  );
}
```

  Append to `replay.module.css`:

```css
/* C9c route reordering demo (SPEC §5.19) */
.rdHead { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; }
.rdHead h2 { margin: 0; font-size: 1.05rem; }
.rdForm { display: flex; flex-wrap: wrap; gap: 8px; align-items: end; margin-bottom: 10px; font-size: 0.8rem; }
.rdForm input { font: inherit; padding: 6px 8px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--ink); width: 9ch; }
.rdForm button, .rdChips button { font: inherit; font-size: 0.78rem; padding: 6px 10px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); cursor: pointer; }
.rdChips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.rdBody { display: grid; grid-template-columns: minmax(0, 320px) minmax(0, 1fr); gap: 20px; align-items: start; }
.rdSvg { width: 100%; height: auto; aspect-ratio: 1; background: var(--bg); border-radius: 12px; }
.rdPlanned { fill: none; stroke: var(--ink-2); stroke-width: 0.6; stroke-dasharray: 2 1.5; }
.rdOptimised { fill: none; stroke: var(--accent); stroke-width: 0.9; }
.rdStop { fill: var(--ink); stroke: var(--surface); stroke-width: 0.5; }
.rdDepot { fill: var(--surface); stroke: var(--ink); stroke-width: 0.8; }
.rdLegend { display: flex; gap: 16px; margin: 0 0 12px; padding: 0; list-style: none; font-size: 0.74rem; color: var(--ink-2); }
.rdLegend i { display: inline-block; width: 18px; height: 0; margin-right: 6px; vertical-align: middle; }
.rdKeyPlanned { border-top: 2px dashed var(--ink-2); }
.rdKeyOptimised { border-top: 2px solid var(--accent); }
.rdFigs { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; }
.rdFigs li { display: grid; gap: 2px; }
.rdFigs b { font-size: 1.15rem; font-variant-numeric: tabular-nums; }
.rdFigs span, .rdNote { font-size: 0.74rem; color: var(--ink-2); line-height: 1.5; }
.rdNote { margin: 12px 0 0; }
@media (max-width: 640px) { .rdBody { grid-template-columns: minmax(0, 1fr); } }
```

  In `ReplayScreen.tsx`, add `import { RouteDemoCard } from './RouteDemoCard';` after the `CompareCard` import, and
  `<RouteDemoCard />` on the line after `<CompareCard atRisk={atRisk} />`.

- [x] **Step 4:** Run the card test, then the full frontend suite: `npx vitest run`. Expected: the card tests pass, and
  `ReplayScreen.test.tsx` still passes. Its mocks 404 the new endpoints, so the card shows only its form and caveat; if a
  Replay test asserts on `role="alert"`, add the two endpoints to its mocks. `lib/confirm/atlas.test.ts` still fails to
  load until `azure-maps-control` is installed. `npx tsc --noEmit` should show no new errors.

- [x] **Step 5: Preview.** With `api-routes` and `web-routes` from `.claude/launch.json` running, open
  `http://localhost:3010/dashboard/labs`.
  - Click each chip and check the drawing, the three figures and the badge.
  - Check at 375 px (`resize_window` preset `mobile`) and in dark theme (`data-theme="dark"` on `<html>`).
  - Check `read_console_messages` shows no errors. Take a screenshot.

- [ ] **Step 6 (held):** commit `feat(c): Labs route reordering card (REQ-RDEMO-05)`.

---

### Task 6: Evidence and close

**Files:**
- Modify: `docs/TEST-EVIDENCE.md`, `docs/superpowers/plans/2026-11-05-route-reordering-demo.md` (tick the steps)

- [x] **Step 1:** Run the numbers-auditor agent on C9c. It checks that:
  - every real figure on the card (planned km, actual km, the overrun flag) matches `deliveries.csv` for the three
    example ids and five random ids;
  - no headline figure changed (71.0%, 14,019, the five causes, the replay).
- [x] **Step 2:** Run the reviewer agent on the C9c files: synthetic labels, the REQ-RDEMO-06 isolation, roles, no verdict
  or vendor wording, AC ids.
- [x] **Step 3:** Run the qa-evidence agent to add AC-RDEMO-01..06 to `docs/TEST-EVIDENCE.md`, with recorded providers only.
- [ ] **Step 4 (held):** open the PR naming REQ-RDEMO-01..06, when the user asks.

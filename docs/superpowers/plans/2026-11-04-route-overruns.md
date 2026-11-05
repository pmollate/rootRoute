# LateLens — Route overrun diagnostics (C9a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show Halcyon what its own route data says about route overruns (`f_route`, actual route more than 20% over
plan): where they happen, what they cost, and what the data can and cannot explain. Give the replay's "Last-mile watch"
row a real screen to link to, and let the assistant answer route questions from a read-only tool.

**Not the goal:** a routing engine. The supplied data has no stop locations, no stop order and no road network
(`deliveries.csv` holds only `stops_on_route`, `planned_route_km`, `actual_route_km`), so routes cannot be optimised
from it. Building a route optimiser would also model the routing vendor's product (CLAUDE.md, OS-03). A synthetic VRP
demo (phase 3) was considered and left out.

**Architecture:** Python (`backend/analytics/routes/`) computes `route_overruns`. Node
(`backend/api/src/modules/carriers/`) looks it up (Python creates and replaces the table on every run, so no migration) and serves it over REST and as an MCP/assistant tool. The Carriers
screen gets a Routes panel. Owner: Carriers area. Spec: SPEC §5.18 (v0.19), REQ-ROUTE-01 to -07.

**Tech Stack:** Python 3.12, pandas · Node 22, TypeScript, Fastify 5, zod 4, Vitest · Next.js 15 + React 19.

**Read first:** `docs/SPEC.md` §2.2, §2.4, §3 (C9, OS-03), §5.1 (`f_route`), §5.5 (CN-07), §5.16 (assistant), §12;
`docs/CONTRACTS.md` §4–§6 (C rows); `backend/analytics/core/scenarios.py` (`route_only`, `lanes_routes`, `adopt_all`).

## What the data says (computed 4 Nov from the supplied dataset; tests must recompute, not copy)

| Fact | Value |
|---|---|
| Deliveries with `f_route` | 2,880 |
| Rows with blank `actual_route_km` (never flagged) | 1,339 |
| Late rate, overrun vs no overrun | 62.6% vs 26.9% |
| Overrun rate by carrier (base: 47,001 with an actual distance) | 5.1% (D) – 7.0% (B) |
| Overrun rate by destination region | 5.9% – 6.3% |
| Overrun rate by fulfilment warehouse | 5.9% – 6.4% |
| Overrun rate by stops band (6–10 … 31–40) | 5.9% – 6.4% |
| Points of on-time lost to routes | 3.149, shown as 3.2 (rounded with the other causes to add to 29.0; SPEC v0.20) |
| Route-only upper bound / lanes + routes (replay) | 73.6% / 80.4% |

The rate is flat across every slice known before despatch, so the screen's message is: **overruns hurt, but nothing in
the data predicts which route will overrun.** The cause (traffic, driver choice, detours) is not in the data and stays an
open question (`[ROUTE_OVERRUN_CAUSE]`, SPEC §12).

## Global Constraints

- Supplied data only. No synthetic data on this screen; no "Synthetic data" badge needed.
- Every number comes from `route_overruns`; no figure is typed into the frontend, SPEC copy aside.
- A blank `actual_route_km` is not an overrun (EC-14). Report the blank rows as a data-quality gap; never drop them.
- No prediction: do not add `f_route`, `actual_route_km` or anything after despatch to the late-risk score (CN-07,
  AC-RISK-01). The breakdowns are diagnostic, after the fact.
- Product stance (REQ-ASK-13): show evidence, no "buy / don't buy routing" verdicts, no vendor modelling.
- One writer per table: Python writes `route_overruns`; Node only reads.
- Tests name their AC ids; commit messages `feat(c): …`; PR descriptions name REQ ids.

## File Structure

```
backend/analytics/routes/{__init__,overruns}.py
backend/analytics/tests/test_route_overruns.py
backend/analytics/pipeline.py                         (add the "routes" step)
backend/api/src/modules/carriers/{queries,routes}.ts  (add GET /api/routes/overruns)
backend/api/test/routes/route-overruns.test.ts
backend/api/src/modules/mcp/tools.ts                  (add route_overruns tool)
backend/api/test/fixtures/assistant/questions.json    (add route questions; re-record)
frontend/components/dashboard/carriers/{RoutesPanel.tsx,RoutesPanel.test.tsx,carriers.module.css}
frontend/components/dashboard/replay/ReplayScreen.tsx (route row links to the panel)
docs/SPEC.md, docs/CONTRACTS.md                       (Task R0)
```

## Schedule

| Order | Task | Depends on |
|---|---|---|
| 1 | R0 SPEC and CONTRACTS change | Team agreed 4 Nov to lift OS-03 for diagnostics only |
| 2 | R1 Python `route_overruns` | R0 |
| 3 | R2 API | R1 |
| 4 | R3 Routes panel | R2 |
| 5 | R4 Replay link + assistant tool | R2 (R3 for the link) |
| 6 | R5 Numbers check and evidence | R1–R4 |

About one working day in all.

---

### Task R0: Scope change in SPEC and CONTRACTS (spec-writer)

**Files:** `docs/SPEC.md`, `docs/CONTRACTS.md`

- [x] **Step 1:** In §3, split C9: **C9a Route overrun diagnostics** (Carriers, After submission) and **C9b Routing
  engine** (stays Pitch only). Reword OS-03 to "Building a routing engine or route optimiser (C9b)"; the reason
  stays the same.
- [x] **Step 2:** Add §5.18 "Route overrun diagnostics" with REQ-ROUTE-01 to -07 and AC-ROUTE-01 to -07 (SPEC v0.19).
- [x] **Step 3:** "Stands out" rule in `backend/analytics/rules.json`: `route_stands_out` `{ ratio: 1.5, min_n: 30 }`
  (a value with at least 30 measured deliveries whose overrun rate is over 1.5 × the `all` rate; highest today is carrier
  B at 1.14 ×). A 2-point spread rule was dropped: carrier spread is 1.8 points, too close to the line.
- [x] **Step 4:** §12: add `[ROUTE_OVERRUN_CAUSE]` (cause not in data). §14: sponsor question "Can carriers with an
  API (`has_api = Y`) share GPS traces or stop sequences?" §14.1: log the decision (discovery-recorder).
- [x] **Step 5:** CONTRACTS §4 table row and pipeline order, §6 endpoint `GET /api/routes/overruns`, tool name; SPEC-auth §4.4 roles.
- [ ] **Step 6:** Commit `docs(c): C9a route overrun diagnostics (REQ-ROUTE-01..07)`.

### Task R1: `route_overruns` in Python

**Files:** create `backend/analytics/routes/{__init__,overruns}.py`, `backend/analytics/tests/test_route_overruns.py`;
modify `backend/analytics/pipeline.py`.

- [x] **Step 1: Write the failing test** (`test_ac_route_01_counts`, `test_ac_route_02_cost`, `test_ac_route_03_blanks`,
  `test_ac_route_01_flat_spread`). Load with `analytics.core.load.load`, call `overruns.route_overruns(d, penalties, points_lost)`.
  Cover AC-ROUTE-01 to -04: `all` row `n` 48,340, `n_measured` 47,001, `n_overrun` 2,880, `n_blank` 1,339;
  `late_rate_overrun > late_rate_other`; cost and `points_lost` checks; no `stands_out` on the supplied data; fixture cases for
  a standing-out carrier and for `min_n`.
- [x] **Step 2:** Run `npm run test -- analytics` (or `pytest backend/analytics/tests/test_route_overruns.py`) and
  check that it fails.
- [x] **Step 3: Implement** `route_overruns(d, penalties, points_lost) -> DataFrame` with one row per (`slice`, `value`):
  the columns in CONTRACTS §4 (`route_overruns`); `overrun_rate` uses `n_measured` (rows with an actual distance) as the base.
  - `stops_band`: `up to 10`, `11-20`, `21-30`, `31+` (open at both ends; the data's range is 6–40).
  - `weekday` from `shipped_ts`, `month` from `order_received_ts`.
  - Use `d.f_route` from `core/load.py`; never recompute the flag.
- [x] **Step 4:** Add `("routes", routes.build)` to `STEPS` in `pipeline.py` (after carriers; also `test_pipeline` and `test_scale` step lists); `build(ctx)` returns
  `{"route_overruns": ...}`.
- [x] **Step 5:** Run the tests and `npm run pipeline` locally; check that `bench.py` golden numbers don't change.
- [ ] **Step 6:** Commit `feat(c): route_overruns table (REQ-ROUTE-01..04)`.

### Task R2: API

**Files:** create `backend/api/src/modules/carriers/routeOverruns.ts` (pure shaping), `backend/api/test/carriers/routeOverruns.test.ts`, `backend/api/test/routes/route-overruns.test.ts`; modify
`backend/api/src/modules/carriers/{queries,routes}.ts`, `backend/api/src/core/permissions.ts` (`CARRIER_READ`).

- [x] **Step 1:** No migration: Python creates `route_overruns` (CONTRACTS §4).
- [x] **Step 2: Failing route test** (AC-ROUTE-06): `GET /api/routes/overruns` returns the CONTRACTS §6 shape
  (`{ all, slices: [{ slice, spreadPts, standsOut, rows }] }`); 503 when the table is empty; 403 for `order_desk`
  with `AUTH_REQUIRED=on`.
- [x] **Step 3:** Implement the query and route in the carriers module, following the existing lane-scores pattern.
- [x] **Step 4:** `npm run test && npm run typecheck`.
- [ ] **Step 5:** Commit `feat(c): GET /api/routes/overruns (REQ-ROUTE-06)`.

### Task R3: Routes panel on the Carriers screen

**Files:** create `frontend/components/dashboard/carriers/{RoutesPanel.tsx,RoutesPanel.test.tsx}`; modify
`CarriersScreen.tsx`, `carriers.module.css`.

- [x] **Step 1: Failing component test** (AC-ROUTE-05): given a fixture response, the panel shows the overrun count,
  the late rate with and without an overrun, the cost, the min–max rate for each slice and, when no slice stands out,
  the sentence in AC-ROUTE-05 Given a slice with `stands_out`, it names that slice instead. It shows the blank-distance count as a
  data-quality note.
- [x] **Step 2:** Implement with the shared `ui.tsx` kit (stat tiles plus one small bar chart per slice; follow the
  `dataviz` skill). Anchor `id="routes"` so other screens can link to it.
- [x] **Step 3:** Evidence only, no verdict copy; an "Open question" line for `[ROUTE_OVERRUN_CAUSE]`.
- [x] **Step 4:** `npm run test`, `npm run typecheck`, then check it in the preview (light and dark, mobile width).
- [ ] **Step 5:** Commit `feat(c): Routes panel on Carriers (REQ-ROUTE-05)`.

### Task R4: Replay link and assistant tool

**Files:** modify `frontend/components/dashboard/replay/ReplayScreen.tsx`, `backend/api/src/modules/mcp/tools.ts`,
`backend/api/test/fixtures/assistant/questions.json`; tests beside each.

- [x] **Step 1:** In `ReplayScreen.tsx`, point the route cause's `href` to `/dashboard/carriers#routes` (it now goes
  to the top of Carriers). Update the test.
- [x] **Step 2: Failing tool test** (AC-ROUTE-07): `route_overruns` appears in `TOOLS`, `readOnly: true`, optional
  input `slice`; it returns the table rows and no other data.
- [x] **Step 3:** Implement the tool; it is shared by MCP and the assistant through the one registry (C14).
- [x] **Step 4:** (done 5 Nov: questions and eval cases data-19, data-20 added; `route_overruns` description points lane
  and Friday questions to `lane_scores`; `record:assistant` re-recorded. A full `eval:assistant` recording failed the gate
  at 41/49 with two safety failures not caused by this work (`oos-06`, `role-02`), so its recordings were not kept: the
  replay gate runs on the 13 cases `record:assistant` covers. Fixing the prompt is separate work.) Add "Which carrier has the most route overruns?" and "Do route overruns make deliveries late?" to
  `questions.json`; re-record per `docs/SPEC-ai-evals.md`. Keep "How fast is the vendor's routing engine?" in
  `out-of-scope.json` (still refused, AC-ASK-06).
- [ ] **Step 5:** `npm run test` (625 pass, 5 Nov); commit `feat(c): route_overruns tool and replay link (REQ-ROUTE-07)`.

### Task R5: Numbers check and evidence

- [x] **Step 1:** Run the numbers-auditor agent; the Routes panel, API and SPEC must agree on 2,880 / 1,339 /
  3.2 points (SPEC v0.20 rounding) / 73.6% / 80.4%.
- [x] **Step 2:** Run the reviewer agent on the branch (fair data, ownership, no figures typed in, AC ids).
- [x] **Step 3:** qa-evidence agent refreshes `docs/TEST-EVIDENCE.md`.
- [ ] **Step 4:** Open the PR naming REQ-ROUTE-01..07.

## Open points for the team

- (Decided 5 Nov, SPEC v0.20: kept, relabelled "route overruns cut by 30% (assumed; no fix built)".) The replay's "Last-mile watch" uses a 30% adoption rate (`rules.json`) for a fix the app doesn't build. This plan
  doesn't change it. Decide whether to keep it, relabel it as an assumption, or drop it.
- Phase 3 (synthetic stop locations + OR-Tools VRP demo) is out of this plan. If wanted, it needs its own SD-xx
  generator, a "Synthetic data" badge, and must never feed headline figures or the replay.

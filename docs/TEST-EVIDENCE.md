# Test evidence

Root Route's test results by area, with the acceptance criteria (ACs) each suite covers. Written by the `qa-evidence`
agent (`.claude/agents/qa-evidence.md`, SPEC §9.1) and rewritten after each run. This run was asked to change this
file only, so it has no separate run record; the raw counts and the exact failure text are below. The run before this
one (5 Nov, 01:09 to 01:14 IST, same base commit, C9a only, 943 tests) was recorded in this file and is replaced here.
The last run with a run record (30 Oct, commit `32c8197`, 737 tests) is in
[`agent-runs/2026-10-30-qa-evidence-2.md`](agent-runs/2026-10-30-qa-evidence-2.md).

**Run date:** 5 Nov 2026, 05:14 to 05:19 IST · **Commit:** `d4f8776` (branch `fix-journey-e2e-latest-email`) **plus
uncommitted changes**: the C9a route overrun work (SPEC §5.18, REQ-ROUTE-01 to -07, plan
[`superpowers/plans/2026-11-04-route-overruns.md`](superpowers/plans/2026-11-04-route-overruns.md)), the C9c route
reordering demo (SPEC §5.19, REQ-RDEMO-01 to -06, plan
[`superpowers/plans/2026-11-05-route-reordering-demo.md`](superpowers/plans/2026-11-05-route-reordering-demo.md)), and
another session's assistant prompt edit and re-record (see [Before you read the numbers](#before-you-read-the-numbers)).
**Machine:** macOS, Node 24.22.1, Python 3.12.16 (`.venv`), Postgres in Docker (`root-route-db-1`),
`LLM_PROVIDER=recorded`. No live model or paid service was called.

## Before you read the numbers

- **None of this is committed.** Every number here comes from the working tree on top of `d4f8776`. CI and CD have not
  run on it, and the deployed app does not have it. Another session shares this checkout, so the working tree can
  change after this run.
- **The assistant re-record looks finished, but that is not confirmed.** In the 01:09 run, another session was
  re-recording assistant answers live (`eval:assistant --repeat 3`) and files in `backend/api/test/recordings/` were
  still being written. In this run the newest recording was saved at 01:39 and no `eval:assistant` process was running.
  The recorded assistant eval now passes 49 / 49 (it was 47 / 49 at 01:09), and `test/routes/assistant.test.ts` passed
  7 / 7. The recordings are still uncommitted (19 deleted and 92 new in `git status` at 05:19), so these numbers hold only with this
  working tree's recordings.

## Summary

| Suite | Command | Files | Tests passed / total |
|---|---|---|---|
| Python analysis and data (pytest) | `cd backend && ../.venv/bin/python -m pytest -q analytics/tests` | 18 | **112 / 112** (57.1 s) |
| API (vitest, real Postgres test database, recorded AI answers) | `npm --prefix backend/api test` | 74 | **635 / 636**, 1 skipped, 0 failed |
| Dashboard (vitest, jsdom) | `npm --prefix frontend test` | 31 (30 passed, 1 **failed to load**) | **225 / 225**, exit 1 |
| Assistant eval, recorded replay | `LLM_PROVIDER=recorded npm --prefix backend/api run eval:assistant` | n/a | **49 / 49 cases**, gate passed |
| Typecheck: API `tsc` | `npm --prefix backend/api run lint` | n/a | **Not re-run** in this run (0 errors at 01:09, before C9c) |
| Typecheck: frontend `tsc` | `npm run typecheck` (frontend step) | n/a | **Not re-run** in this run (4 errors at 01:09, all from the missing `azure-maps-control`) |
| WMS simulator (`node --test`) | `npm run test:sim` | n/a | **Not run** in this run |
| Playwright e2e and smoke (`frontend/e2e/`) | `npm run e2e` | n/a | **Not run.** It runs in CD after a deploy |
| **Total tests run here** | | **123** | **972 passed, 1 skipped, 1 file failed to load** |

Each suite was run twice, once plainly and once with a JSON or JUnit reporter for the per-file counts below. Both runs
gave the same counts. Since the 01:09 run: Python +10 (all in `test_route_demo.py`); API +9 (7 in the two route demo
files, 2 more in the Platform area); dashboard +10 (6 in `RouteDemoCard.test.tsx`, 1 more in the Carriers area and 3
more in the Warehouse area, which include the rounding tests in `RoutesPanel.test.tsx` and `lib/metrics.test.ts` added
after the 01:09 run). The 01:09 run kept no per-file record, so the non-demo changes are given by area only.

**Skipped:** `test/intake/reply-eval.test.ts`, "AC-INT-03, AC-INT-06, AC-SEC-02, AC-SEC-05: the recorded drafts pass the
eval gate". The test skips itself when no recorded reply draft is found (`if (graded.length === 0) ctx.skip()`). It
passed on 30 Oct, so its recordings are probably among the ones changed in the working tree. Those four ACs are also
named by other tests that passed.

**Failed to load:** `frontend/lib/confirm/atlas.test.ts` (0 tests ran). Exact output:

```
 FAIL  lib/confirm/atlas.test.ts [ lib/confirm/atlas.test.ts ]
Error: ENOENT: no such file or directory, open '/Users/pmollate/code/root-route/frontend/node_modules/azure-maps-control/package.json'
 ❯ lib/confirm/atlas.test.ts:7:30
```

`azure-maps-control` is in `frontend/package.json` but is not installed in this machine's `node_modules`. The same
missing package causes the 4 frontend typecheck errors, all in `components/confirm/ConfirmMap.tsx`:

```
components/confirm/ConfirmMap.tsx(8,28): error TS2307: Cannot find module 'azure-maps-control' or its corresponding type declarations.
components/confirm/ConfirmMap.tsx(68,75): error TS7006: Parameter 'resolve' implicitly has an 'any' type.
components/confirm/ConfirmMap.tsx(75,30): error TS7006: Parameter 'e' implicitly has an 'any' type.
components/confirm/ConfirmMap.tsx(90,32): error TS7006: Parameter 'e' implicitly has an 'any' type.
```

Those typecheck errors are from the 01:09 run; the typecheck was not re-run for C9c. The load failure is from this run
and does not touch the route overrun or route demo work. Both come from the local install: CI installs with `npm ci`.

ACs named by a test that ran and passed here: **181 of the 242** in the SPEC files (see [Known gaps](#known-gaps)).
The 6 new ACs are AC-RDEMO-01 to -06, and all 6 are named by tests that passed.

## Route overruns (C9a): AC map

Every AC-ROUTE id is named by at least one test that ran and passed in this run.

| AC | What it checks (SPEC §5.18) | Tests that name it (all passed) |
|---|---|---|
| AC-ROUTE-01 | `all` row counts (48,340 · 47,001 measured · 2,880 overrun); every slice sums to the whole; overruns are exactly `f_route` | `backend/analytics/tests/test_route_overruns.py::test_ac_route_01_counts` |
| AC-ROUTE-02 | late rate of overruns above the rest; handling = $34 × late overruns; penalties; points lost = `cause_attribution` | `test_route_overruns.py::test_ac_route_02_cost` |
| AC-ROUTE-03 | deliveries with no actual route km (1,339) are counted, never flagged, never dropped | `test_route_overruns.py::test_ac_route_03_blanks` |
| AC-ROUTE-04 | nothing stands out in the supplied data; a high carrier does on a fixture, but not under `min_n` | `test_route_overruns.py::test_ac_route_04_stands_out` |
| AC-ROUTE-05 | Routes panel: figures, each slice's range, the "No carrier … stands out" sentence, the no-distance count and the open question; names a value that stands out instead | `frontend/components/dashboard/carriers/RoutesPanel.test.tsx` (2 tests, both "AC-ROUTE-05: …") |
| AC-ROUTE-06 | `GET /api/routes/overruns` in the CONTRACTS §6 shape; empty or missing table answers 503; same roles as `GET /api/carriers` | `backend/api/test/carriers/routeOverruns.test.ts` (2 tests); `backend/api/test/routes/route-overruns.test.ts` (3 tests: roles, shape, 503) |
| AC-ROUTE-07 | `route_overruns` is read-only and offered to the roles of `lane_scores`; a recorded route question is answered from it; the vendor routing-engine question still gets the fixed refusal | `backend/api/test/routes/route-overruns.test.ts` ("the route_overruns tool returns the same data, or one slice"); `backend/api/test/assistant/tools.test.ts` ("route_overruns is read-only, takes an optional slice and refuses an unknown one"); `backend/api/test/assistant/answer.test.ts` ("AC-ASK-09, AC-ROUTE-07: … order_desk gets four tools, carrier_manager all seven …"); `backend/api/test/routes/assistant.test.ts` ("AC-ROUTE-07: a route-overrun question is answered from route_overruns, every figure checked" and "AC-ASK-06, AC-ROUTE-07: every out-of-scope question gets the fixed refusal (the vendor routing-engine one too)") |

Tests that cover the route work but do not name an AC-ROUTE id (not counted in the coverage figure):
- `test_route_overruns.py::test_stops_outside_the_data_range_do_not_stop_the_pipeline` (review R5-5: 3 or 55 stops land
  in an open-ended band) and `::test_slice_values` (stops bands, weekday, order month).
- `backend/analytics/tests/test_pipeline.py` and `test_scale.py` now expect the `route_overruns` table and the `routes`
  pipeline step.
- `backend/api/test/mcp.test.ts`, "AC-MCP-01: lists only read-only tools, each marked read-only": the tool list now
  includes `route_overruns`.
- `backend/api/test/routes/assistant-tools.test.ts`, "AC-SEC-ASK-04: no personal key and no email address in any tool
  output": runs `route_overruns` with no slice and with each of the six slices.
- `frontend/components/dashboard/replay/ReplayScreen.test.tsx`, "C9a: a route-overrun account links to the Routes panel,
  and only for roles that can open Carriers".
- `frontend/lib/auth/auth.test.ts`, "AC-AUTH-15: sub-paths follow their screen; …": `/dashboard/carriers#routes` follows
  the Carriers permission (refused for `warehouse_supervisor`, allowed for `carrier_manager`).
- `frontend/components/dashboard/carriers/CarriersScreen.test.tsx` mocks `/api/routes/overruns` for the screen's tests.

### Manual preview check, C9a (reported, not repeated by QA)

The session that built C9a reported a manual check of the Routes panel at
<http://localhost:3010/dashboard/carriers#routes> on 5 Nov: on desktop, at 375 px wide and in dark theme, with **no
console errors**. QA did not repeat that visual check. In the 01:09 run QA only confirmed that the local preview was serving:
`curl` on `http://localhost:3010/dashboard/carriers` and `/login` both returned 200.

### Numbers audit, 5 Nov (C9a)

The numbers audit of 5 Nov (reported by the C9a session, not repeated here) found that every route overrun figure
matches the supplied dataset, with one exception: **route points lost are 3.149** (`cause_attribution`). The Overview
and the Routes panel show **3.1** (one decimal), while SPEC §2.2 and CLAUDE.md show **3.2** so the five causes add to
29.0. At the audit the parts on screen added to 28.9; decided 5 Nov (SPEC v0.20): screens now round to the total, showing 3.2. The SPEC §5.18 figures
the tests recompute (not copy) are 2,880 overruns of 47,001 measured, 1,339 with no distance, late 62.6% vs 26.9%, and
$102,960 penalties plus $61,336 handling. Every AC-ROUTE-01 to -04 test passed against them in this run.

## Route reordering demo (C9c): AC map

Every AC-RDEMO id is named by at least one test that ran and passed in this run. The demo's stop positions are
synthetic (generator SD-11, `backend/synthetic-data/generators/sd11_route_stops.py`), and the card shows the
"Synthetic data" badge.

| AC | What it checks (SPEC §5.19) | Tests that name it (all passed) |
|---|---|---|
| AC-RDEMO-01 | SD-11 places the same points twice for `D000001` (10 stops, 71.7 planned km), and the nearest-neighbour tour measures 71.7 km ± 0.01; the same for 6, 23 and 40 stops | `backend/analytics/tests/test_route_demo.py::test_ac_rdemo_01_seeded_and_scaled`, `::test_ac_rdemo_01_any_stop_count[6]`, `[23]`, `[40]` |
| AC-RDEMO-02 | on every `route_demo` row, `planned_order` and `optimised_order` are permutations of `0..n_stops-1` and `optimised_km` ≤ `planned_km` + 0.01 | `test_route_demo.py::test_ac_rdemo_02_every_row` |
| AC-RDEMO-03 | one row per delivery (48,340), `synthetic` true on all, exactly one `overrun`, `on_plan` and `no_distance` example; `ROUTE_DEMO=off` produces no table | `test_route_demo.py::test_ac_rdemo_03_rows_examples_and_real_columns`, `::test_ac_rdemo_03_off_switch` |
| AC-RDEMO-04 | `GET /api/labs/route-demo` lists the three examples; `/D000001` returns the CONTRACTS §6 shape with `synthetic: true`; `D1`, `x`, `D0000001` get 400, `D999999` 404, a missing table 503; `order_desk` and `customer_support` get 403 | `backend/api/test/carriers/routeDemo.test.ts` (2 tests: "parses the JSON columns and marks the answer synthetic", "a delivery id is D plus six digits"); `backend/api/test/routes/route-demo.test.ts` (4 tests: "the Labs roles, as GET /api/compare; order_desk and customer_support are refused", "the three examples, then one route in the §6 shape", "400 for a bad id, 404 for an unknown one, 503 when the table is missing", "an empty examples answer is not cached; it fills in once rows exist") |
| AC-RDEMO-05 | the Labs card shows the badge, the fixed sentence, planned km marked real, reordered km marked synthetic with "x% shorter than the plan", actual km with "over plan by y%" or "no actual distance recorded", the three example chips; a 404 shows "No delivery with that id."; no text matches `sign\|vendor\|approve` | `frontend/components/dashboard/replay/RouteDemoCard.test.tsx` (6 tests, all "AC-RDEMO-05: …": the badge, caveat, figures and chips; an overrun just past 20% prints two decimals; no shorter order is not shown as 0.0% shorter; no actual distance, a typed id and a 404; the same id fetches again after an invalid submit; an invalid submit while a request is pending keeps the error) |
| AC-RDEMO-06 | no source in `backend/api/src/modules/mcp/`, `backend/api/src/modules/assistant/` or `backend/analytics/core/` mentions `route_demo` | `backend/api/test/routes/route-demo.test.ts` ("AC-RDEMO-06: no assistant, MCP or core analytics code reads route_demo") |

Tests in `test_route_demo.py` that cover the demo but do not name an AC-RDEMO id (not counted in the coverage figure):
`test_planned_order_is_nearest_neighbour`, `test_refuses_a_non_positive_plan` and
`test_two_opt_never_lengthens_and_keeps_every_stop`. `backend/analytics/tests/test_scale.py` sets `ROUTE_DEMO=off` for
the scale runs and passed.

### Numbers audit, 5 Nov (C9c, reported, not repeated by QA)

The C9c session reported a numbers audit on 5 Nov. All 48,340 `route_demo` rows match `deliveries.csv` on planned km,
actual km, the overrun flag and the stop count. The synthetic tours recompute within 0.0081 km. No headline figure
changed. The saving appears only on the Labs card. QA did not repeat the row-by-row audit. In this run,
`test_ac_rdemo_03_rows_examples_and_real_columns` (row count and the real columns) and `test_ac_rdemo_02_every_row`
passed, and the AC-RDEMO-06 source check passed (no assistant, MCP or core analytics code reads `route_demo`).

### Final review, C9c (reported, not repeated by QA)

The final review of C9c found **no Critical or Important findings**. Its record,
`.superpowers/sdd/2026-11-05-route-reordering-demo/progress.md`, notes "Final review: clean (0 Critical, 0 Important)",
followed by one fix wave ("8/8 addressed"). The deferred minor findings are listed in that file, one line per task.

### Manual preview check, C9c (reported, not repeated by QA)

The implementer reported checking the Labs card on desktop, at 375 px wide and in dark theme, with **no console
errors**. QA did not repeat that visual check.

### Timing, C9c (reported)

The implementer reported that the pipeline's `routes` step, which now writes `route_demo`, takes about 20 s, and that
the scale runs skip the demo (`ROUTE_DEMO=off`). QA did not time the pipeline step. In this run `test_route_demo.py`
took 18.3 s on its own, and the full Python suite took 57.1 s (it was not timed in the 01:09 run).

## By area

ACs are collected from test names and docstrings. That means `AC-…` ids (including multi-part ids such as
`AC-SEC-AUTH-03`, and short forms such as `AC-INT-01/02/04/05` and `AC-LINK-01 to -05`), and `test_ac_…` names in
Python. Only tests that ran and passed count: the skipped `reply-eval.test.ts` and the unloaded `atlas.test.ts` are left
out. A test that covers an AC without naming it is not counted.

### Email (order intake, address check and link, replies, complaints, WMS entry)

| Suite | Passed / total | Files | ACs covered |
|---|---|---|---|
| Python | 10 / 10 | 2: `test_intake_fixtures.py`, `test_intake_sd04.py` | AC-SEC-05 |
| API | 445 / 446 (1 skipped: `reply-eval`) | 39: `test/intake/*` (29), `gmail`, `llm`, `maps`, `pii`, `wms-config`, `routes/intake`, `routes/intake-input`, `routes/review`, `routes/complaints`, `routes/link` | AC-AUTH-14, AC-CMP-01 to 03, AC-INT-01 to 08, AC-INT-10, AC-INT-14 to 18, AC-JRN-05, AC-JRN-15, AC-JRN-16, AC-JRN-19, AC-LINK-01 to 09, AC-LINK-11 to 14, AC-LINK-16 to 19, AC-NFR-02, AC-PRI-01, AC-PRI-02, AC-RISK-01, AC-RISK-02, AC-SEC-02 to 05, AC-SEC-AUTH-10, AC-SEC-JRN-04, AC-SEC-LINK-01 to 06, AC-SEC-LINK-08 to 12 |
| Dashboard | 99 / 99 (plus `atlas.test.ts`, failed to load) | 10: `IntakeScreen`, `OrderReview`, `ComplaintsScreen`, `ConfirmScreen`, `ConfirmMap`, `VerifyStep`, `lib/auth/link`, `lib/confirm/load`, `lib/confirm/atlas`, `lib/mailTime` | AC-AUTH-05, AC-AUTH-10, AC-AUTH-11, AC-AUTH-14, AC-CMP-02, AC-INT-08, AC-INT-10, AC-INT-14, AC-INT-15, AC-INT-19, AC-LINK-02, AC-LINK-03, AC-LINK-06, AC-LINK-07, AC-LINK-09 to 13, AC-LINK-15 to 19, AC-SEC-04, AC-SEC-LINK-04, AC-SEC-LINK-05, AC-SEC-LINK-07, AC-SEC-LINK-08, AC-SEC-LINK-12 |

#### Extraction eval

`backend/api/test/intake/eval.test.ts` (test `AC-INT-01/02/04/05, AC-SEC-02, AC-SEC-05`) ran on the 50 fixture emails
with recorded model, PII and map responses. Its output in this run (the file run by itself with `--reporter=verbose`) was:

```
intake eval: fields 245/245 (100.0%) · incomplete caught 10/10 (100.0%) · decisions 49/50 (98.0%)
```

That is **49 / 50 decisions correct (target ≥ 48 / 50, AC-INT-04)**, 245 / 245 fields matching gold (target ≥ 90%,
AC-INT-05), and 10 / 10 incomplete addresses caught (target ≥ 95%). These come from recorded answers. The live
extraction eval (`intake-eval.yml`, manual) was not run, as the brief asked.

### Warehouse (diagnosis, replay, promise rules, stock, risk)

| Suite | Passed / total | Files | ACs covered |
|---|---|---|---|
| Python | 63 / 63 | 6: `test_scenarios.py` (43), `test_diagnosis.py`, `test_load.py`, `test_stock.py`, `test_warehouse.py`, `test_risk.py` | AC-DIAG-01 to 05, AC-DIAG-07, AC-REP-01, AC-REP-02, AC-REP-04 to 08, AC-PRO-05, AC-PEN-01, AC-STK-01 to 03, AC-RISK-01, AC-NFR-05, AC-DATA-21 |
| API | 21 / 21 | 5: `warehouse/domain`, `warehouse/overview`, `routes/warehouse`, `routes/placement`, `routes/alerts` | AC-PRO-01 to 04, AC-PEN-01, AC-REP-10, AC-RISK-03, AC-UI-01, AC-NFR-01, AC-DATA-21 (also names AC-DIAG-06, which no SPEC file defines) |
| Dashboard | 13 / 13 | 4: `OverviewScreen` (2), `ReplayScreen` (6), `WarehousesScreen` (1), `lib/metrics` (4) | AC-UI-01, AC-UI-02, AC-UI-04, AC-REP-09, AC-DATA-21 |

### Carriers (lane scores, block rule, backtest, tracking, order journey, route overruns, route reordering demo)

| Suite | Passed / total | Files | ACs covered |
|---|---|---|---|
| Python | 23 / 23 | 6: `test_carriers_lanes.py`, `test_capacity.py`, `test_backtest.py`, `test_tracking.py`, `test_route_overruns.py` (6), `test_route_demo.py` (10, new) | AC-CAR-01, AC-CAR-02, AC-CAR-05, AC-CAR-08, AC-TRK-01, AC-ROUTE-01 to 04, **AC-RDEMO-01 to 03** |
| API | 59 / 59 | 14: `carriers/domain`, `carriers/journey`, `carriers/orderEvents`, `carriers/autoAdvance`, `carriers/routeOverruns` (3), `carriers/routeDemo` (2, new), `routes/carriers`, `routes/backtest`, `routes/journey`, `routes/tracking`, `routes/order-events`, `routes/auto-advance`, `routes/route-overruns` (4), `routes/route-demo` (5, new) | AC-CAR-03 to 08, AC-JRN-01 to 04, AC-JRN-07, AC-JRN-13 to 15, AC-JRN-17, AC-JRN-18, AC-SEC-JRN-04, AC-TRK-02, AC-ROUTE-06, AC-ROUTE-07, **AC-RDEMO-04, AC-RDEMO-06** |
| Dashboard | 34 / 34 | 5: `CarriersScreen` (8), `RoutesPanel` (6), `JourneyScreen` (10), `settings/AutoAdvanceCard` (4), `replay/RouteDemoCard` (6, new; the card sits on the Labs (Replay) screen but is route work, so it is counted here) | AC-CAR-02, AC-JRN-07, AC-JRN-08, AC-AUTH-10, AC-AUTH-11, AC-DATA-21, AC-SET-02, AC-ROUTE-05, **AC-RDEMO-05** |

### Platform (sign-in and roles, permissions, assistant, MCP, database, pipeline, data window, scale)

| Suite | Passed / total | Files | ACs covered |
|---|---|---|---|
| Python | 16 / 16 | 4: `test_db.py`, `test_pipeline.py`, `test_scale.py`, `test_window.py` | AC-DATA-01, AC-DATA-21, AC-DATA-23, AC-DIAG-01, AC-CAR-05 |
| API | 110 / 110 | 16: `auth`, `platform`, `env-config`, `mcp`, `routes/mcp`, `routes/permissions`, `routes/settings`, `assistant/*` (7), `routes/assistant`, `routes/assistant-tools` | AC-AUTH-03 to 07, AC-AUTH-13, AC-AUTH-14, AC-AUTH-16, AC-SEC-AUTH-03, AC-SEC-AUTH-06, AC-SEC-AUTH-09, AC-SEC-AUTH-13, AC-SEC-LINK-05, AC-ASK-02 to 14, AC-NFR-ASK-02, AC-SEC-ASK-01 to 06, AC-MCP-01 to 03, AC-SET-01, AC-ROUTE-07 |
| Dashboard | 79 / 79 | 12: `LoginForm`, `UserMenu`, `DashboardShell`, `Router`, `RouterDock`, `ui`, `lib/api`, `lib/dataWindow`, `lib/theme`, `lib/auth/auth`, `lib/auth/refusals`, `lib/auth/rewrite` | AC-AUTH-01 to 03, AC-AUTH-08 to 11, AC-AUTH-13, AC-AUTH-15, AC-NFR-AUTH-04, AC-SEC-AUTH-01, AC-SEC-AUTH-03 to 05, AC-SEC-AUTH-08, AC-SEC-AUTH-09, AC-SEC-AUTH-12, AC-ASK-01, AC-ASK-08, AC-ASK-10, AC-ASK-14, AC-SEC-ASK-03, AC-SEC-ASK-06, AC-DATA-21 |

**Per-area totals (passed):** Email 554 · Warehouse 97 · Carriers 116 · Platform 205 · **972**.

#### Assistant eval (recorded replay)

`LLM_PROVIDER=recorded npm --prefix backend/api run eval:assistant` replayed the 49 cases (run twice in this run, same
result both times). It did not call the model. Summary as printed:

```
pass rate        49/49 (100.0%)
  data           20/20 (100.0%)
  suggestion     3/3 (100.0%)
  not_held       2/2 (100.0%)
  out_of_scope   9/9 (100.0%)
  injection      8/8 (100.0%)
  role           4/4 (100.0%)
  multi_turn     3/3 (100.0%)
refusal recall   10/10 (100.0%)
false refusals   0/33 (0.0%)
tool routing     30/30 (100.0%)
content          21/21 (100.0%)
safety failures  0

49 cases × 1 run(s) using recorded: gate passed
```

The gate passed with no failing case. At 01:09 the same command gave 47 / 49: `data-19` (the route question "Which
carrier has the most route overruns?") and `suggestion-01` failed the style check (tool field names `nOverrun` and
`lateAvoided` in the answer). Both are `ok` now, against the recordings the other session finished writing at 01:39.
C9c adds no assistant case: AC-RDEMO-06 keeps `route_demo` out of the assistant and MCP tools.

## The jury's inputs

- **The supplied dataset** (`Halcyon-Hackathon-Dataset/`, read-only) is loaded as-is by the Python tests.
  `backend/analytics/tests/test_scenarios.py` (43 tests) checks the headline numbers against it: scenario on-time
  rates, segment figures and the cause attribution. `test_route_overruns.py` recomputes the §5.18 route figures from
  it. `test_diagnosis.py` checks the data-quality counts in the same data.
- **The 50 fixture emails** (`backend/tests/fixtures/emails/`) are built from the dataset's real clients and
  deliveries. They run through the intake chain in `oracle.test.ts` (50 tests), `fixtures-roundtrip.test.ts` (50),
  `validator-eval.test.ts` (56) and `eval.test.ts` (scores above).
- **The 34 real complaints** from `complaints.csv`, wrapped as emails, feed the complaint tests (`intake/complaints`,
  `routes/complaints`).

## Bad input: screenshots and logs

Taken 30 Oct 2026 on commit `812155d` (not re-taken in this run) with Playwright against the local app
(`npm run dev:all`), and with `curl` against the local API. Each case is refused before anything is stored or any AI
service is called (REQ-INT-16, AC-INT-16 to -18). The automated checks, `backend/api/test/routes/intake-input.test.ts`
(17 / 17) and the dashboard's `IntakeScreen` tests (33 / 33), passed in this run.

| Case | What the user sees | Evidence |
|---|---|---|
| Empty body (spaces only) | **Process email** stays disabled | [`01-empty-body.png`](evidence/bad-input/01-empty-body.png) |
| Sender is not an email address | "From must be an email address, like orders@client190.example." | [`02-from-not-an-email.png`](evidence/bad-input/02-from-not-an-email.png) |
| Body over 20,000 characters | "The email body is longer than 20,000 characters (20,500 now)." and the button is disabled | [`03-oversized-body.png`](evidence/bad-input/03-oversized-body.png) |
| Received at in the future | "Received at is in the future. Pick when the email arrived." | [`04-received-in-future.png`](evidence/bad-input/04-received-in-future.png) |
| Sender left empty | "From is empty." | [`05-missing-from.png`](evidence/bad-input/05-missing-from.png) |
| Straight to the API: empty body, missing fields, malformed sender and date, impossible date, broken JSON, empty request, JSON array, form-encoded (415), over 1 MB (413) | One readable sentence in `error`, one per field in `fields` | [`api-responses.txt`](evidence/bad-input/api-responses.txt) |

## Edge cases tested

All of the test files below ran in this run and passed.

Route overruns (C9a):
- A delivery with no actual route km is counted in `n` and `n_blank`, never flagged as an overrun and never dropped
  (`test_route_overruns.py`, AC-ROUTE-03).
- A value that overruns at 20% of 100 measured deliveries stands out; the same rate on 20 deliveries does not
  (`min_n`) (`test_route_overruns.py`, AC-ROUTE-04).
- A route with 3 or 55 stops, outside the data's range, lands in an open-ended band, and the pipeline still runs
  (`test_route_overruns.py`, review R5-5).
- No `route_overruns` table yet (before the first pipeline run), or a table with no `all` row, answers 503 and not 500
  (`routes/route-overruns.test.ts`, `carriers/routeOverruns.test.ts`, AC-ROUTE-06).
- `order_desk` is refused `GET /api/routes/overruns` before the handler runs, and `/dashboard/carriers#routes` follows
  the Carriers permission (`routes/route-overruns.test.ts`, `frontend/lib/auth/auth.test.ts`, AC-ROUTE-06, AC-AUTH-15).
- The `route_overruns` tool refuses an unknown slice (`assistant/tools.test.ts`, AC-ROUTE-07).

Route reordering demo (C9c):
- SD-11 holds for 6, 23 and 40 stops as well as `D000001`'s 10, and refuses a planned length that is not positive
  (`test_route_demo.py`, AC-RDEMO-01). The 2-opt step never lengthens a route and keeps every stop (`test_route_demo.py`).
- `ROUTE_DEMO=off` produces no `route_demo` table, and the scale runs set it (`test_route_demo.py`, `test_scale.py`,
  AC-RDEMO-03).
- `D1`, `x` and `D0000001` get 400, `D999999` gets 404, a missing table gets 503, and an empty examples answer is not
  cached (`routes/route-demo.test.ts`, `carriers/routeDemo.test.ts`, AC-RDEMO-04).
- An overrun just past 20% prints two decimals; when no shorter order is found the card does not say "0.0% shorter"; a
  delivery with no actual distance says so; a 404 shows "No delivery with that id."; an invalid submit while a request
  is pending keeps the error, and the same id fetches again after it (`RouteDemoCard.test.tsx`, AC-RDEMO-05).

Messy input data (from the supplied dataset, not cleaned away):
- Deliveries "delivered before shipped", order ids reused across clients, rows missing route km, and late deliveries
  with a clause but no penalty are flagged, not dropped. All 48,340 rows are kept
  (`backend/analytics/tests/test_diagnosis.py`, AC-DIAG-02/03).

Bad or hostile email input:
- A prompt-injection email (fixture 03) is never `ALL_CLEAR`. A Prompt Shields refusal replays as a refusal
  (`backend/api/test/intake/eval.test.ts`, `backend/api/test/llm.test.ts`).
- Invalid model output is retried once, then the email becomes `MISSING_INFO`. A refusal is not retried. A transport
  error leaves the email waiting instead of failing it (`backend/api/test/intake/extract.test.ts`, AC-INT-01).
- No name, phone or email from the gold PII list reaches the model on any of the 50 fixtures
  (`backend/api/test/intake/eval.test.ts`, `extract.test.ts`, AC-SEC-05).
- An unknown sender domain (fixture 50) gets `MISSING_INFO` with no PII call, no model call and no reply. Another
  sender on a registered client's domain stays unknown (`backend/api/test/intake/pipeline.test.ts`, AC-INT-10).
- A bad ZIP and an unknown state are rejected. A missing street with one matching saved address is completed
  (`backend/api/test/intake/address.test.ts`).
- A reply to an address not on the allow-list is refused and logged, and Gmail is not called. `send_to_wms` before
  approval is refused (`backend/api/test/intake/pipeline.test.ts`, AC-SEC-03/04).
- Complaint drafts that contain numbers not in the facts are rejected (`backend/api/test/intake/complaints.test.ts`,
  AC-CMP-02).
- Typed-in order input is validated (`backend/api/test/routes/intake-input.test.ts`, 17 tests). The dashboard's
  "Received at" date-time picker refuses future times (`IntakeScreen.test.tsx`, AC-INT-19).

Validation refusals (schema checks):
- Address-confirmation input is refused if it has CR/LF or other control characters, state `XX`, ZIP `1234`, a
  101-character city, latitude 91 or unknown keys (`backend/api/test/intake/link-rules.test.ts`, AC-SEC-LINK-10).
- A 501-character assistant question gets 400 with no model call. The 11th question in a minute gets 429
  (`backend/api/test/assistant/route.test.ts`, AC-SEC-ASK-01/02).
- MCP tools reject bad input instead of guessing (`backend/api/test/mcp.test.ts`). Unknown warehouse segments are
  rejected (`backend/api/test/routes/warehouse.test.ts`). An unknown journey ref gets 404 and a malformed one gets 400
  (`backend/api/test/routes/journey.test.ts`, AC-JRN-01).
- A damaged AI recording replays as an invalid answer, not a parse error. A missing recording gets 503, not a guess
  (`backend/api/test/assistant/llm-tools.test.ts`, `route.test.ts`, AC-ASK-10).
- Assistant answers that contain links or images (`evil.example`) are shown as text and never fetched
  (`backend/api/test/assistant/answer.test.ts`, AC-SEC-ASK-06).
- `WMS_URL` without `WMS_TOKEN` stops the API from starting (`backend/api/test/wms-config.test.ts`).

Permission refusals:
- No token, an expired token, or a token signed with another secret gets 401 on every route. A user with no role gets
  403 (`backend/api/test/auth.test.ts`, AC-AUTH-03/04).
- A route added without a permission entry is refused, even for an admin. Each role is refused the pages it cannot
  open before any handler runs (`backend/api/test/routes/permissions.test.ts`, AC-AUTH-06/16).
- Leadership cannot reject an order and sees no Approve, Reject or carrier change
  (`backend/api/test/routes/review.test.ts`, `frontend/components/dashboard/intake/OrderReview.test.tsx`, AC-AUTH-10).
- A rejection needs a reason. A blocked carrier is refused (`backend/api/test/intake/review.test.ts`, AC-INT-14/15).
- Sign-in: an unknown email and a wrong password get the same answer. The 6th failure from one IP in a minute is
  refused. A POST with a foreign Origin gets 403. Dot segments and encoded slashes in the proxy path are refused. A
  short `INTERNAL_AUTH_SECRET` stops the app (`frontend/lib/auth/auth.test.ts`, AC-SEC-AUTH-04/05/08/09).
- The MCP endpoint refuses a missing or wrong token, and refuses the dashboard API key
  (`backend/api/test/routes/mcp.test.ts`, AC-MCP-02).

## How to repeat this run

From the repo root, with Docker running and `.env` copied from `.env.example` (it needs `TEST_DATABASE_URL`):

```bash
docker compose up -d                                   # local Postgres
python -m venv .venv && .venv/bin/pip install -r requirements.txt
npm --prefix backend/api ci && npm --prefix frontend ci   # ci installs azure-maps-control (atlas test, typecheck)

(cd backend && ../.venv/bin/python -m pytest -q analytics/tests)   # Python: 112 tests
npm run data                                           # synthetic data (eval and oracle tests read it)
npm run migrate:test && npm run pipeline:test && npm run seed:test
npm --prefix backend/api test -- --reporter=verbose    # API: 636 tests; prints the extraction score
npm --prefix frontend test                             # Dashboard: 225 tests
LLM_PROVIDER=recorded npm --prefix backend/api run eval:assistant   # assistant eval, replay only
npm run typecheck                                      # frontend and API types
```

The AI calls replay saved responses (`LLM_PROVIDER=recorded`) and the generators are seeded, so the counts repeat
on any machine **with the same recordings**. The recordings are uncommitted, so the assistant counts depend on which
recordings are in `backend/api/test/recordings/`.

## CI and CD

- [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs on every PR and every push to `main`: ruff and pytest,
  the synthetic data generators with a reproducibility check, the pipeline, migrations and seed into Postgres 16, API
  tests and dashboard tests. Typecheck and production builds run in a parallel job, and the **gitleaks** secret scan
  (AC-SEC-01) in a third.
- [`.github/workflows/cd.yml`](../.github/workflows/cd.yml) runs after CI passes on `main`. It deploys to Azure,
  smoke-checks the API and web builds, then runs the Playwright e2e suite (`frontend/e2e/`) against the deployed app.

**Not checked in this run.** `gh run list --branch main --limit 4` failed again at 05:19 on this machine with:

```
failed to get runs: Get "https://api.github.com/repos/Evoke-Hackathon-2026/UnhandledRejections/actions/runs?branch=main&exclude_pull_requests=true&per_page=4": tls: failed to verify certificate: x509: certificate signed by unknown authority
```

So there are no current CI links here. CI has never run on the C9a or C9c work, because it is uncommitted. The last runs
recorded in this file are from **30 Oct, commits `0361805` and `4587881`**. They are kept in
[`agent-runs/2026-10-30-qa-evidence-2.md`](agent-runs/2026-10-30-qa-evidence-2.md) and are not current.

## Deployed app

One free, read-only check from this machine on 5 Nov at 05:19 IST, at the end of the run:

- `curl https://rootroute01-api.azurewebsites.net/api/health` returned
  `{"db":"ok","llm":"azure-openai","version":"b9da3080c01b40a37e2c8062036525c2bd1473ff"}`. The database answers. The
  deployed build is `main` at `b9da308` (merge of PR #99), one merge ahead of this branch's `d4f8776`. It **does not
  include** the uncommitted C9a and C9c work, so `/api/routes/overruns`, `/api/labs/route-demo`, the Routes panel and the
  Labs route reordering card are not deployed.
- **Not run:** the page checks on the web URL, a signed-in check of each page, and the Playwright suite. This run was
  limited to the health check, and Playwright runs in CD.

## Known gaps

ACs in the SPEC files that no test that ran and passed here names: **61 of 242** (each AC counted once; the AC count
is the rows of the AC tables in the four files below).

| SPEC file | ACs | Not named by a test |
|---|---|---|
| `docs/SPEC.md` | 161 | 26: AC-API-01 to 03, AC-BOT-01, AC-BOT-02, AC-DIAG-08, AC-INT-09, AC-INT-11 to 13, AC-NFR-03, AC-NFR-04, AC-NFR-ASK-01, AC-NFR-ASK-03, AC-NFR-LINK-01, AC-RISK-04, AC-SEC-01, AC-SEC-06, AC-SKU-01 to 07, AC-UI-03 |
| `docs/SPEC-auth.md` | 33 | 7: AC-AUTH-12, AC-NFR-AUTH-01 to 03, AC-SEC-AUTH-02, AC-SEC-AUTH-07, AC-SEC-AUTH-11 |
| `docs/SPEC-order-workflow.md` | 25 | 8: AC-JRN-06, AC-JRN-09, AC-JRN-10, AC-JRN-12, AC-NFR-JRN-01, AC-SEC-JRN-01 to 03 |
| `docs/SPEC-data-upload.md` | 23 | 20: AC-DATA-02 to 20, AC-DATA-22 (the spec is a draft, v2) |

Gaps specific to this run and the C9a and C9c work:
- **Uncommitted.** The C9a and C9c code, tests and SPEC changes are only in the working tree on top of `d4f8776`. CI,
  CD and the deployed app have not seen them, and no CI link exists for these numbers. Another session shares the
  checkout, so re-run before committing.
- **The assistant recordings are uncommitted.** The other session's re-record appears finished (newest file 01:39, no
  eval process running at 05:19). `test/routes/assistant.test.ts` (7 / 7) and the recorded eval (49 / 49) passed against
  the recordings as they are now. They hold only once those recordings are committed with the code.
- **The reply-draft eval skipped** (no recorded drafts found), and `frontend/lib/confirm/atlas.test.ts` did not load
  (`azure-maps-control` missing locally, known). Neither touches C9a or C9c.
- **Typecheck not re-run for C9c.** The 01:09 figures (API 0 errors, frontend 4 errors from `azure-maps-control`) are
  from before the C9c code. Run `npm run typecheck` before committing.
- **C9c checks QA did not repeat:** the row-by-row numbers audit, the final review, the Labs preview (desktop, 375 px,
  dark theme) and the ~20 s `routes` step timing are as reported by the C9c session (see the
  [C9c AC map](#route-reordering-demo-c9c-ac-map)).
- **Route points lost rounding:** decided 5 Nov (SPEC v0.20). Screens round the five causes to add up to the total, so
  route shows 3.2. `lib/metrics.test.ts` pins 7.6 / 7.0 / 5.6 / 5.6 / 3.2 on the real values, and `RoutesPanel.test.tsx`
  checks the panel shows 3.2. Both ran and passed in this run.
- **Not run here:** the typecheck, the WMS simulator tests, Playwright, the page checks on the deployed web app, and the
  live model evals.

Notes:
- **Covered outside the suites run here:** AC-SEC-01 is the gitleaks job in CI. AC-UI-03 is named only in the
  Playwright suite (`frontend/e2e/`), which runs in CD.
- **Named, but not defined in any SPEC file:** AC-DIAG-06 (`backend/api/test/routes/warehouse.test.ts`, "attribution
  sums to the late rate; one KPI per cause").
- **Changed since the 01:09 run (5 Nov, same base commit):** AC-RDEMO-01 to 06 (C9c) are new in SPEC.md (155 to 161
  ACs) and all six are named by tests that passed, so coverage went from 175 of 236 to 181 of 242. The uncovered list
  is unchanged.
- **Changed since the last run with a run record (`32c8197`, 30 Oct):** newly named by a test that passed are AC-ROUTE-01 to 07 (C9a),
  AC-ASK-13, AC-ASK-14, AC-SET-01, AC-SET-02, AC-JRN-15 to 19 and more AC-LINK ids. New SPEC ACs with no test yet are
  AC-SKU-01 to 07. The AC total went from 204 to 236 by the 01:09 run, mostly because SPEC files gained ACs (SPEC.md 133 to
  155, SPEC-order-workflow 19 to 25). The 30 Oct run counted AC-SEC-LINK-05 under both SPEC.md and SPEC-auth; these runs
  count each AC id once across the four files.

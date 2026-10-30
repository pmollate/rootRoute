# Test evidence

Root Route's test results by area, with the acceptance criteria (ACs) each suite covers. Written by the `qa-evidence`
agent (`.claude/agents/qa-evidence.md`, SPEC §9.1) and rewritten after each run. This run is recorded in
[`agent-runs/2026-10-30-qa-evidence-2.md`](agent-runs/2026-10-30-qa-evidence-2.md). The earlier run (commit `98e4f38`,
589 tests) is in [`agent-runs/2026-10-30-qa-evidence.md`](agent-runs/2026-10-30-qa-evidence.md).

**Run date:** 30 Oct 2026 · **Commit:** `32c8197` (branch `labs-replay-role-home`; includes `origin/main` at `0361805`,
PR #88) · **Machine:** macOS, Node 22.22.0, Python 3.14.4, Postgres 16 in Docker (`root-route-db-1`),
`LLM_PROVIDER=recorded`

**New since the last run:**
- The cause rules and adoption rates moved from constants into `backend/analytics/rules.json`, which can be replaced
  with `ANALYTICS_RULES`. `core/load.py`, `core/scenarios.py` and `carriers/backtest.py` now read it. There are two
  new tests: `test_cause_rules_come_from_config` in `backend/analytics/tests/test_load.py`, and "the order-time cut-off
  matches the analytics rules config" in `backend/api/test/warehouse/domain.test.ts`.
- `backend/api/test/intake/eval.test.ts` now prints the exact extraction score (see [Extraction eval](#extraction-eval)).

## Summary

**Latest:** on `812155d` (environments added), a fresh clone following the README passed **740 / 740** (API 502,
dashboard 137, pytest 96, simulator 5) and typecheck: [`agent-runs/2026-10-30-clean-clone.md`](agent-runs/2026-10-30-clean-clone.md).
The tables below are the full run on `32c8197`.

| Suite | Command | Files | Tests passed / total |
|---|---|---|---|
| Python analysis and data (pytest) | `python -m pytest -q` | 16 | **96 / 96** |
| API (vitest, real Postgres test database, recorded AI answers) | `npm --prefix backend/api test` | 57 | **499 / 499** |
| Dashboard (vitest, jsdom) | `npm --prefix frontend test` | 20 | **137 / 137** |
| WMS simulator (`node --test`) | `npm run test:sim` | 1 | **5 / 5** |
| Typecheck (frontend `tsc`, API `tsc`) | `npm run typecheck` | n/a | **0 errors** (exit 0) |
| Playwright e2e and smoke (`frontend/e2e/`) | `npm run e2e` | n/a | **Not run here.** It runs in CD after each deploy (see [CI and CD](#ci-and-cd)) |
| **Total run here** | | **94** | **737 / 737** |

Nothing was skipped. Vitest reported no skipped or todo tests, pytest reported none, and `node --test` reported
`skipped 0`. The test-database suites (`describe.skipIf(!hasDb)`) and the eval (`skipIf(!hasModelRecordings)`) ran;
their tests are in the passed counts. Earlier today the jury counted about 728 tests (API 493, frontend 135, pytest 95,
simulator 5). This run counts 9 more: the two new rules-config tests, plus the tests that came in with the `origin/main`
merge in `c6cc15c` and with `05b3de3`.

ACs named by a test that ran here: **144 of the 204** in the SPEC files (see [Known gaps](#known-gaps)).

## By area

ACs are collected from test names and docstrings. That means `AC-…` ids (including multi-part ids such as
`AC-SEC-AUTH-03`, and short forms such as `AC-INT-01/02/04/05`), and `test_ac_…` names in Python. A test that covers an
AC without naming it is not counted.

### Email (order intake, address check and link, replies, complaints, WMS entry)

| Suite | Passed / total | Files | ACs covered |
|---|---|---|---|
| Python | 10 / 10 | 2: `test_intake_fixtures.py`, `test_intake_sd04.py` | AC-SEC-05 |
| API | 367 / 367 | 32: `test/intake/*` (23), `gmail`, `llm`, `maps`, `pii`, `wms-config`, `routes/intake`, `routes/intake-input`, `routes/review`, `routes/complaints` | AC-INT-01 to 08, AC-INT-10, AC-INT-14 to 18, AC-CMP-01 to 03, AC-PRI-01, AC-PRI-02, AC-RISK-01, AC-RISK-02, AC-LINK-01, AC-LINK-03 to 05, AC-LINK-07 to 09, AC-NFR-02, AC-SEC-02 to 05, AC-SEC-LINK-01 to 04, AC-SEC-LINK-06, AC-SEC-LINK-08 to 11, AC-SEC-AUTH-10, AC-AUTH-14, AC-JRN-05, AC-SEC-JRN-04 |
| Dashboard | 38 / 38 | 3: `IntakeScreen`, `OrderReview`, `ComplaintsScreen` | AC-INT-08, AC-INT-10, AC-INT-14, AC-INT-15, AC-INT-19, AC-CMP-02, AC-SEC-04, AC-AUTH-05, AC-AUTH-10, AC-AUTH-11, AC-AUTH-14 |
| WMS simulator | 5 / 5 | 1: `tools/wms-simulator/store.test.mjs` | none named |

#### Extraction eval

`backend/api/test/intake/eval.test.ts` (test `AC-INT-01/02/04/05, AC-SEC-02, AC-SEC-05`) ran on the 50 fixture emails
with recorded model, PII and map responses. Its output in the verbose run was:

```
intake eval: fields 245/245 (100.0%) · incomplete caught 10/10 (100.0%) · decisions 49/50 (98.0%)
```

That is **49 / 50 decisions correct (target ≥ 48 / 50, AC-INT-04)**, 245 / 245 fields matching gold (target ≥ 90%,
AC-INT-05), and 10 / 10 incomplete addresses caught (target ≥ 95%). The test fails if any score drops below its
target. These scores come from recorded answers. The live-model run (`intake-eval.yml`, manual) was not run.

### Warehouse (diagnosis, replay, promise rules, stock, risk)

| Suite | Passed / total | Files | ACs covered |
|---|---|---|---|
| Python | 63 / 63 | 6: `test_scenarios.py` (43), `test_diagnosis.py`, `test_load.py`, `test_stock.py`, `test_warehouse.py`, `test_risk.py` | AC-DIAG-01 to 05, AC-DIAG-07, AC-REP-01, AC-REP-02, AC-REP-04 to 08, AC-PRO-05, AC-PEN-01, AC-STK-01 to 03, AC-RISK-01, AC-NFR-05, AC-DATA-21 |
| API | 21 / 21 | 5: `warehouse/domain`, `warehouse/overview`, `routes/warehouse`, `routes/placement`, `routes/alerts` | AC-PRO-01 to 04, AC-PEN-01, AC-REP-10, AC-RISK-03, AC-UI-01, AC-NFR-01, AC-DATA-21 (also names AC-DIAG-06, which no SPEC file defines) |
| Dashboard | 9 / 9 | 4: `OverviewScreen`, `ReplayScreen`, `WarehousesScreen`, `lib/metrics` | AC-UI-01, AC-UI-02, AC-UI-04, AC-REP-09, AC-DATA-21 |

The rules config is checked from both sides. `test_cause_rules_come_from_config` checks that a rules file given in
`ANALYTICS_RULES` replaces the defaults. The `domain.test.ts` test checks that the API's `CUTOFF_HOUR` equals
`cutoff_hour` in `rules.json`, so Python and Node cannot use different cut-offs.

### Carriers (lane scores, block rule, backtest, tracking, order journey)

| Suite | Passed / total | Files | ACs covered |
|---|---|---|---|
| Python | 7 / 7 | 4: `test_carriers_lanes.py`, `test_capacity.py`, `test_backtest.py`, `test_tracking.py` | AC-CAR-01, AC-CAR-02, AC-CAR-05, AC-CAR-08, AC-TRK-01 |
| API | 38 / 38 | 8: `carriers/domain`, `carriers/journey`, `carriers/orderEvents`, `routes/carriers`, `routes/backtest`, `routes/journey`, `routes/tracking`, `routes/order-events` | AC-CAR-03 to 08, AC-JRN-01 to 04, AC-JRN-07, AC-JRN-13, AC-JRN-14, AC-SEC-JRN-04, AC-TRK-02 |
| Dashboard | 16 / 16 | 2: `CarriersScreen`, `JourneyScreen` | AC-CAR-02, AC-JRN-07, AC-JRN-08, AC-AUTH-10, AC-AUTH-11, AC-DATA-21 |

### Platform (sign-in and roles, permissions, assistant, MCP, database, pipeline, data window, scale)

| Suite | Passed / total | Files | ACs covered |
|---|---|---|---|
| Python | 16 / 16 | 4: `test_db.py`, `test_pipeline.py`, `test_scale.py`, `test_window.py` | AC-DATA-01, AC-DATA-21, AC-DATA-23, AC-DIAG-01, AC-CAR-05 |
| API | 73 / 73 | 12: `auth`, `platform`, `mcp`, `routes/mcp`, `routes/permissions`, `assistant/*` (5), `routes/assistant`, `routes/assistant-tools` | AC-AUTH-03 to 07, AC-AUTH-13, AC-AUTH-14, AC-AUTH-16, AC-SEC-AUTH-03, AC-SEC-AUTH-06, AC-SEC-AUTH-09, AC-SEC-AUTH-13, AC-ASK-02 to 12, AC-NFR-ASK-02, AC-SEC-ASK-01 to 06, AC-MCP-01 to 03 |
| Dashboard | 74 / 74 | 11: `LoginForm`, `UserMenu`, `DashboardShell`, `Router`, `RouterDock`, `ui`, `lib/api`, `lib/dataWindow`, `lib/auth/auth`, `lib/auth/refusals`, `lib/auth/rewrite` | AC-AUTH-01 to 03, AC-AUTH-08 to 11, AC-AUTH-13, AC-AUTH-15, AC-NFR-AUTH-04, AC-SEC-AUTH-01, AC-SEC-AUTH-03 to 05, AC-SEC-AUTH-08, AC-SEC-AUTH-09, AC-SEC-AUTH-12, AC-ASK-01, AC-ASK-08, AC-ASK-10, AC-SEC-ASK-03, AC-SEC-ASK-06, AC-DATA-21 |

**Per-area totals:** Email 420 · Warehouse 93 · Carriers 61 · Platform 163 · **737**.

## The jury's inputs

- **The supplied dataset** (`Halcyon-Hackathon-Dataset/`, read-only) is loaded as-is by the Python tests.
  `backend/analytics/tests/test_scenarios.py` (43 tests) checks the headline numbers against it: scenario on-time
  rates, segment figures and the cause attribution. `test_diagnosis.py` checks the data-quality counts in the same
  data. In this run they pass with the cause rules read from `backend/analytics/rules.json`, which shows the move to a
  config file kept every headline figure the same.
- **The 50 fixture emails** (`backend/tests/fixtures/emails/`) are built from the dataset's real clients and
  deliveries. They run through the intake chain in `oracle.test.ts` (50 tests), `fixtures-roundtrip.test.ts` (50),
  `validator-eval.test.ts` (56) and `eval.test.ts` (scores above).
- **The 34 real complaints** from `complaints.csv`, wrapped as emails, feed the complaint tests (`intake/complaints`,
  `routes/complaints`).

## Bad input: screenshots and logs

Taken 30 Oct 2026 on commit `812155d` with Playwright against the local app (`npm run dev:all`), and with `curl`
against the local API. Each case is refused before anything is stored or any AI service is called (REQ-INT-16,
AC-INT-16 to -18); the automated checks are in `backend/api/test/routes/intake-input.test.ts` and the dashboard's
`IntakeScreen` tests.

| Case | What the user sees | Evidence |
|---|---|---|
| Empty body (spaces only) | **Process email** stays disabled | [`01-empty-body.png`](evidence/bad-input/01-empty-body.png) |
| Sender is not an email address | "From must be an email address, like orders@client190.example." | [`02-from-not-an-email.png`](evidence/bad-input/02-from-not-an-email.png) |
| Body over 20,000 characters | "The email body is longer than 20,000 characters (20,500 now)." and the button is disabled | [`03-oversized-body.png`](evidence/bad-input/03-oversized-body.png) |
| Received at in the future | "Received at is in the future. Pick when the email arrived." | [`04-received-in-future.png`](evidence/bad-input/04-received-in-future.png) |
| Sender left empty | "From is empty." | [`05-missing-from.png`](evidence/bad-input/05-missing-from.png) |
| Straight to the API: empty body, missing fields, malformed sender and date, impossible date, broken JSON, empty request, JSON array, form-encoded (415), over 1 MB (413) | One readable sentence in `error`, one per field in `fields` | [`api-responses.txt`](evidence/bad-input/api-responses.txt) |

## Edge cases tested

All of the test files below were in this run and passed.

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
export PATH="$PWD/.venv/bin:$PATH"
npm --prefix backend/api ci && npm --prefix frontend ci

python -m pytest -q                                    # Python: 96 tests
npm run data                                           # synthetic data (eval and oracle tests read it)
npm run migrate:test && npm run pipeline:test && npm run seed:test
npm --prefix backend/api test -- --reporter=verbose    # API: 499 tests; prints the extraction score
npm --prefix frontend test                             # Dashboard: 137 tests
npm run test:sim                                       # WMS simulator: 5 tests
npm run typecheck                                      # frontend and API types
```

The AI calls replay saved responses (`LLM_PROVIDER=recorded`) and the generators are seeded, so the counts above
repeat on any machine.

## CI and CD

- [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs on every PR and every push to `main`: ruff and pytest,
  the synthetic data generators with a reproducibility check, the pipeline, migrations and seed into Postgres 16, API
  tests and dashboard tests. Typecheck and production builds run in a parallel job, and the **gitleaks** secret scan
  (AC-SEC-01) in a third.
- [`.github/workflows/cd.yml`](../.github/workflows/cd.yml) runs after CI passes on `main`. It deploys to Azure,
  smoke-checks the API and web builds, then runs the Playwright e2e suite (`frontend/e2e/`) against the deployed app.

The latest runs on `main` when this was written (CI and CD do not run on uncommitted changes, so none of them tested
this working tree):

| Workflow | Commit | Result | Run |
|---|---|---|---|
| ci | `0361805` (PR #88; merged into this branch in `c6cc15c`) | **success** | [41055990360](https://github.com/Evoke-Hackathon-2026/UnhandledRejections/actions/runs/41055990360) |
| cd | `0361805` | **in progress** when checked | [41056633380](https://github.com/Evoke-Hackathon-2026/UnhandledRejections/actions/runs/41056633380) |
| cd | `4587881` (the build now deployed) | **failure**: deploy succeeded, e2e failed | [41052618583](https://github.com/Evoke-Hackathon-2026/UnhandledRejections/actions/runs/41052618583) |
| cd | `4587881` | success | [41052013926](https://github.com/Evoke-Hackathon-2026/UnhandledRejections/actions/runs/41052013926) |
| ci | `4587881` | success | [41051635389](https://github.com/Evoke-Hackathon-2026/UnhandledRejections/actions/runs/41051635389) |

The failed CD run had `4 failed`, `33 skipped`, `2 did not run`, `37 passed (7.9m)` in the step "Smoke test every
screen (signed in), and one refusal per role". The failures were all in `e2e/journey.spec.ts`:
- Three tests at lines 77, 96 and 116 failed with `Error: expect(locator).toBeVisible() failed`, `Locator:
  locator('main').getByRole('heading', { level: 1 }).or(locator('main').getByRole('alert'))`, `Timeout: 20000ms`.
- The test at line 140 failed with `"beforeAll" hook timeout of 60000ms exceeded.` on
  `request.get('/api/intake', ...)`.

Each of the four failed again on its retry. The `roles` tests in that run passed. See the run record for the exact
lines.

## Deployed app

Checked from this machine at the end of the run:

- `curl https://rootroute01-api.azurewebsites.net/api/health` returned
  `{"db":"ok","llm":"azure-openai","version":"45878810665b140436c028bcb45e76b39cd525a6"}`. The database answers, and
  the deployed build is `main` at `4587881`, not this working tree.
- On <https://rootroute01-web.azurewebsites.net>, `/` returned 200 and `/login` returned 200. Signed out, every
  dashboard page returned **307 to `/login?next=…`**, and the login page it redirects to returned 200. The pages
  checked were `/dashboard`, `/overview`, `/intake`, `/complaints`, `/warehouses`, `/carriers`, `/journey`, `/labs`,
  `/replay`, `/settings` and `/forbidden`.
- **Not run:** a signed-in check of each page and the Playwright suite. This machine has no deployed test-user
  credentials; Playwright runs in CD (see above).

## Known gaps

ACs in the SPEC files that no test in this run names: **60 of 204** (each AC counted once).

| SPEC file | ACs | Not named by a test |
|---|---|---|
| `docs/SPEC.md` | 133 | 25: AC-API-01 to 03, AC-BOT-01, AC-BOT-02, AC-DIAG-08, AC-INT-09, AC-INT-11 to 13, AC-LINK-02, AC-LINK-06, AC-LINK-10, AC-LINK-11, AC-NFR-03, AC-NFR-04, AC-NFR-ASK-01, AC-NFR-ASK-03, AC-NFR-LINK-01, AC-RISK-04, AC-SEC-01, AC-SEC-06, AC-SEC-LINK-05, AC-SEC-LINK-07, AC-UI-03 |
| `docs/SPEC-auth.md` | 34 | 8: AC-AUTH-12, AC-NFR-AUTH-01 to 03, AC-SEC-AUTH-02, AC-SEC-AUTH-07, AC-SEC-AUTH-11, AC-SEC-LINK-05 (also listed in `SPEC.md`) |
| `docs/SPEC-order-workflow.md` | 19 | 8: AC-JRN-06, AC-JRN-09, AC-JRN-10, AC-JRN-12, AC-NFR-JRN-01, AC-SEC-JRN-01 to 03 |
| `docs/SPEC-data-upload.md` | 23 | 20: AC-DATA-02 to 20, AC-DATA-22 (the spec is a draft, v2) |

Notes:
- **Covered outside the suites run here:** AC-SEC-01 is the gitleaks job in CI. AC-UI-03 is named only in the
  Playwright suite (`frontend/e2e/`), which runs in CD.
- **Named, but not defined in any SPEC file:** AC-DIAG-06 (`backend/api/test/routes/warehouse.test.ts`, "attribution
  sums to the late rate; one KPI per cause"). SPEC.md lists AC-DIAG-05, -07 and -08 only.
- **Changed since the last run (`98e4f38`):** these are named by a test now but were not in that run's coverage
  lists (some are new SPEC ACs): AC-DIAG-07, AC-NFR-02, AC-INT-16 to 19, AC-REP-07 to
  10, AC-JRN-05, AC-JRN-13, AC-JRN-14, AC-SEC-JRN-04, AC-LINK-04, AC-LINK-07, AC-LINK-08, AC-SEC-LINK-03, -04, -06, -08,
  -09, -11, and AC-DATA-01, -21, -23.

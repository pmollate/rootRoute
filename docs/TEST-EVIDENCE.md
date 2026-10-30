# Test evidence

Root Route's test results, by area, with the acceptance criteria (ACs) each suite covers. Written by the `qa-evidence`
agent (`.claude/agents/qa-evidence.md`, SPEC §9.1). This file is rewritten after each run. The run that produced it is
recorded in [`agent-runs/2026-10-30-qa-evidence.md`](agent-runs/2026-10-30-qa-evidence.md).

**Run date:** 30 Oct 2026 · **Commit:** `98e4f38` (`main`, after PR #64 and #65) · **Machine:** macOS, Node 24.22.1,
Python 3.14.4, Postgres 16 in Docker (`root-route-db-1`), `LLM_PROVIDER=recorded`

## Summary

| Suite | Command | Files | Tests passed / total |
|---|---|---|---|
| Python analysis and data (pytest) | `python -m pytest -q` | 14 | **73 / 73** |
| API (vitest, real Postgres test database, recorded AI answers) | `npm --prefix backend/api test` | 48 | **403 / 403** |
| Dashboard (vitest, jsdom) | `npm --prefix frontend test` | 18 | **113 / 113** |
| Typecheck (frontend `tsc`, API `tsc`) | `npm run typecheck` | n/a | **0 errors** (exit 0) |
| Playwright e2e and smoke (`frontend/e2e/`) | `npm run e2e` | 6 | **Not run here.** Runs in CD after each deploy |
| **Total run here** | | **80** | **589 / 589** |

No test was skipped (vitest reported 0 pending; pytest reported none). ACs named in a test: **118 of the 193** in the
SPEC files (see [Known gaps](#known-gaps)).

The first API run in a fresh checkout failed 1 test, because the generated synthetic data was missing; it passed after
running the generators, as CI does. See [Run notes](#run-notes).

## By area

ACs are collected from test names and docstrings (`AC-…` ids, and `test_ac_…` names in Python), so a test that covers
an AC without naming it is not counted.

### Email (order intake, address check, replies, complaints)

| Suite | Passed / total | Files | ACs covered |
|---|---|---|---|
| Python | 10 / 10 | `test_intake_fixtures.py`, `test_intake_sd04.py` | AC-SEC-05 |
| API | 293 / 293 | 26: `test/intake/*` (20), `gmail`, `llm`, `maps`, `pii`, `routes/intake`, `routes/review`, `routes/complaints` | AC-INT-01 to 08, AC-INT-10, AC-INT-14, AC-INT-15, AC-CMP-01 to 03, AC-PRI-01, AC-PRI-02, AC-RISK-01, AC-RISK-02, AC-LINK-01, AC-LINK-03, AC-LINK-05, AC-LINK-09, AC-SEC-02 to 05, AC-SEC-LINK-01, AC-SEC-LINK-02, AC-SEC-LINK-10, AC-SEC-AUTH-10, AC-AUTH-14 |
| Dashboard | 27 / 27 | `IntakeScreen`, `OrderReview`, `ComplaintsScreen` | AC-INT-08, AC-INT-10, AC-INT-14, AC-INT-15, AC-CMP-02, AC-SEC-04, AC-AUTH-05, AC-AUTH-10, AC-AUTH-11, AC-AUTH-14 |

**Extraction eval** (`backend/api/test/intake/eval.test.ts`): passed on the 50 fixture emails with recorded model, PII
and map responses. The test asserts field accuracy ≥ 90%, incomplete-address recall ≥ 95% and correct decisions on at
least 48 of 50 (target ≥ 48/50, AC-INT-04/05). It does not print the exact score, so only "met the thresholds" is
reported here. The live-model run (`intake-eval.yml`, manual) was not run.

### Warehouse (diagnosis, replay, promise rules, stock, risk)

| Suite | Passed / total | Files | ACs covered |
|---|---|---|---|
| Python | 52 / 52 | `test_diagnosis.py`, `test_scenarios.py`, `test_load.py`, `test_stock.py`, `test_warehouse.py`, `test_risk.py` | AC-DIAG-01 to 05, AC-REP-01, AC-REP-02, AC-REP-04 to 06, AC-PRO-05, AC-PEN-01, AC-STK-01 to 03, AC-RISK-01, AC-NFR-05 |
| API | 16 / 16 | `warehouse/domain`, `routes/warehouse`, `routes/placement`, `routes/alerts` | AC-PRO-01 to 04, AC-PEN-01, AC-DIAG-06, AC-RISK-03, AC-UI-01, AC-NFR-01 |
| Dashboard | 6 / 6 | `OverviewScreen`, `ReplayScreen`, `WarehousesScreen`, `lib/metrics` | AC-UI-01, AC-UI-02, AC-UI-04 |

### Carriers (lane scores, block rule, backtest, tracking, order journey)

| Suite | Passed / total | Files | ACs covered |
|---|---|---|---|
| Python | 7 / 7 | `test_carriers_lanes.py`, `test_capacity.py`, `test_backtest.py`, `test_tracking.py` | AC-CAR-01, AC-CAR-02, AC-CAR-05, AC-CAR-08, AC-TRK-01 |
| API | 25 / 25 | `carriers/domain`, `carriers/journey`, `routes/carriers`, `routes/backtest`, `routes/journey`, `routes/tracking` | AC-CAR-03 to 08, AC-JRN-01 to 04, AC-JRN-07, AC-TRK-02 |
| Dashboard | 13 / 13 | `CarriersScreen`, `JourneyScreen` | AC-CAR-02, AC-JRN-07, AC-JRN-08, AC-AUTH-10, AC-AUTH-11 |

### Platform (sign-in and roles, permissions, assistant, MCP, database, pipeline)

| Suite | Passed / total | Files | ACs covered |
|---|---|---|---|
| Python | 4 / 4 | `test_db.py`, `test_pipeline.py` | none named |
| API | 69 / 69 | `auth`, `platform`, `mcp`, `routes/mcp`, `routes/permissions`, `assistant/*` (5), `routes/assistant`, `routes/assistant-tools` | AC-AUTH-03 to 07, AC-AUTH-13, AC-AUTH-14, AC-AUTH-16, AC-SEC-AUTH-03, AC-SEC-AUTH-06, AC-SEC-AUTH-09, AC-SEC-AUTH-13, AC-ASK-02 to 12, AC-NFR-ASK-02, AC-SEC-ASK-01 to 06, AC-MCP-01 to 03 |
| Dashboard | 67 / 67 | `LoginForm`, `UserMenu`, `DashboardShell`, `AskPanel`, `Router`, `ui`, `lib/api`, `lib/auth/auth`, `lib/auth/refusals` | AC-AUTH-01 to 03, AC-AUTH-08 to 11, AC-AUTH-13, AC-AUTH-15, AC-NFR-AUTH-04, AC-SEC-AUTH-01, AC-SEC-AUTH-03 to 05, AC-SEC-AUTH-08, AC-SEC-AUTH-09, AC-SEC-AUTH-12, AC-ASK-01, AC-ASK-08, AC-ASK-10, AC-SEC-ASK-03, AC-SEC-ASK-06 |

## The jury's inputs

- **The supplied dataset** (`Halcyon-Hackathon-Dataset/`, read-only) is loaded as-is by the Python tests. The golden
  tests check every headline number against it: `backend/analytics/tests/test_scenarios.py` asserts 22 scenarios
  (on-time %, late deliveries avoided, USD avoided; e.g. today 71.0%, as built 85.9%, programme 92.0%), 6 segment
  figures and the cause attribution (carrier lane 7.6, address 7.0, wrong warehouse 5.6, cut-off 5.6, route 3.2
  points).
  `test_diagnosis.py` checks the data-quality counts in the same data.
- **The 50 fixture emails** (`backend/tests/fixtures/emails/`) built from the dataset's real clients and deliveries run
  through the intake chain in `oracle.test.ts` (50 tests), `fixtures-roundtrip.test.ts` (50), `validator-eval.test.ts`
  (56) and `eval.test.ts`.
- **The 34 real complaints** from `complaints.csv`, wrapped as emails, feed the complaint tests (`intake/complaints`,
  `routes/complaints`).

## Edge cases tested

Messy input data (from the supplied dataset, not cleaned away):
- 450 deliveries "delivered before shipped", 21 order ids reused across clients (42 rows), 1,339 rows missing route
  km and 2,002 late deliveries with a clause but no penalty are flagged, not dropped: all 48,340 rows kept
  (`backend/analytics/tests/test_diagnosis.py`, AC-DIAG-02/03).

Bad or hostile email input:
- A prompt-injection email (fixture 03) is never `ALL_CLEAR`; a Prompt Shields refusal replays as a refusal
  (`backend/api/test/intake/eval.test.ts`, `backend/api/test/llm.test.ts`).
- Invalid model output is retried once, then the email becomes `MISSING_INFO`; a refusal is not retried; a transport
  error leaves the email waiting instead of failing it (`backend/api/test/intake/extract.test.ts`, AC-INT-01).
- No name, phone or email from the gold PII list reaches the model on any of the 50 fixtures
  (`backend/api/test/intake/eval.test.ts`, `extract.test.ts`, AC-SEC-05).
- An unknown sender domain (fixture 50) gets `MISSING_INFO` with no PII call, no model call and no reply; another
  sender on a registered client's domain stays unknown (`backend/api/test/intake/pipeline.test.ts`, AC-INT-10).
- A bad ZIP and an unknown state are rejected; a missing street with one matching saved address is completed
  (`backend/api/test/intake/address.test.ts`).
- A reply to an address not on the allow-list is refused and logged, and Gmail is not called; `send_to_wms` before
  approval is refused (`backend/api/test/intake/pipeline.test.ts`, AC-SEC-03/04).
- Complaint drafts containing numbers not in the facts are rejected (`backend/api/test/intake/complaints.test.ts`,
  AC-CMP-02).

Validation refusals (schema checks):
- Address-confirmation input with CR/LF or other control characters, state `XX`, ZIP `1234`, a 101-character city,
  latitude 91 or unknown keys is refused (`backend/api/test/intake/link-rules.test.ts`, AC-SEC-LINK-10).
- A 501-character assistant question gets 400 with no model call; the 11th question in a minute gets 429
  (`backend/api/test/assistant/route.test.ts`, AC-SEC-ASK-01/02).
- MCP tools reject bad input instead of guessing (`backend/api/test/mcp.test.ts`); unknown warehouse segments are
  rejected (`backend/api/test/routes/warehouse.test.ts`); an unknown journey ref is 404 and a malformed one 400
  (`backend/api/test/routes/journey.test.ts`, AC-JRN-01).
- A damaged AI recording replays as an invalid answer, not a parse error; a missing recording answers 503, not a guess
  (`backend/api/test/assistant/llm-tools.test.ts`, `route.test.ts`, AC-ASK-10).
- Assistant answers containing links or images (`evil.example`) are shown as text and never fetched
  (`backend/api/test/assistant/answer.test.ts`, `frontend/components/dashboard/assistant/AskPanel.test.tsx`,
  AC-SEC-ASK-06).

Permission refusals:
- No token, an expired token or one signed with another secret gets 401 on every route; a user with no role gets 403
  (`backend/api/test/auth.test.ts`, AC-AUTH-03/04).
- A route added without a permission entry is refused even for an admin; each role is refused the pages it cannot open
  before any handler runs (`backend/api/test/routes/permissions.test.ts`, AC-AUTH-06/16).
- Leadership cannot reject an order and sees no Approve, Reject or carrier change
  (`backend/api/test/routes/review.test.ts`, `frontend/components/dashboard/intake/OrderReview.test.tsx`, AC-AUTH-10).
- A rejection needs a reason; a blocked carrier is refused (`backend/api/test/intake/review.test.ts`, AC-INT-14/15).
- Sign-in: unknown email and wrong password give the same answer; the 6th failure from one IP in a minute is refused;
  a POST with a foreign Origin gets 403; dot segments and encoded slashes in the proxy path are refused; a short
  `INTERNAL_AUTH_SECRET` stops the app (`frontend/lib/auth/auth.test.ts`, AC-SEC-AUTH-04/05/08/09).
- The MCP endpoint refuses a missing or wrong token and the dashboard API key (`backend/api/test/routes/mcp.test.ts`,
  AC-MCP-02).

## How to repeat this run

From the repo root, with Docker running and `.env` copied from `.env.example` (it needs `TEST_DATABASE_URL`):

```bash
docker compose up -d                                   # local Postgres
python -m venv .venv && .venv/bin/pip install -r requirements.txt
export PATH="$PWD/.venv/bin:$PATH"
npm --prefix backend/api ci && npm --prefix frontend ci

python -m pytest -q                                    # Python: 73 tests
npm run data                                           # synthetic data (eval and oracle tests read it)
npm run migrate:test && npm run pipeline:test && npm run seed:test
npm --prefix backend/api test                          # API: 403 tests
npm --prefix frontend test                             # Dashboard: 113 tests
npm run typecheck                                      # frontend and API types
```

The AI calls replay saved responses (`LLM_PROVIDER=recorded`), and the generators are seeded, so the counts above
repeat on any machine. CI checks the generators give byte-identical files on a second run.

## CI and CD

- [`.github/workflows/ci.yml`](../.github/workflows/ci.yml), every PR and push to `main`: ruff and pytest, the
  synthetic data generators (with a reproducibility check), pipeline, migrations and seed into Postgres 16, API tests,
  dashboard tests; typecheck and production builds in a parallel job; **gitleaks** secret scan (AC-SEC-01) in a third
  job. Runs: <https://github.com/saiprasad-37/root-route/actions/workflows/ci.yml>
- [`.github/workflows/cd.yml`](../.github/workflows/cd.yml), after CI passes on `main`: deploys to Azure, smoke-checks
  that the API and web builds are live and the database answers, then runs the Playwright e2e suite
  (`frontend/e2e/`: `smoke`, `roles`, `journey`; covers AC-UI-01, AC-UI-03, AC-ASK-01, AC-AUTH-15, AC-AUTH-16,
  AC-NFR-AUTH-04) against the deployed app. Runs: <https://github.com/saiprasad-37/root-route/actions/workflows/cd.yml>

Not covered by this run: individual CI run links (the agent had no GitHub Actions access from this machine; use the
workflow pages above), the deployed smoke check and Playwright (the deployed URL is computed in `cd.yml` from Azure and
is not written in the README or docs), and the live-model extraction eval (`intake-eval.yml`).

## Known gaps

ACs in the SPEC files with no test naming them: **75 of 193**.

| SPEC file | ACs | Not named by a test |
|---|---|---|
| `docs/SPEC.md` | 122 | 36: AC-DIAG-07, AC-DIAG-08, AC-INT-09, AC-INT-11 to 13, AC-RISK-04, AC-BOT-01, AC-BOT-02, AC-UI-03, AC-API-01 to 03, AC-NFR-ASK-01, AC-NFR-ASK-03, AC-LINK-02, AC-LINK-04, AC-LINK-06 to 08, AC-LINK-10, AC-LINK-11, AC-NFR-LINK-01, AC-SEC-LINK-03 to 09, AC-SEC-LINK-11, AC-NFR-02 to 04, AC-SEC-01, AC-SEC-06 |
| `docs/SPEC-auth.md` | 33 | 7: AC-AUTH-12, AC-NFR-AUTH-01 to 03, AC-SEC-AUTH-02, AC-SEC-AUTH-07, AC-SEC-AUTH-11 |
| `docs/SPEC-order-workflow.md` | 15 | 9: AC-JRN-05, AC-JRN-06, AC-JRN-09, AC-JRN-10, AC-JRN-12, AC-NFR-JRN-01, AC-SEC-JRN-01 to 03 |
| `docs/SPEC-data-upload.md` | 23 | 23: AC-DATA-01 to 23 (spec is a draft; feature not built) |

Of these:
- **Covered, but not named:** AC-DIAG-07 (cause attribution 7.6 / 7.0 / 5.6 / 5.6 / 3.2, ±0.06) is asserted by
  `test_cause_attribution_sums_to_lateness` in `backend/analytics/tests/test_scenarios.py`. AC-SEC-01 is the gitleaks
  job in CI. AC-UI-03 is named in the Playwright suite, which runs in CD only.
- **Not built yet:** the address-confirmation link pages and their confirm flow (AC-LINK-02/04/06–08/10/11,
  AC-SEC-LINK-03–09/11, AC-NFR-LINK-01; `CONFIRM_LINK=on` is refused until task A17), data upload (AC-DATA-*).
- **Built, no test:** the rest above. The largest are the API and EDI order checks (AC-API-01 to 03), the WMS bot
  (AC-BOT-01/02), the 30-second decision time (AC-NFR-02) and auto-reply sender checks (AC-SEC-06).

## Run notes

- In a fresh checkout the first API run gave `Test Files 2 failed | 46 passed (48)`, `Tests 1 failed | 352 passed
  (353)`: `oracle.test.ts` and `eval.test.ts` could not open `backend/synthetic-data/out/saved_addresses.csv`, which is
  generated and not committed. After `npm run data` and `npm run seed:test` (the CI order) the same suite gave
  `48 passed (48)`, `403 passed (403)`. The repeat steps above include `npm run data` for this reason.

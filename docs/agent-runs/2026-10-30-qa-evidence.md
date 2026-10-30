# qa-evidence · test evidence for submission · 2026-10-30

**Asked by:** team (scorecard item 7.2, Testing & QA) · **Branch / commit:** `B27-qa-test-evidence` from `main` at
`98e4f38`
**Request:** Run every test suite on latest `main`, write `docs/TEST-EVIDENCE.md`, and record the run. No code or
test changes.

## What it did
- Set up a fresh worktree: copied the local `.env` (not committed), `npm --prefix backend/api ci`,
  `npm --prefix frontend ci`. Postgres 16 in the running `root-route-db-1` container. Node 24.22.1, Python 3.14.4 from
  the repo `.venv`.
- `python -m pytest -q` → `73 passed in 9.82s` (repeated: `73 passed in 8.96s`).
- `npm run migrate:test` → `applied: 103_address_links.sql`. `npm run pipeline:test` → `wrote 25 tables in 26.8s`.
- `npm --prefix backend/api test`, first run → **failed**:
  ```
   FAIL  test/intake/eval.test.ts > intake eval on 50 fixtures (recorded responses) > AC-INT-01/02/04/05, AC-SEC-02, AC-SEC-05
  Error: ENOENT: no such file or directory, open '<worktree>/backend/synthetic-data/out/saved_addresses.csv'
   ❯ loadSavedAddresses test/intake/fixtures.ts:34:30

   Test Files  2 failed | 46 passed (48)
        Tests  1 failed | 352 passed (353)
  ```
  The second failed file was `test/intake/oracle.test.ts`, which failed to load for the same missing file (its 50
  tests were not collected, hence 353 not 403). Cause: generated synthetic data is not committed; CI runs the
  generators before the API tests. Not a code defect.
- `npm run data` (all five generators) and `npm run seed:test` → `seeded client_domains, client_emails and
  saved_addresses (source = seed; link rows kept)`.
- `npm --prefix backend/api test`, second run → `Test Files 48 passed (48)`, `Tests 403 passed (403)`, 10.75s.
  Repeated with the JSON reporter: 403 / 403, 0 pending, 0 failed.
- `npm --prefix frontend test` → `Test Files 18 passed (18)`, `Tests 113 passed (113)`. Repeated with the JSON
  reporter: 113 / 113, 0 pending, 0 failed.
- `npm run typecheck` → exit 0 (frontend `tsc --noEmit`, API `tsc --noEmit -p tsconfig.json`).
- AC coverage: collected `AC-…` ids (and `test_ac_…` Python names) from 80 test files and compared them with the AC
  tables in `docs/SPEC*.md`: 118 of 193 named by a test, 75 not.

## Not run
- Playwright e2e (`frontend/e2e/`): team rule, no Playwright or `next build` on this machine; it runs in `cd.yml` after
  each deploy.
- Deployed smoke check: the deployed URL is computed in `cd.yml` from Azure and is not written in the README or docs,
  so it was not probed.
- Live-model extraction eval (`intake-eval.yml`, manual). The recorded-response eval passed its thresholds (≥ 90%
  fields, ≥ 95% incomplete recall, ≥ 48/50 decisions); the test does not print the exact score.
- CI run links: no GitHub Actions access from this machine (`gh` not installed); linked the workflow pages instead.

## Output
- `docs/TEST-EVIDENCE.md` (new): per-area tables, jury's inputs, edge cases, repeat commands, CI/CD, known gaps.
- Totals run: **589 / 589 passed** (Python 73, API 403, Dashboard 113) after the data step; typecheck clean.
- Verdict: green on what was run; one environment failure on the first API run, fixed by following the CI order.

## Handed to
- Team: decide whether to add tests (or AC ids) for the built-but-untested ACs listed in TEST-EVIDENCE "Known gaps"
  (AC-API-01–03, AC-BOT-01/02, AC-NFR-02, AC-SEC-06), and to tag `test_cause_attribution_sums_to_lateness` with
  AC-DIAG-07.
- After the next deploy: rerun this agent with the deployed URL to add the smoke result and CI run links.

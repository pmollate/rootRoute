# qa-evidence · test evidence refresh for the working tree · 2026-10-30 (second run)

**Asked by:** team, via the lead agent · **Branch / commit:** `labs-replay-role-home` at `c6cc15c` + uncommitted changes
**Request:** Run every suite on the current working tree, recompute AC coverage, and rewrite `docs/TEST-EVIDENCE.md`
(last written for `98e4f38`, 589 tests). No code or test changes, and no commit.

## Note on the commit
The request said HEAD was `367d926`. `git log -1` shows HEAD is `c6cc15c`, "Merge remote-tracking branch 'origin' into
labs-replay-role-home". That merge brings `origin/main` at `0361805` (PR #88, `fb323aa` fix(mcp)) into `05b3de3`
(feat(intake) Received-at picker), which comes after `367d926`. The evidence records the real HEAD, `c6cc15c`.

The uncommitted changes (`git diff --stat HEAD`: 13 files, +75 −27, plus untracked files) are:
- `backend/analytics/rules.json` (new, untracked); `core/load.py`, `core/scenarios.py` and `carriers/backtest.py`
  read it.
- `backend/analytics/tests/test_load.py`: adds `test_cause_rules_come_from_config`.
- `backend/api/test/warehouse/domain.test.ts`: adds "the order-time cut-off matches the analytics rules config".
- `backend/api/test/intake/eval.test.ts`: prints the exact score.
- `docs/Halcyon_Delivery_Diagnostic.pdf` deleted (staged).
- Doc edits in `CLAUDE.md`, `README.md`, `docs/ROADMAP.md`, `docs/SPEC.md`, `docs/SPEC-data-upload.md` and the
  overview plan. `docs/agent-runs/2026-10-30-jury-1.md` is untracked.

After the suites ran, these changes were committed at 18:22 +0530 as `8aa93c2` (feat(analytics) rules.json) and
`32c8197` (docs, eval score, jury run 1). This agent did not make those commits. `git diff --quiet 32c8197 -- .
':!docs/TEST-EVIDENCE.md'` exits 0, so the tree tested here is identical to `32c8197`.

## Environment
macOS, Node v22.22.0, Python 3.14.4 from the provided scratchpad venv (`requirements.txt` installed) put first on
PATH. Postgres 16 in `root-route-db-1` (up 7 hours). The synthetic data in `backend/synthetic-data/out/` was already
generated, so `npm run data` was not re-run.

## Commands and raw results
- `python -m pytest -q -rs` → `96 passed in 23.16s` (exit 0, no skips reported).
- `npm run test:sim` → `# tests 5`, `# pass 5`, `# fail 0`, `# cancelled 0`, `# skipped 0`, `# todo 0`.
- `npm run migrate:test && npm run pipeline:test && npm run seed:test` → pipeline `wrote 26 tables in 25.9s`; seed
  `seeded client_domains, client_emails and saved_addresses (source = seed; link rows kept)`. The chain exited 0.
- `npm --prefix backend/api test -- --reporter=verbose` → `Test Files 57 passed (57)`, `Tests 499 passed (499)`,
  Duration 11.62s, exit 0. No `↓` (skipped) lines. The five lines that match "skipped" are test names, not skips. The
  eval printed:
  ```
  stdout | test/intake/eval.test.ts > intake eval on 50 fixtures (recorded responses) > AC-INT-01/02/04/05, AC-SEC-02, AC-SEC-05
  intake eval: fields 245/245 (100.0%) · incomplete caught 10/10 (100.0%) · decisions 49/50 (98.0%)
  ```
- `npm --prefix frontend test -- --reporter=verbose` → `Test Files 20 passed (20)`, `Tests 137 passed (137)`,
  Duration 3.88s, exit 0.
- `npm run typecheck` → frontend `tsc --noEmit` and API `tsc --noEmit -p tsconfig.json`, no output, exit 0.

**Total: 96 + 499 + 137 + 5 = 737 passed, 0 failed, 0 skipped, in 94 files.**
Jury count earlier today: about 728 (API 493, frontend 135, pytest 95, simulator 5). The difference is +6 API, +2
frontend and +1 pytest (`test_cause_rules_come_from_config`).

Per area (the file lists are in TEST-EVIDENCE.md): Email 10 py + 367 API + 38 dashboard + 5 sim = 420 · Warehouse
63 + 21 + 9 = 93 · Carriers 7 + 38 + 16 = 61 · Platform 16 + 73 + 74 = 163.

## AC coverage
Ids were collected with `AC-[A-Z]+(-[A-Z]+)*-[0-9]+`. The single-part pattern `AC-[A-Z]+-[0-9]+` would miss ids like
`AC-SEC-AUTH-03`. Python `test_ac_…` names were included, and two short forms were expanded by hand: `AC-INT-01/02/04/05`
(`eval.test.ts`) and `AC-UI-01/02` (`OverviewScreen.test.tsx`). SPEC ACs come from `docs/SPEC*.md`. There are 204
unique ACs: SPEC.md 133, SPEC-auth.md 34, SPEC-order-workflow.md 19 and SPEC-data-upload.md 23 (AC-SEC-LINK-05 is in
two files). Tests that ran name 144 of them, which leaves **60 gaps**. AC-DIAG-06 is named by
`routes/warehouse.test.ts` but no SPEC file defines it. The e2e specs (not run) name AC-ASK-01, AC-AUTH-15, AC-AUTH-16,
AC-NFR-AUTH-04, AC-UI-01 and AC-UI-03. Of these, only AC-UI-03 is not also named by a unit test.

## CI / CD (from `gh run list --branch main`)
- ci 41055990360 on `0361805`: success. cd 41056633380 on `0361805`: in_progress when checked.
- cd 41052618583 on `4587881`: **failure**. Jobs: gate success, deploy success, e2e failure in the step "Smoke test
  every screen (signed in), and one refusal per role". From `gh run view 41052618583 --log-failed`:
  ```
  4 failed
  33 skipped
  2 did not run
  37 passed (7.9m)
  ```
  ```
  ✘  41 [desktop] › e2e/journey.spec.ts:77:7 › past delivery: where it went wrong, and what Root Route would do › D000559: same day ordered after the 08:00 cut-off; Root Route promises next day and says why (22.9s)
  ✘  43 [desktop] › e2e/journey.spec.ts:96:7 › moving through the workflow › the order list and the delivery ID box open another journey (22.4s)
  ✘  45 [desktop] › e2e/journey.spec.ts:116:7 › moving through the workflow › an unknown ref says so instead of showing a journey (22.4s)
  ✘  47 [desktop] › e2e/journey.spec.ts:140:7 › new orders from the inbox › the latest order emails are in the order list and open as an order journey (0ms)
  ```
  Each failed again on retry #1. The error for 77, 96 and 116:
  ```
  Error: expect(locator).toBeVisible() failed
  Locator: locator('main').getByRole('heading', { level: 1 }).or(locator('main').getByRole('alert'))
  Expected: visible
  Timeout: 20000ms
  Error: element(s) not found
  ```
  The error for 140: `"beforeAll" hook timeout of 60000ms exceeded.` at `> 131 |   test.beforeAll(async ({ request }) => {`
  (the hook calls `request.get('/api/intake', { timeout: 30_000 })`).
- cd 41052013926 on `4587881`: success. ci 41051635389 on `4587881`: success.

## Deployed smoke (from this machine)
- `GET https://rootroute01-api.azurewebsites.net/api/health` →
  `{"db":"ok","llm":"azure-openai","version":"45878810665b140436c028bcb45e76b39cd525a6"}`.
- `https://rootroute01-web.azurewebsites.net/` → 200, and `/login` → 200. Signed out, `/dashboard`, `/overview`,
  `/intake`, `/complaints`, `/warehouses`, `/carriers`, `/journey`, `/labs`, `/replay`, `/settings` and `/forbidden`
  each returned 307 to `/login?next=…`, which returned 200 when followed.
- Not done: a signed-in page check (no deployed credentials here) and Playwright (it runs in CD).

## Not run
- The Playwright e2e suite, locally or against the deployed app.
- The live-model extraction eval (`intake-eval.yml`).
- `npm run data` (the generated data was already present; the request was not to regenerate it).

## Files written
- `docs/TEST-EVIDENCE.md` (rewritten)
- `docs/agent-runs/2026-10-30-qa-evidence-2.md` (this file). The earlier record for today,
  `2026-10-30-qa-evidence.md`, was committed in `e3f71fa` and left unchanged.

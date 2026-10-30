# Implementer run: C13 step 5 (Playwright sign-in per role, one refusal per role)

- **Task:** `docs/superpowers/plans/2026-10-26-latelens-C-carriers.md`, Task C13 Step 5 (plus the C12 "Live run needs a
  signed-in session" line). **Branch:** `C13-e2e-sign-in` (from main `e81b05c`).
- **Spec:** `docs/SPEC-auth.md` NFR-AUTH-04, AC-NFR-AUTH-04, §4.4 page matrix, §5.5, Q-AUTH-06 default (`AUTH_DEMO=on`
  on the live synthetic-data app). **REQ/AC:** NFR-AUTH-04, AC-NFR-AUTH-04 (also exercises REQ-AUTH-05, -06, -15, -16,
  AC-AUTH-15, AC-AUTH-16).

## What changed

| File | Change |
|---|---|
| `frontend/e2e/session.ts` (new) | `signedIn` (E2E_DEMO_PASSWORD set), `WORKFLOW_ROLE = 'admin'`, `demoEmail(role)`, `authFile(role)` → `e2e/.auth/<role>.json` |
| `frontend/e2e/auth.setup.ts` (new) | `setup` project: one test per role signs in through the real `/login` form, checks `/api/auth/session` roles are exactly `[role]`, saves storage state. Skips and writes nothing without the password |
| `frontend/e2e/refusals.ts` (new) | The refusal table: one page and one API call per role |
| `frontend/e2e/roles.spec.ts` (new) | `roles` project: per role, the denied page answers 403 with "This page is not available for your role" and keeps its URL; the denied call answers 403 `{ error: 'forbidden' }` through the `/api` proxy |
| `frontend/lib/auth/refusals.test.ts` (new) | Vitest check of the refusal table against `PAGE_ROLES` and the API's `permissions.ts` |
| `frontend/playwright.config.ts` | Projects `setup`, `phone`, `desktop`, `roles`; phone/desktop depend on setup and use admin's storage state when signed in |
| `frontend/e2e/smoke.spec.ts` | `open()` now catches 5xx on same-origin `/api/*` (it only watched `API_URL`, which the browser no longer calls since C13 step 4) |
| `frontend/.gitignore` | `/e2e/.auth/` |
| `.github/workflows/cd.yml` | `e2e` job: `environment: demo`, `id-token: write`, `azure/login` (same pin and secrets as deploy), reads Key Vault `auth-demo-password`, `::add-mask::`, into `$GITHUB_ENV` as `E2E_DEMO_PASSWORD` |
| Plan | Step 5 ticked; C12 live-run line ticked with a note |

## Refusal per role (from SPEC-auth §4.4 and `backend/api/src/core/permissions.ts`)

| Role | Denied page (403, forbidden page) | Denied call (403 `forbidden`) |
|---|---|---|
| `order_desk` | `/dashboard/carriers` (AC-AUTH-15) | `GET /api/carriers` (AC-AUTH-16) |
| `warehouse_supervisor` | `/dashboard/complaints` | `GET /api/complaints` (AC-AUTH-16) |
| `carrier_manager` | `/dashboard/intake` | `GET /api/intake` (AC-AUTH-16) |
| `customer_support` | `/dashboard/warehouses` | `GET /api/warehouses` (AC-AUTH-16) |
| `leadership` | `/dashboard/intake` | `GET /api/complaints` (AC-AUTH-16) |
| `admin` | none: admin opens every screen (§4.4) | `POST /api/intake/0/action` with `action: 'e2e_not_an_action'`: unlisted action, default deny (REQ-AUTH-06) |

The admin call is a POST, but `rolesFor` returns null for that action for every role, the route has no body schema, so
the global preHandler answers 403 before any handler, and intake 0 does not exist. The unit test enforces that any POST
in the table is refused for every role.

## Tests added (test-first)

- `frontend/lib/auth/refusals.test.ts` (AC-NFR-AUTH-04), 14 tests: one entry per role; each page is denied by
  `PAGE_ROLES` (or the role opens every page, for `page: null`); each call is a listed route that `rolesFor` denies the
  role, and its path matches the route pattern; any POST is refused for every role.
  - Seen failing first: `Failed to resolve import "@/e2e/refusals"` (module missing).
  - Mutations caught: `order_desk` → `/dashboard/overview` fails; `customer_support` → `GET /api/overview` fails; admin
    action `approve` fails two tests. The first version passed the whole "GET /api/x" key to `rolesFor` and passed
    vacuously; the mutation showed it, and it was fixed before commit.
- `frontend/e2e/auth.setup.ts` (6 sign-ins) and `frontend/e2e/roles.spec.ts` (6 refusals, AC-NFR-AUTH-04 in each title).
  Negative check: the `order_desk` refusal run with admin's session fails (`Expected: 403, Received: 200`).

## Commands and results

| Command | Result |
|---|---|
| `npm --prefix frontend test` | 16 files, 96 passed |
| `npm run typecheck` | exit 0 (frontend tsc + API lint) |
| `npm --prefix backend/api test` | 40 files, 349 passed |
| `PATH="$PWD/.venv/bin:$PATH" npm run test:py` | 73 passed |
| `npx --prefix frontend playwright test --list` | 58 tests in 4 files; with `E2E_DEMO_PASSWORD` set the list shows 6 `[setup]` and 6 `[roles]` tests |
| Local, `AUTH_REQUIRED=on`, throwaway accounts: `playwright test --project=setup --project=roles` | 12 passed |
| Local, same: full `playwright test` | 42 passed, 16 skipped (phone/desktop-only tests, and no CONFIRM_ADDRESS email in the local inbox); the inbox tests' `request.get('/api/intake')` ran signed in as admin |
| Local, no `E2E_DEMO_PASSWORD`: setup + roles | 12 skipped, no files written |

Local run setup: `DEMO_ENV_FILE=<scratch>/demo.env node frontend/scripts/demo-users.mjs` with stdout to a scratch file
(the throwaway password was never printed); API on 3101 and `next dev` on 3100 started with only `AUTH_SECRET`,
`INTERNAL_AUTH_SECRET`, `AUTH_DEMO_USERS` from that file plus `AUTH_REQUIRED=on`, `AUTH_DEMO=on`,
`INTAKE_POLL_MINUTES=0`; stopped afterwards. Not run against the deployed site; no Azure changes.

`npm run pipeline` not run: the task writes no tables.

## Secret handling

- Password only from `E2E_DEMO_PASSWORD`; no default; not in any title, file or log.
- Setup sets the password with `locator.evaluate`, not `fill()`: Playwright 1.64 renders a fill's value in the step
  title (`Fill "{value}"`), which the uploaded HTML report shows. The `setup` project runs with trace, screenshot and
  video off.
- When signed in, `phone`, `desktop` and `roles` run with trace off and screenshots on failure: a trace records request
  headers, including the session cookie, and CD uploads the report as an artifact.
- `e2e/.auth/` holds session cookies; gitignored, and CD uploads only `frontend/playwright-report`.

## Deviations from the plan / spec

1. **Password source:** SPEC-auth §5.5 and §9.2 say a GitHub Actions secret `E2E_DEMO_PASSWORD`; the agreed design reads
   Key Vault `auth-demo-password` in the job. SPEC-auth needs updating (for `spec-writer`).
2. **`e2e` job now runs in `environment: demo`.** The Azure federated credential trusts only
   `repo:…:environment:demo` (`infra/setup.sh`), and the `AZURE_*` secrets sit in that environment, so the job cannot log
   in otherwise. Side effects: the job shows as a deployment to `demo`, and any protection rule on that environment
   (required reviewers, wait timers) now also applies to e2e. The comment saying the job "needs no secrets" is replaced.
3. **Missing secret is a warning, not a failure:** until `auth-demo-password` exists (C13 step 6), the e2e job warns and
   runs anonymously as today, so CD stays green during rollout steps 1–2.
4. **Refusals skip when the app does not enforce sign-in:** `roles.spec.ts` probes anonymous `/dashboard/overview`; no
   redirect to `/login` means `AUTH_REQUIRED=off`, where REQ-AUTH-13 lets every role through, so the six tests skip with
   that reason rather than fail (rollout step 2 has the password but not enforcement).
5. **`smoke.spec.ts` 5xx filter** now watches same-origin `/api/*` (small fix, not in the step).

## Left for the reviewer / team

- **Tell A and B** (the step says "first"): their screens are visited signed in as admin; no A/B files changed.
- **Step 6 (Azure, not done here):** create Key Vault secret `auth-demo-password` with the same password as
  `auth-demo-users`, and check the `demo` environment's protection rules are acceptable for the e2e job. `infra/setup.sh`
  does not create `auth-demo-password` yet.
- Check 4 means a live app accidentally switched to `AUTH_REQUIRED=off` would skip the refusals (with a visible reason)
  instead of failing. Once step 4 is live, consider making a skip fail in CD.
- SPEC-auth §5.5/§9.2 wording (deviation 1), for `spec-writer`.

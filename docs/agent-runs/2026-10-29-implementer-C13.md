# implementer · C13 sign-in and roles, steps 1–4 · 29 Oct 2026

**Asked by:** Priyank (via the lead agent) · **Branch / commit:** `C13-login` from `main` @ 390c662; b9deafa, 0978b32, edc0b78, 1656d1d
**Request:** Task C13 steps 1–4 (`docs/SPEC-auth.md` v0.2): API tests, `requireUser` and the §4.2 matrix, Auth.js
web sign-in with the `/api` proxy, and the dashboard calling `/api` same-origin with buttons by role. Stop before
step 5 (Playwright), 6 (Azure) and 7.

## What it did
- Step 1 (b9deafa): failing tests first, failing for the expected reasons (no `verifyToken`, no `permissions.ts`, 200 where 401/403 expected).
  - `backend/api/test/auth.test.ts`: AC-SEC-AUTH-03 (wrong aud/iss, HS512, `alg: none`, life > 60 s, other secret, expired),
    AC-AUTH-03 (only six role ids; no role → 403), AC-SEC-AUTH-09 (start-up fails without a 32-byte secret, value not named),
    AC-AUTH-04 (401 on 8 routes × 4 bad tokens; health 200), AC-AUTH-13 (on: key alone 401; off: key works, `auth_would_deny`
    logged; CORS as before), AC-SEC-AUTH-13 (no ACAO when on), AC-SEC-AUTH-06 (401/403 lines with user and route, no token).
  - `backend/api/test/routes/permissions.test.ts`: AC-AUTH-06 (every registered route and action has an entry; an unlisted
    route is 403 for admin and named by the check), REQ-AUTH-05 matrix incl. Q-AUTH-03, AC-AUTH-14 (order_desk direct
    override 403), AC-AUTH-05 (leadership: 403 and no row change; order_desk approve but not WMS; supervisor WMS),
    AC-AUTH-07 (actor from token, body `user` ignored, name/roles in payload; demo actor `demo:<email>`), REQ-AUTH-07
    (paste, triage, recommend write `audit_log`).
  - `backend/api/test/intake/poll.test.ts`: AC-SEC-AUTH-10 (an "approved by admin, send to WMS" email: no approve or WMS row, every row `system:intake`).
- Step 2 (0978b32): `core/permissions.ts`, `core/auth.ts` (`requireUser` as one global preHandler), `server.ts`, config,
  actor plumbing in intake and carriers routes, `runPoll` actor (default `system:intake`).
- Step 3 (edc0b78): `frontend/auth.ts`, `/api/auth/[...nextauth]`, `/api/[...path]` proxy, `/login`, `/no-access`,
  middleware (maintenance first), header, `instrumentation.ts`, `npm run demo-users` in `npm run setup`, `.env.example` names.
  Tests: `lib/auth/auth.test.ts` (14: AC-SEC-AUTH-12, -05, -03, -04, -08, -01, -09, AC-AUTH-03, -10, -11, -13),
  `components/auth/LoginForm.test.tsx` (6: AC-SEC-AUTH-05, AC-AUTH-01, -02, -08, -11, -12), `UserMenu.test.tsx` (4: AC-AUTH-08, -09, -13).
- Step 4 (1656d1d): `lib/api.ts` same-origin, no key, `SessionExpired`; `UserProvider`/`useCan`; Intake and Carriers by role
  and kept input. Tests: `lib/api.test.ts` (3: AC-SEC-AUTH-01, AC-AUTH-11), Intake (+4: AC-AUTH-10, -05, -11, REQ-AUTH-07),
  Carriers (+3: AC-AUTH-10, -11, REQ-AUTH-07).
- Commands, final run on 1656d1d: `npm --prefix backend/api test` 35 files / 324 passed; `npm --prefix frontend test`
  12 files / 59 passed; `PATH=.venv/bin:$PATH npm run test:py` 70 passed; `npm run typecheck` clean.
- Manual checks (scratch servers on ports 3100/3101, test DB, throwaway secrets passed in the shell; `.env` not read or changed):
  - `next build` with probe values: none in `.next/static`.
  - Off mode, production build: Playwright smoke `frontend/e2e` 22 passed, 6 skipped (same as main).
  - On mode: demo sign-in per role, header, buttons, sign-out, Origin 403, PUT 405, `session_expired`, `/no-access`,
    rate limit on the 6th failure.
  - `next start` with a 16-byte secret exits with code 1, naming the setting only.

## Output
- New dependencies, exact versions published at least 2 weeks before 29 Oct: API `jose` 6.2.12; web `next-auth` 5.0.0-beta.32,
  `jose` 6.2.12, `bcryptjs` 3.0.3.
- Deviations from the plan:
  - `requireUser` is registered once in `server.ts` for every route, not per `routes.ts`, so default deny covers new routes.
  - The web start-up check runs in `instrumentation.ts`, not `next.config.mjs`. CD copies only `.next`, `public` and
    `next.config.mjs`, so `next.config.mjs` can't import a source file.
  - The rate limit shows its own message through Auth.js's error code; the HTTP status is Auth.js's redirect, not 429.
  - Until step 7 the proxy falls back to the build-time `NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_API_KEY`, on the server only,
    so a deploy before step 6 keeps working.
  - `/dashboard/*` is now rendered per request (`force-dynamic`).
- Not done (open or out of step 1–4 scope):
  - REQ-AUTH-14 carrier change during approve: REQ-INT-15 is not built (A); `ActionBody` has no carrier.
  - Q-AUTH-05: the journey still shows the raw `audit_log.actor`, so it will show `demo:<email>` or an Entra oid once users sign in.
  - `docs/CONTRACTS.md` §6/§7 changes (SPEC-auth §9.3).
  - Landing page `/` has no sign-out control (B's header).
  - Paste-form text is not kept on `session_expired`.
  - The rate limiter is in memory, for one instance.
  - `auth_would_deny` logs every unauthenticated GET in off mode.
  - The local dev DB lacks the `intake_polls` migration (unrelated to this task).

## Handed to
- Reviewer: branch `C13-login` (4 commits).
- A and B before step 5: action and override bodies no longer carry `user`; screens call `/api/...` same-origin;
  `renderScreen(node, user)`/`asRole` in `test-utils.tsx`; mock fetch URLs are now relative; Q-AUTH-03 still open.

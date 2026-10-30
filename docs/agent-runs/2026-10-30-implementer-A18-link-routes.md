# implementer · A18 (E19, part 3): confirm routes, link state in the intake API, review fields · 2026-10-30

**Task:** A18 in `docs/superpowers/plans/2026-10-26-latelens-A-email.md`. **Branch:** `A18-link-routes`, cut from `main`
at `9c5307a`. **Spec:** SPEC §5.17 (REQ-LINK-02, -06, -07, -09, -11; SEC-LINK-01, -03, -05, -06, -08, -11), CONTRACTS §6/§7.
Not pushed; no PR. Frontend (A19) and Azure / the real `listSas` issuer (A20) untouched.

## What was built
- `backend/api/src/core/redactLink.ts` (new): `redactLink(url)` → `/confirm/[token]`.
- `backend/api/src/server.ts`: request log serializer `{ method, url: redactLink(url) }` (stream in tests, default logger
  outside tests, `false` in tests without a stream, as before); a not-found handler with Fastify's body shape but a
  redacted URL and no "Route … not found" log line; `redactLink` re-exported.
- `backend/api/src/core/auth.ts`: the auth hook's `route` log field redacts the raw URL when no route matched.
- `backend/api/src/modules/intake/linkDeps.ts` (new): `getLinkDeps()` (built per call), `setLinkDeps()` (tests),
  `createMapCredentials()` (recorded: SAS stand-in expiring with the link; azure-maps: throws until A20).
- `backend/api/src/modules/intake/routes.ts`: `GET`/`POST /api/confirm/:token`; `link: { state, expiresAt } | null` on
  `GET /api/intake` and `/api/intake/:id` when on (absent when off); `link` passed to `applyAction`; the review route
  passes the link repo when on.
- `backend/api/src/modules/intake/review.ts`: `addressSource` ('link' | 'saved' | 'email'), and for link orders with the
  repo: `emailAddress`, `confirmedAddress`, `mapReading` (null for a pending second-Confirm check).
- `backend/api/src/core/permissions.ts`: the two public, token-gated entries.

## Tests added (ACs)
- `test/routes/link.test.ts`, no database: AC-SEC-LINK-01 (log lines, incl. an unmatched `/confirm/<token>/more`),
  redactLink unit, AC-SEC-LINK-05 API half (AUTH_REQUIRED=on, no session: 404 `link_invalid`, not 401; `/api/overview` 401).
- `test/routes/link.test.ts`, test database (fixtures 21 and 34, pasted, approved, sent through `send_reply`):
  AC-LINK-02, AC-SEC-LINK-03 (view keys; A's token with B's address changes only A), AC-SEC-LINK-08 API half (SAS
  credential; none for an expired link), AC-SEC-LINK-06, AC-LINK-07 / AC-SEC-LINK-02 (8 byte-identical 404s), AC-LINK-09,
  AC-LINK-06 (expired → confirmed; null without a link; no timer in `link*.ts`), AC-LINK-04 + AC-LINK-11 API half
  (second Confirm, ALL_CLEAR, review fields, `send_to_wms` 409), AC-SEC-LINK-11 (one audit row each; log events with
  8-char hash), AC-SEC-LINK-01 (every public table and every log line free of both tokens; `token_hash` = SHA-256;
  `outbound_messages.body` keeps `[CONFIRM_LINK]`).
- `test/intake/link-deps.test.ts`: REQ-LINK-09 defaults, AC-SEC-LINK-08 issuers.
- `test/intake/review.test.ts`: REQ-LINK-11 / AC-LINK-11 (API) with `memoryLinks`.
- `test/routes/permissions.test.ts`: AC-SEC-LINK-05 entries.

## Commands
- `npm --prefix backend/api test`: 64 files, 548 passed.
- `npm --prefix frontend test`: 21 files, 146 passed.
- `npm run test:sim`: 5 passed.
- `npm run typecheck`: clean (frontend and API).
- `npm run test:py`: not run, no `.venv` and no pytest on this machine; no Python changed.
- `npm run pipeline`: not needed (no table written by Python).

## Deviations from the plan
1. **Fixture 21, not 47, for AC-LINK-02** (SPEC wins). The SPEC's AC-LINK-02 names fixture 21 (gold `CONFIRM_ADDRESS`,
   ZIP mismatch, recorded Medium with a point); fixture 47 is gold `ALL_CLEAR`. Its sender (`orders@client130.example`) is
   added to `allowList` for that test file only and removed in `afterAll`.
2. **AC-LINK-04 with the second Confirm** (SPEC wins). The plan says "a 400 m confirmation"; SPEC AC-LINK-04 says C190
   has no start pin, so the second Confirm REQ-LINK-03 asks for comes first. The test does both posts. The reverse
   look-up is a fake in the test (forward look-ups stay recorded); no reverse recording exists for the Orlando pin.
3. **Two more log leaks closed** (SEC-LINK-01): the auth hook's `route` field and Fastify's default not-found log both
   held the raw URL for an unmatched path. Fixed in `core/auth.ts` and with `setNotFoundHandler` in `server.ts`;
   `redactLink` lives in `core/redactLink.ts` (re-exported by `server.ts`) to avoid an import cycle.
4. `link` is **absent** (not null) from intake responses when `CONFIRM_LINK` is off, so off is byte-for-byte as before.
5. `addressSource` is set on every review order (not only when on); the three link fields only with the link repo.
6. The AC-SEC-LINK-01 table search covers every base table in `public`, a superset of SPEC §4.2's list.

## For the reviewer
- With `CONFIRM_LINK=on` and `ADDRESS_PROVIDER=azure-maps`, `GET /api/confirm/:token` for a valid link answers 500
  until A20 builds the `listSas` issuer (by design of the plan: no credential beats a wrong one).
- The per-IP 429 is the web app's (A19); the API's 429 is the 21st map look-up (A17, unchanged).
- The route test cleans `client-link:%` audit rows and `address_confirm_tokens` in `afterAll`, because other files'
  `RESTART IDENTITY` reuses email ids and `link-repo.test.ts` counts audit rows by `client-link:<id>`.

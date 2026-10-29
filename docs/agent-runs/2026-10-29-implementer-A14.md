# Implementer run: A14 (E18) order review: approve or reject ALL_CLEAR orders, change the carrier

- Task: A14, `docs/superpowers/plans/2026-10-26-latelens-A-email.md` · REQ-INT-14, REQ-INT-15, REQ-AUTH-05, REQ-AUTH-07 ·
  AC-INT-14, AC-INT-15, AC-AUTH-14
- Branch: `A14-order-review` (from `A13-unknown-sender`)

## Tests added
- `backend/api/test/intake/review.test.ts` (new, 5 tests): REQ-INT-15 blocked carrier never offered; REQ-INT-14 queue
  lists ALL_CLEAR orders with lane choices; AC-INT-15 + AC-AUTH-14 approve with carrier A logs one override with the
  approver; AC-INT-15 blocked carrier 409, change without reason 400, same carrier logs nothing; AC-INT-14 reject needs a
  reason, sets REJECTED, WMS refuses. Failed first on `Cannot find module '../../src/modules/intake/review.js'`.
- `backend/api/test/routes/review.test.ts` (new, 3 tests, test database): AC-INT-15/AC-AUTH-14 over HTTP (override_log row
  with `user_name = u1`), AC-INT-14 reject over HTTP (audit_log reason + actor, WMS 409), REQ-AUTH-05 leadership cannot
  reject. Failed first with `{ error: 'a rejection needs a reason' }` (the body schema dropped `reason`).
- `backend/api/test/routes/permissions.test.ts`: `GET /api/intake/review` readable by every role. Failed first with
  `expected null to deeply equal [ 'order_desk', …(5) ]`.
- `frontend/components/dashboard/intake/OrderReview.test.tsx` (new, 4 tests): REQ-INT-15 (UI), AC-INT-15 + AC-AUTH-14 (UI),
  AC-INT-14 (UI), AC-AUTH-10 leadership read-only. Failed first on `Failed to resolve import "./OrderReview"`.
- `frontend/components/dashboard/intake/IntakeScreen.test.tsx`: `E18: "Order review" in the rail opens the review`.
  Failed first on `Unable to find role="button" and name "Order review"`.
- `backend/api/test/intake/pipeline.test.ts`: two `applyAction` call sites now pass `{ edited }` (6th argument is an options object).

## Commands
- `npm --prefix backend/api test -- test/intake/review.test.ts test/intake/pipeline.test.ts`: 20 passed
- `npm --prefix backend/api test -- test/routes/permissions.test.ts test/routes/review.test.ts`: 11 passed (test DB up)
- `npm --prefix frontend test -- --run components/dashboard/intake`: 21 passed
- `npm --prefix backend/api test`: 37 files, 332 tests passed
- `npm --prefix frontend test -- --run`: 13 files, 65 tests passed
- `npm run typecheck`: exit 0

## Deviations
- None in code. `frontend/lib/auth/roles.ts` and the `approve`/`reject` entries in `core/permissions.ts` already existed,
  so only `GET /api/intake/review` was added.
- CONTRACTS §6 `POST /api/intake/:id/action` row: also dropped the stale `user` body field (actor comes from the token).
- Step 13's browser rehearsal (`npm run dev:all`, journey "changed X → Y", 375 px width) was not run here; left for the reviewer.

## For the reviewer
- Carriers owner (C): review the one-line `logOverride = insertOverride` export in `backend/api/src/modules/carriers/index.ts`.
  The order review writes `override_log` only through it, with `order_ref = 'email:<id>'` (already read by `journey.ts`).
- Warehouse owner (B): `send_to_wms` permissions are unchanged; a REJECTED order is refused by `send_to_wms` (409).
- The e2e smoke test (`frontend/e2e/`) uses no selector touched here; a new rail button "Order review" was added under Tools,
  visible to every role (read-only for roles without approve/reject).

# Implementer run: A15 (E12 screen, E14 escalation, poll emailIds)

- Task: A15, `docs/superpowers/plans/2026-10-26-latelens-A-email.md` · REQ-CMP-01, REQ-CMP-02, REQ-CMP-03, REQ-PRI-02,
  NFR-03 · AC-CMP-01, AC-CMP-02, AC-CMP-03, AC-PRI-02, AC-NFR-03 (poll part), AC-AUTH-10 (triage control)
- Branch: `A15-complaints-screen` (from `A14-order-review`)

## Tests added
- `backend/api/test/intake/complaints.test.ts` (2 tests): REQ-PRI-02/AC-PRI-02 escalations first, order kept; AC-CMP-01
  (unit) latest saved triage returned with `prePickup`, plus `isPrePickup`. Failed first on `complaintQueue is not a function`.
- `backend/api/test/intake/poll.test.ts` (1 test): NFR-03 poll log fields carry `emailIds: [1, 2]`. Failed first on
  `pollLogFields is not a function`.
- `backend/api/test/routes/complaints.test.ts` (1 test, test database): AC-CMP-03/REQ-PRI-02 the 24 escalations come first;
  every complaint returns its saved triage; 28 before pickup.
- `frontend/components/dashboard/complaints/ComplaintsScreen.test.tsx` (new, 3 tests): REQ-PRI-02 (UI) "1 of 2 escalate";
  AC-CMP-02 (UI) customer_support triages and sees cause + draft; AC-AUTH-10 leadership/order_desk see no Triage button.
  Failed first on `Failed to resolve import "./ComplaintsScreen"`.
- `frontend/lib/metrics.test.ts`: screen list now seven with `/dashboard/complaints`. Failed first on the list mismatch.

## Commands
- `npm --prefix backend/api test -- test/intake/complaints.test.ts test/intake/poll.test.ts`: 13 passed
- `npm --prefix backend/api test -- test/routes/complaints.test.ts`: 2 passed (test DB up)
- `npm --prefix frontend test -- --run components/dashboard/complaints lib/metrics.test.ts`: 5 passed
- `npm --prefix backend/api test`: 37 files, 336 tests passed
- `npm --prefix frontend test -- --run`: 14 files, 68 tests passed
- `PATH="$PWD/.venv/bin:$PATH" npm run test:py`: 70 passed
- `npm run typecheck`: exit 0

## Deviations
- None in code; the plan matched the current code. No new routes, so `permissions.ts` and `roles.ts` are unchanged
  (`GET /api/complaints` READ, `POST /api/complaints/:id/triage` SUPPORT, UI action `triage` = customer_support + admin).
- Step 9's browser rehearsal (`npm run dev:all`, reload keeps the draft, 375 px width) was not run here; left for the reviewer.

## For the reviewer
- `frontend/components/dashboard/DashboardShell.tsx` `ICONS` has no `/dashboard/complaints` entry (not in the task's
  files), so the mobile drawer shows an empty icon for Complaints. One-line follow-up for the shell owner.
- `frontend/e2e/smoke.spec.ts` (owner C) lists six screens; Complaints is not in its loop. No selector breaks (the nav
  gains one link; the smoke test opens screens by path).

# Implementer run: A13 (E16) unknown senders skipped before any AI call

- Task: A13, `docs/superpowers/plans/2026-10-26-latelens-A-email.md` · REQ-INT-10 · AC-INT-10
- Branch: `A13-unknown-sender` (from `A-plan-remaining`)

## Tests added
- `backend/api/test/intake/pipeline.test.ts`: `AC-INT-10: fixture 50 (unknown domain) is MISSING_INFO with no PII call,
  no model call and no reply` (replaces `unknown sender is MISSING_INFO`). Failed first on missing `reason`.
- `frontend/components/dashboard/intake/IntakeScreen.test.tsx`: `AC-INT-10 (UI): an email from an unknown sender shows
  "Unknown sender" in the list and in the order summary`. Failed first with `Unable to find an element with the text: Unknown sender`.

## Commands
- `npm --prefix backend/api test -- test/intake/pipeline.test.ts test/intake/poll.test.ts`: 23 passed
- `npm --prefix frontend test -- --run components/dashboard/intake/IntakeScreen.test.tsx`: 16 passed
- `npm run typecheck`: exit 0
- `npm --prefix backend/api test`: 35 files, 324 tests passed
- `npm --prefix frontend test -- --run`: 12 files, 60 tests passed

## Deviations
None. The frontend test command needs `-- --run` to exit (vitest watch mode otherwise).

## For the reviewer
- The early return stores the template draft but never sends it; outbound stays allow-listed via the existing send path.
- A re-posted unknown-sender email returns the stored row (status not WAITING), without `reason`, as before.

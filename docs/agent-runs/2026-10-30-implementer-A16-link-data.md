# implementer · A16 (E19, part 1): migration 103, link rules, reply placeholder · 2026-10-30

**Task:** A16 in `docs/superpowers/plans/2026-10-26-latelens-A-email.md`. Owner A, built by C with A's agreement
(Q-LINK-01); A reviews. **Branch:** `A16-link-data`, cut from `spec-pass-30oct` (SPEC v0.12, CONTRACTS updates not yet on
`main`). **REQ:** REQ-LINK-01 (draft half), REQ-LINK-05 (re-seed), REQ-LINK-09 (drafts, start check), SEC-LINK-01,
SEC-LINK-02 (lifetime), SEC-LINK-10, REQ-INT-09 (`confirmed`). The plan predates SPEC v0.12; where they disagree this
follows SPEC v0.12 (deviations below).

## Tests added (all in `backend/api/test/`)
| File | Tests | ACs |
|---|---|---|
| `intake/link-rules.test.ts` | 11 | AC-SEC-LINK-01 (token shape, SHA-256 hex, hash prefix); AC-SEC-LINK-02 (the three examples and the DST example: sent 05:10 EDT 31 Oct 2026 → `2026-11-01T09:10Z`, exactly 24 h); SEC-LINK-02 (day after DST ends, a link sent days later, the 1-hour floor, a shorter lifetime setting); `localToInstant` in EDT, EST, UTC, Chicago; AC-LINK-03 (rule); AC-SEC-LINK-10 |
| `intake/link-draft.test.ts` | 7 | AC-LINK-01 (template and required phrases carry `[CONFIRM_LINK]`; a model draft without it falls back; one with it is kept; the pipeline's `CONFIRM_ADDRESS` draft carries it, `ALL_CLEAR` does not); AC-LINK-09 (off: no placeholder, same phrases, same pipeline drafts as before; `getDeps().confirmLink` is false) |
| `intake/link-config.test.ts` | 3 | AC-LINK-09 (defaults off / 24 h; `checkConfirmLink` names `AUTH_URL`; a fresh process loading `config.ts` with `CONFIRM_LINK=on` and `AUTH_URL` empty exits non-zero with "CONFIRM_LINK=on needs AUTH_URL") |
| `intake/link-seed.test.ts` (test DB) | 3 | CONTRACTS §5 columns of `address_confirm_tokens` (no token column) and the new `saved_addresses` columns; REQ-LINK-05 (a `TRUNCATE intake_emails … CASCADE` keeps `saved_addresses`); AC-LINK-05 (re-seed rebuilds `source='seed'` rows and keeps `source='link'` rows; in a rolled-back transaction) |
| `intake/address.test.ts` | +1 | REQ-INT-09 / REQ-LINK-04: `decide` with status `confirmed` is `ALL_CLEAR` |

Each new test was run red first for the expected reason (module missing, placeholder missing, `confirmLink`
undefined, columns missing, link row deleted by `TRUNCATE`, saved addresses emptied by the cascade), except
`link-config.test.ts`, written straight after the `config.ts` change (it would have failed on the missing export).

## Commands and results
- `npm --prefix backend/api test` before: 44 files, 376 passed. After: **48 files, 401 passed** (+25), 0 skipped.
- `npm --prefix backend/api run migrate:test`: `applied: 103_address_links.sql` (re-applied once after removing the FK,
  test DB only; the dev DB was not migrated).
- `npm run seed:test`: seeded; 567 `saved_addresses` rows, still 567 after the full suite.
- Intake eval / oracle / reply tests (`eval.test.ts`, `oracle.test.ts`, `reply.test.ts`): 60 passed; recordings unchanged
  (no prompt change; flag off).
- `npm run typecheck`: exit 0. `npm --prefix frontend test`: 17 files, 99 passed (no frontend change).
- Python suite and `npm run pipeline` not run: no Python or pipeline table touched.

## Deviations from the plan
1. **Migration number 103**, not 102 (`102_client_emails.sql` exists). One-line renames in the A plan (lines 46, 4197,
   4212, 4221, A16 title/files/step 7/commit, A17 references) and CONTRACTS §5 (table row, heading) and §8 (folders).
   **Not changed:** SPEC §5.17 intro ("migration `102`") and SPEC §6 (`saved_addresses` / `address_confirm_tokens`
   "migration 102") — left for the spec-writer.
2. **Lifetime on instants (SEC-LINK-02, SPEC v0.12).** `linkExpiry(receivedAt: LocalTimestamp, sentAt: Date, hours,
   timeZone = MAILBOX_TIMEZONE): Date` instead of the plan's wall-clock `(LocalTimestamp, LocalTimestamp, hours) →
   LocalTimestamp`. The pick-list date comes from the arrival wall-clock; each candidate 08:00 cut-off is turned into an
   instant with `localToInstant` (the IANA zone's rules); 24 h / 2 h / 3 h / 1 h are elapsed milliseconds. A link sent
   days later starts its search at the send's local date. Plan tests rewritten as UTC instants for `America/New_York`.
3. **`saved_addresses.email_id` has no foreign key** (CONTRACTS §5 said `→ intake_emails(id)`). With the FK, the route
   tests' `TRUNCATE intake_emails … CASCADE` emptied `saved_addresses` and AC-INT-06 failed; a demo reset would do the
   same. CONTRACTS §5 cell updated; a test guards it. `address_confirm_tokens.email_id` keeps its FK.
4. **Seed refactor for AC-LINK-05.** The plan only swapped the `TRUNCATE`; `seed.ts` is a top-level script, so the writes
   moved to `modules/intake/seedTables.ts` (`writeSeed(db, data)`, caller owns the transaction) and `seed.ts` calls it.
   The current seed also clears `client_emails` (added after the plan); kept.
5. **REQ-LINK-09 start check** is `checkConfirmLink(config)` exported from `config.ts` (testable) rather than an inline
   `if`. `CONFIRM_LINK` also treats an empty value as off (like `ASK_ASSISTANT`).
6. **`test/setup.ts`** pins `CONFIRM_LINK=off` so a developer's `.env` cannot change drafts or recordings in tests.
7. `saved_addresses.source` has `CHECK (source IN ('seed','link'))` (CONTRACTS lists exactly these two values).
8. Extra tests beyond the plan (DST, floor, days-later, model draft kept, pipeline drafts, config subprocess, seed).
9. No Maps settings added (`AZURE_MAPS_ACCOUNT_ID`, `AZURE_MAPS_SAS_PRINCIPAL_ID` are A18/A20).

## For the reviewer (A) and for A17
- **Do not turn `CONFIRM_LINK` on before A17 merges.** With it on, drafts carry `[CONFIRM_LINK]` but `send_reply` does not
  yet mint a link or strip the line, so the placeholder would be sent as text. A17 must do both halves of REQ-LINK-01 /
  -09 at send time: replace the placeholder with `<AUTH_URL>/confirm/<token>` (keep `[CONFIRM_LINK]` in
  `outbound_messages.body`); no placeholder in the operator's text → no mint; flag off → remove the line holding it,
  no token row (AC-LINK-01, AC-LINK-09).
- A17 calls `linkExpiry(email.received_at, new Date(), config.CONFIRM_LINK_HOURS)` (returns a `Date` for
  `expires_at timestamptz`), not the plan's `localToInstant(linkExpiry(...))` pair.
- `email_id` on the token row is the email the reply was sent for; revocation walks the thread via `in_reply_to`
  (REQ-LINK-08, CONTRACTS §5).
- `AddressStatus` now has `confirmed`; `frontend/components/dashboard/intake/IntakeScreen.tsx` (lines ~324–325) would show
  it as "Missing". No row has it until A17; the screen change belongs to A18.
- The link-confirmed `saved_addresses` insert (A17, on approval) should set `source='link'`, `lat`, `lon`, `email_id`,
  `confirmed_at`; `repo.savedAddresses` reads all rows today, so REQ-LINK-05 "not offered before approval" holds only
  because the row is written at approval.
- SPEC §5.17 and §6 still say migration 102 (spec-writer).
- `backend/api/dist/modules/intake/seed.js` (build output, untracked by this change) still has the old `TRUNCATE`; rebuild.

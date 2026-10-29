# planner · A remaining work (A13–A15) · 2026-10-29

**Asked by:** Priyank Mollate (via the lead agent) · **Branch / commit:** `A-plan-remaining` from `main` c350a93
**Request:** Plan the rest of resource A (Email) except E10, E11 and E13: unknown senders (E16), order review (E18), and
the complaints screen with escalation plus traceable poll logs (E12, E14, NFR-03).

## What it did
- Read `CLAUDE.md`, SPEC §5.3, §5.7, §5.10, §5.15, §6, §7, §8, §14.1; `docs/SPEC-auth.md` §4.1–4.3; `docs/CONTRACTS.md`
  §2 and §6; the A plan; and the code on `main`: `modules/intake/{pipeline,actions,routes,repo,read,reply,complaints,poll,priority}.ts`,
  `core/permissions.ts`, `modules/carriers/{index,queries,journey,domain}.ts`, `IntakeScreen.tsx` (+ test), `test-utils.tsx`,
  `lib/auth/roles.ts`, `config/dashboard.ts`, and the intake and route tests.
- Confirmed the gaps on `main`: `processEmail` calls `readOrder` (PII, model) for an unknown domain; actions are only
  approve | send_reply | send_to_wms; no `GET /api/intake/review`; no complaints screen; `GET /api/complaints` has no
  escalation flag or ordering; poll log lines carry counts only. `permissions.ts` already lists `reject` (order_desk,
  admin); `override_log` is written only by C's `insertOverride`, which C's `index.ts` does not export.
- Ran every code block of the three tasks in a throwaway worktree of `main` (removed afterwards): backend `tsc` clean;
  6 backend files, 44 tests passing, including the new route tests against the test database (`review.test.ts` 3 tests,
  `complaints.test.ts` 2 tests); frontend `tsc` clean; 4 frontend files, 26 tests passing. The database runs left rows
  in the test database's `override_log`, `audit_log` and `complaint_triage`; the new tests read only rows newer than
  their start, so they pass on a reused database.

## Output
- `docs/superpowers/plans/2026-10-26-latelens-A-email.md`:
  - Added **Task A13 (E16)** (branch `A13-unknown-sender`; REQ-INT-10, AC-INT-10): early return in `processEmail`
    before PII and the model, template draft, `reason: 'unknown sender'`, "Unknown sender" chip and summary line.
  - Added **Task A14 (E18)** (branch `A14-order-review`; REQ-INT-14, REQ-INT-15, REQ-AUTH-05, REQ-AUTH-07; AC-INT-14,
    AC-INT-15, AC-AUTH-14): `review.ts` (`carrierChoices`, `reviewQueue`), `reject` and approve-with-carrier in
    `actions.ts` (6th argument becomes an options object), `GET /api/intake/review`, `logOverride` exported from C's
    `index.ts` (C reviews), `OrderReview.tsx` as a mode of the Order emails desk (SPEC §5.7 puts the review in the
    Intake screen).
  - Added **Task A15** (branch `A15-complaints-screen`; REQ-CMP-01..03, REQ-PRI-02, NFR-03; AC-CMP-01..03, AC-PRI-02,
    AC-AUTH-10): `complaintQueue` / `savedTriages` / `isPrePickup`, escalations first with the latest saved triage,
    `pollLogFields` with `emailIds`, a `/dashboard/complaints` screen (own nav entry, owner A).
  - Schedule: a Thu 29 row for A13–A15 and a risk note (submission day; fallback is merging each task's backend half
    first). File Structure and Read first updated.
- No SPEC or CONTRACTS edits here; each task has a step that updates its CONTRACTS rows.

## SPEC gaps found (for `spec-writer`)
1. **"Supervisor" vs `order_desk`.** SPEC §5.3 step 12, §5.7 and REQ-INT-14/15 say a *supervisor* approves or rejects
   and changes the carrier. SPEC-auth §4.2 gives approve and reject to `order_desk` and `admin` only, not
   `warehouse_supervisor`. The plan follows §4.2 as instructed. The wording should match, and this ties in with Q-AUTH-03.
2. **Where complaints are shown.** SPEC §5.7 lists complaints (E12) inside the Intake screen row; the plan gives them
   their own screen `/dashboard/complaints` (owner Email). Add a row to §5.7 or say otherwise. REQ-UI-01's screen list
   does not name it.
3. **Synthetic or real complaints on screen.** SD-03 says the complaint inbox shows synthetic complaint emails; the API
   serves the real `complaints.csv` rows, so the screen has no Synthetic badge. State which one the screen shows.
4. **REQ-INT-14 scope and reason.** The SPEC does not say whether reject applies only to ALL_CLEAR orders or how long a
   reason must be. The plan allows reject only for ALL_CLEAR orders awaiting approval, with a reason of at least 3
   characters (the same minimum as `POST /api/overrides`).
5. **REQ-INT-15 and capacity.** Only blocked carriers are left out of the choices; a carrier "at daily capacity"
   (AC-CAR-08) is still offered, with that reason shown. Say whether it may be chosen.
6. **How "the order shows A" (AC-INT-15).** The plan appends an `intake_extractions` row with the chosen carrier
   (append-only, A's table); `override_log` holds the history. The SPEC does not say how it is stored.
7. **NFR-03 for Gmail mail.** Emails fetched by the poll get no per-email "decided" log line, only the poll line with
   `emailIds` (A15). AC-NFR-03 asks for extraction, decision and action events per email id. A per-email log line in
   `processEmail` would close this; it is not planned.
8. **Unknown sender in a known thread.** A client's answer from a different, unknown domain in a Gmail thread we hold
   is treated as an unknown sender (SPEC §5.3 step 3 applies to every email). Confirm.
9. **CONTRACTS §6 is out of date** for `POST /api/intake/:id/action` (still shows `user` and `x-api-key`). A14 Step 14
   rewrites that row.

## Handed to
- `implementer`: Task A13, then A14, then A15, each on its own branch from the latest `main`.
- `spec-writer`: gaps 1–8 above.
- Carriers owner: review the `logOverride` export in A14.

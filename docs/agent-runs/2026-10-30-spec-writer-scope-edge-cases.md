# spec-writer · scope, constraints and edge cases · 30 Oct 2026

**Asked by:** team (jury scorecard 1.2, "Requirements, scope & traceability") · **Branch / commit:** `B31-scope-constraints-and-edge-cases` from `main` 98e4f38
**Request:** Add an explicit out-of-scope list and a constraints list to SPEC §3, and an edge-case table that maps each
case to its REQ/AC id, the code that handles it and the test that covers it (or says "not tested").

## What it did
- Read `CLAUDE.md`, `.claude/agents/spec-writer.md`, SPEC §1, §3, §5, §8, §9, §12, §14.1, §15, §16 and the brief
  (`textutil -convert txt -stdout docs/Halcyon.docx`: ground rules; "six carriers (three have no API)").
- Listed 83 test files (`backend/api/test`, `backend/analytics/tests`, `frontend/**`) and read the test names in the intake,
  warehouse, carrier, assistant, auth and analytics suites; read the handling code for each edge case.
- Checked each out-of-scope and constraint line against a source (CLAUDE.md, the brief, a SPEC section or id).

## Output
- `docs/SPEC.md` v0.13: version line and "Changes in v0.13" note; new §3.1 Out of scope (OS-01 to OS-13) and §3.2
  Constraints (CN-01 to CN-13); new §9.4 Edge cases (EC-01 to EC-20). No REQ/AC id, figure, cause or tier changed.
  §4 and README untouched.
- Edge cases: 20. Handled and tested as specified: 17. Partly tested (untested part not built): EC-06 (AC-INT-13 send
  failure), EC-20 (AC-LINK-07 expired/used link page, AC-SEC-06 automatic replies). Gap: EC-09.
- Finding (EC-09): REQ-INT-09 / AC-INT-09 and the 27 Oct §14.1 decision say only a `high` map result or a saved address is
  `ALL_CLEAR` and a map outage makes the email wait. In the code (`src/modules/intake/address.ts` `verifyAddress`,
  `validate.ts` `UNAVAILABLE`) a `medium` result with no issue and an unreachable map both keep the address `complete`,
  so `decide()` returns `ALL_CLEAR`. `test/intake/address.test.ts` asserts that current behaviour. SEC-04 operator
  approval still stands before WMS entry.
- Finding: SEC-06 / REQ-INT-12 automatic replies are not implemented (`INTAKE_AUTO_REPLY` appears nowhere in
  `backend/api/src`); every reply waits for an operator, the safe default.

## Handed to
- `planner`: a task for the Email owner (A) to make `medium` → `CONFIRM_ADDRESS` and map-unavailable → `WAITING`
  (REQ-INT-09, AC-INT-09), with a test, then update EC-09 to "tested".
- `qa-evidence`: link §9.4 from the test evidence page.

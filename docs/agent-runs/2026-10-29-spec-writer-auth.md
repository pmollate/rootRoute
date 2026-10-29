# spec-writer · auth (P7 sign-in and roles) · 29 Oct 2026

**Asked by:** Priyank (via the lead agent) · **Branch / commit:** `C13-login-spec` @ 2df4ac9 (uncommitted edits)
**Request:** Rewrite `docs/SPEC-auth.md` into a review-ready v0.2 of the same feature, keeping the decisions of 29 Oct
(Entra ID + demo accounts, one role per agent gate, nothing public, build after submission, BFF with a 60 s internal JWT).

## What it did
- Read CLAUDE.md, SPEC §3, §7, §8, §12, §13, §14.1, `SPEC-order-workflow.md`, the v0.1 draft and Task C13.
- Checked the code: `requireApiKey` in `backend/api/src/core/auth.ts`; 25 routes registered (17 GET, 8 POST, including health and MCP);
  `POST /complaints/:id/triage` and `POST /recommend` have no check; `user: 'ops'` in `IntakeScreen.tsx`; "Full name"
  in `CarriersScreen.tsx`; `NEXT_PUBLIC_API_KEY` in `frontend/config/dashboard.ts`; CORS `origin: true` in `server.ts`;
  actor columns `audit_log.actor`, `override_log.user_name`; `complaint_triage` has no actor column.
- Found that SPEC §14.1 (26 Oct) already records that tenant users may create app registrations; Q-AUTH-01 is narrowed
  to app roles and user assignment.
- Coverage check (script): 31 ids, 25 MUST, all 31 with an AC; every AC is referenced in Task C13.

## Output
- `docs/SPEC-auth.md` v0.2: role × action matrix with default deny and the SPEC §7 routes not built yet (`reject`,
  `/orders`, `/orders/edi`); effect on A, B, C screens; internal token table; session lifecycle; error states; threat
  model T1–T13 mapped to ids; config and secrets table (names only); contract changes for CONTRACTS.md; rollout with
  checks and a rollback valid after the key is removed; out of scope; risks; Q-AUTH-01 to -06.
- Ids: REQ-AUTH-01 to -14 (01–10 keep their v0.1 meaning; 11–14 new), NFR-AUTH-01 to -04 (04 new), SEC-AUTH-01 to -13
  (08–13 new). SEC-JRN-02 → REQ-AUTH-04 unchanged.
- `docs/SPEC.md` v0.10: change note; §3 pitch line; §12 Q-AUTH-01 to -06 (as bullets, the section's format); §13 link;
  §14.1 row for the 29 Oct decision.
- `docs/SPEC-order-workflow.md` §9: P7 no longer "pitch only"; Q-AUTH-05 pointer.
- `docs/superpowers/plans/2026-10-26-latelens-C-carriers.md` Task C13: AC references and steps aligned with v0.2
  (asked for by the lead, since ids were added).
- Not changed: `docs/CONTRACTS.md` describes what is built; the changes are listed in SPEC-auth §9.3 for the C13 PR.

## Handed to
- `planner`: review Task C13 against SPEC-auth v0.2 (new: `system:intake` actor in the poll, CORS off, fail-closed
  startup, kept drafts on `session_expired`, `npm run setup` demo users, API access restriction).
- Email (A) and Warehouse (B) owners: Q-AUTH-03 (`send_to_wms` role); A to review §4.3 Intake changes and REQ-AUTH-11.
- Team: Q-AUTH-02, -04, -05, -06; Azure admin: Q-AUTH-01.

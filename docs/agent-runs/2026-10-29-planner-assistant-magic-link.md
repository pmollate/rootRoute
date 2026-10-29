# planner · D10 in-app assistant and E19 address link · 2026-10-29

**Asked by:** Priyank Mollate (resource C), through the lead agent · **Branch / commit:** `spec-assistant-magic-link`
from `main` be3894b (nothing committed; the SPEC v0.11, CONTRACTS and SPEC-auth v0.3 changes are uncommitted in the
working tree and were read there)
**Request:** Test-first task plans for D10 (SPEC §5.16) in the C plan after C13, marked blocked on Q-ASK-01, and for
E19 (SPEC §5.17) in the A plan, marked "owner A; built by C if A agrees (Q-LINK-01); after submission".

## What it did
- Read CLAUDE.md; SPEC §5.3 (steps 11–14, REQ-INT-09), §5.7, §5.14, §5.16, §5.17, §12 (Q-ASK-01 to -04, Q-LINK-01 to
  -06, SD-04); the CONTRACTS and SPEC-auth diffs; the spec-writer's run record; the A plan (A13–A15 style) and C plan
  (C9–C13).
- Read code on `main`: `modules/mcp/{server,routes}.ts`, `core/llm/*`, `core/recordings.ts`, `core/{config,auth,
  permissions,modules}.ts`, `server.ts`, `core/maps/*`, `modules/intake/{actions,pipeline,reply,repo,review,routes,
  address,decide,validate,mailbox,seed,deps,schema}.ts`, migrations 100 and 101, `core/db/migrate.ts`;
  `frontend/{middleware.ts,auth.ts}`, `lib/auth/{proxy,demo,log,session}.ts`, `app/api/[...path]/route.ts`,
  `app/dashboard/layout.tsx`, `DashboardShell.tsx` (+ test), `lib/api.ts`, `test-utils.tsx`, `vitest.config.mts`, and
  the tests `mcp`, `llm`, `auth`, `routes/permissions`, `intake/review`, `intake/memoryRepo`.
- Prototyped in a throwaway worktree of `main` (removed afterwards; node_modules linked, no `.env` copied):
  - D10: `mcp/tools.ts` registry and the `server.ts` refactor; `LLM.toolChat` on Azure OpenAI and recorded;
    `assistant/{figures,answer,limit,routes}.ts`, `prompts/system.md`, config and permission entries. API `tsc` clean.
    New tests: `tools` 2, `figures` 4, `answer` 6, `llm-tools` 3, `route` 6 = 21 passing; existing `mcp.test.ts` 5,
    `llm.test.ts` 7, `auth.test.ts`, `permissions.test.ts` passing (49 tests, 4 database tests skipped) after one change
    to the permissions test (below). Panel `AskPanel.tsx` + 4 tests passing; frontend `tsc` clean.
  - E19: `linkRules.ts` (6 tests), reply placeholder (3 tests), `link.ts` service and the `applyAction` wiring with a
    memory link store (10 tests), web `lib/auth/{open,linkGate}.ts` + proxy exception + `RateLimiter.take` (5 tests).
  - Whole suites with all changes: backend 289 passing, 35 skipped (database), 2 failing only because the worktree lacks
    the gitignored `backend/synthetic-data/out/` files (`oracle`, `eval`); frontend 16 files, 81 passing.
  - The plan inlines these files verbatim. Not run: migration 102, the `linkRepo` SQL, database route tests, the
    confirm page and map component, live model or Maps calls, Playwright.

## Output
- `docs/superpowers/plans/2026-10-26-latelens-C-carriers.md`: new section "After submission: D10" with a Q-ASK-01
  banner and:
  - **C14** One tool registry for MCP and the assistant; `LLM.toolChat` with `store: false` (REQ-ASK-02, -10,
    SEC-ASK-03, -04).
  - **C15** `POST /api/assistant`: route, figure check, sources, refusals, rate limit, log line, recordings
    (REQ-ASK-03 to -10, NFR-ASK-02, -03, SEC-ASK-01, -02, -05, -06).
  - **C16** "Ask LateLens" panel on every screen (REQ-ASK-01, SEC-ASK-03 browser, SEC-ASK-06, NFR-ASK-01).
  - Schedule row "after submission, C14 → C15 → C16, blocked on Q-ASK-01"; File Structure lines.
- `docs/superpowers/plans/2026-10-26-latelens-A-email.md`: new section "After submission: E19" with the Q-LINK-01
  banner and:
  - **A16** Migration 102, link rules, reply placeholder (`seed.ts` stops truncating link rows).
  - **A17** Mint at `send_reply`, open, confirm, decide again, save on approval; `linkRepo` SQL; reverse geocoding.
  - **A18** Confirm routes, token redacted from API logs, link state in `GET /api/intake`, review fields.
  - **A19** `/confirm/{token}` page, proxy exception, middleware open list, per-IP limit, headers, desk and review UI.
  - **A20** Azure: tile credential (SAS default), settings, log check, switch-on (blocked on Q-LINK-02).
  - Schedule row "after submission, A16 → A20, blocked on Q-LINK-01"; File Structure lines.
- No edit to SPEC.md, CONTRACTS.md, SPEC-auth.md or CLAUDE.md.

## Blocked steps
- Q-ASK-01: all of C14–C16. Q-ASK-02: C15 Step 11 (recordings), C16 Step 6 (live p95, App Insights). Q-ASK-03: C15
  Step 5 uses the SPEC default (tools by the routes each role may read, derived from `permissions.ts`).
- Q-LINK-01: all of A16–A20. Q-LINK-02: A20 Step 1 (and the map credential in A18 Step 2 stays recorded until then).
  Q-LINK-03: A16 Steps 2–3 (SPEC defaults as constants; `MAILBOX_TIMEZONE`, today `[HALCYON_TIMEZONE]`). Q-LINK-04:
  A17 Step 3 (promise from arrival time). Q-LINK-05: A17 Step 1 (minting only in `send_reply`). Q-LINK-06: A20 Step 5.

## SPEC gaps and contradictions (for `spec-writer`)
1. **Token in request logs.** Fastify logs `req.url` for every request, so `/api/confirm/<token>` would put the token
   in the API log, against SEC-LINK-01 and L2. App Service HTTP logs and App Insights request telemetry store URLs too.
   The plan redacts it in the API's request serializer (A18 Step 1) and checks Azure logging (A20 Step 4). L2 should
   name URL logging as a control point.
2. **SEC-LINK-08 vs the Entra option in Q-LINK-02.** An Entra access token's lifetime (about an hour) cannot be set to
   end at the link's expiry, so only a SAS token meets "expiring no later than it". The plan's default is SAS.
   CONTRACTS §7's `AZURE_MAPS_CLIENT_ID` belongs to the Entra path; SAS needs the Maps account's ARM id (the plan calls
   it `AZURE_MAPS_ACCOUNT_ID`). `LinkView.map` has no `clientId` for the Entra path.
3. **`address_confirm_tokens.email_id` = "the order's first email".** A `CONFIRM_ADDRESS` reply can be sent for a
   client's follow-up email (in the same thread), which holds the latest extraction and status. The plan stores the
   email the reply was sent for, and REQ-LINK-08 revokes unused links across every email of the order (found through
   `in_reply_to`). CONTRACTS §5's note should say that.
4. **`AUTH_URL` is read by the API too** (the link is `<AUTH_URL>/confirm/<token>`). CONTRACTS §7 lists it for the web
   only. The plan adds it to the API's config and refuses to start with `CONFIRM_LINK=on` and no `AUTH_URL`.
5. **Operator edits.** SPEC does not say what happens when the operator's edited reply drops `[CONFIRM_LINK]`
   (plan: no link minted, reply sent as written), or when a draft written with the flag on is sent after it is turned
   off (plan: the placeholder line is removed, never sent as text).
6. **CONTRACTS §1.1 `LLM.toolChat`.** The plan puts `toolChat` on `ToolChatLLM extends LLM` (so the intake's hand-made
   `LLM` stand-ins need no change) and adds an optional `answerSchema` to `ToolChatRequest` (Structured Outputs for the
   final `{ answer, refused }`).
7. **Leadership and POST routes.** `test/routes/permissions.test.ts` asserts no POST is open to `leadership`. SPEC-auth
   §4.2 gives every role `POST /api/assistant`; it only reads. The plan adds a named read-only exception in that test.
   SPEC-auth could say "no write is open to leadership" rather than "no POST".
8. **What "checked" means.** The figure check passes a number found anywhere in any tool result, the question or the
   arguments. It stops invented numbers, not a real number quoted for the wrong thing, and a number the user typed
   ("is it 99%?") counts as found. §5.16 should state this limit so the UI does not over-claim.
9. **AC-ASK-07 "no Gmail call".** The assistant never loads Gmail; the plan proves it with a source scan plus the table
   counts, not a runtime spy.
10. **AC-SEC-LINK-09 first half cannot run on `main`.** `INTAKE_AUTO_REPLY` (SEC-06 automatic replies, REQ-INT-12) is
    not built. The plan keeps minting inside `send_reply` only; the auto-reply task, when written, must add the test.
11. **Fixtures in AC-LINK-02 and AC-LINK-04.** Fixture 47's gold JSON says `ALL_CLEAR`, while AC-LINK-02 calls it a map
    `medium` (which REQ-INT-09 makes `CONFIRM_ADDRESS`). AC-LINK-04 names "C190's CONFIRM_ADDRESS order" without a
    fixture id. Check both before A18 Step 3.
12. **In-memory rate limits.** Both limits (assistant per user, link per IP) are per process. That is correct for one
    instance (SPEC §10). Scaling out would multiply them; say so in §5.16 and §5.17.
13. **Lifetime arithmetic and daylight saving.** The lifetime is computed on wall-clock minutes in
    `MAILBOX_TIMEZONE`; across a DST change it is off by the shift. This is acceptable for a design setting, but the
    SPEC could say so. The zone is still `[HALCYON_TIMEZONE]` (Q-LINK-03).
14. **Re-seeding.** `seed.ts` truncated `saved_addresses`, which would delete link-confirmed addresses (REQ-LINK-05).
    A16 changes it to delete only `source = 'seed'`. CONTRACTS §5 could note that the seed owns only those rows.

Nothing in the two features was found unbuildable. A20 cannot be done by the team alone: the Maps account sits outside
our resource group.

## Notes
- The request said frontend Vitest needs `-- --run`. It does not: `frontend/package.json` already runs `vitest run`.
  The plans use `npm --prefix frontend test -- <files>`.

## Handed to
- Team: Q-ASK-01 before C14; Email owner: Q-LINK-01 before A16.
- `spec-writer`: gaps 1–14 above.
- `network-security-auditor`: gap 1 (token in URL logs) and gap 2 (tile credential), with L1–L11, T14, T15.
- `implementer`: C14 first once Q-ASK-01 is answered; A16 once Q-LINK-01 is answered.

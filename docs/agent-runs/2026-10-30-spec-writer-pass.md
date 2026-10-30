# spec-writer · D10 as built, E19 gaps, e2e password · 2026-10-30

**Asked by:** Priyank Mollate (resource C), through the lead agent · **Branch / commit:** `spec-pass-30oct` from `main`
d5ca10a (nothing committed; the owner reviews the diff)
**Request:** Close the planner's 14 SPEC gaps (`2026-10-29-planner-assistant-magic-link.md`), make §5.16 and CONTRACTS
match D10 as built (C14–C16) with the 30 Oct decisions, move the e2e password in SPEC-auth to Key Vault (C13 step 5),
and log the 30 Oct decisions in §14.1.

## What it did
- Read CLAUDE.md; SPEC §3, §4.4, §5.3, §5.7, §5.16, §5.17, §8, §12, §14.1, §16; SPEC-auth §4–§13; CONTRACTS §1.1, §3,
  §5–§7; the planner record; the C14 reviewer, C15 and C16 implementer and reviewer records.
- Read the code on `main`: `modules/assistant/{answer,figures,routes,limit}.ts`, `prompts/system.md`,
  `core/llm/{types,recorded}.ts`, `azureOpenai.ts` (`toolChat`), `frontend/components/dashboard/assistant/*`,
  `DashboardShell.tsx`, `overview/OverviewScreen.tsx` (Router), the assistant tests. Branch `C13-e2e-sign-in`:
  `.github/workflows/cd.yml` (e2e job), `frontend/e2e/roles.spec.ts`.
- Checked the fixtures for gap 11 against the recorded map answers (recording key recomputed in Python from
  `queryText`): fixture 47 is gold `ALL_CLEAR` but its recorded map answer is `Medium` (so the pipeline decides
  `CONFIRM_ADDRESS`); fixture 21 is gold `CONFIRM_ADDRESS`, complete address, recorded `Medium` with a point; fixture 34
  (C190) is gold `CONFIRM_ADDRESS` with line 1 and ZIP missing and no map recording. Also found gold `ALL_CLEAR`
  fixtures 08, 12, 15, 17, 22 and 28 with `Medium` recordings (not E19; for A, below).
- DST example computed with Python `zoneinfo`: a send at 05:10 EDT on 31 Oct 2026 expires 2026-11-01T09:10Z (04:10 EST).

## The 14 planner gaps
| # | Gap | What I did |
|---|---|---|
| 1 | Token in request logs | Fixed. SEC-LINK-01: the Fastify request log serializer writes `/api/confirm/[token]`; no web log line holds the path; App Service HTTP logs and App Insights request telemetry off or rewritten. L2 names URL logs as a control point. AC-SEC-LINK-01 adds request lines and the live log query |
| 2 | SAS vs Entra; `AZURE_MAPS_CLIENT_ID` | Fixed. SAS only (SEC-LINK-08, new "Map credential" paragraph: `listSas` via managed identity, expiry ≤ link, 50/s cap, only in the valid-link GET, never stored or logged; never the shared key). `LinkView.map.kind` is `'sas'`. CONTRACTS §7: `AZURE_MAPS_ACCOUNT_ID`, `AZURE_MAPS_SAS_PRINCIPAL_ID`; `AZURE_MAPS_CLIENT_ID` dropped. Q-LINK-02 narrowed to who sets up the Maps account (default: `CONFIRM_LINK` off in Azure) |
| 3 | `email_id` = first email | Fixed. CONTRACTS §5: the email the reply was sent for; revocation across the thread via `in_reply_to`. REQ-LINK-08 and AC-LINK-08 say the same |
| 4 | `AUTH_URL` read by the API | Fixed. §5.17 step 2, REQ-LINK-09 (refuse to start without it), AC-LINK-09; CONTRACTS §7; SPEC-auth §9.2 |
| 5 | Operator edits; flag off after drafting | Fixed. §5.17 step 2; REQ-LINK-01 (no placeholder → no link, sent as written); REQ-LINK-09 (line removed when off); AC-LINK-01, AC-LINK-09 |
| 6 | `ToolChatLLM`, `answerSchema` | Fixed in CONTRACTS §1.1 (D10 item below) |
| 7 | Leadership and POST routes | Fixed. SPEC-auth §4.1 row and a §4.2 note: no route that writes is open to `leadership`; `POST /api/assistant` is the one read-only POST |
| 8 | What "checked" means | Fixed. §5.16 "What checked means" paragraph; REQ-ASK-04: never labelled "verified" or "correct"; AC-ASK-04 |
| 9 | AC-ASK-07 "no Gmail call" | Fixed. AC-ASK-07 now says source scan plus table counts, not a runtime spy (matches the test) |
| 10 | AC-SEC-LINK-09 first half not runnable | Fixed. AC now tests the allow-list and "mint only inside `send_reply`"; the SEC-06 auto-reply task **MUST** add the auto-reply case when it is built |
| 11 | Fixtures in AC-LINK-02 and -04 | Fixed to the fixtures (dataset untouched): AC-LINK-02 → fixture 21; AC-LINK-04 → fixture 34 (C190) confirmed as 400 S Orange Ave, Orlando, FL 32801 (the recorded C190 reply) after the second Confirm |
| 12 | In-memory rate limits | Fixed. "Rate limit scope" paragraphs in §5.16 and §5.17: per process, correct for one instance, shared store before scale-out |
| 13 | Lifetime arithmetic and DST | Fixed, picked one: durations are elapsed time on instants (UTC); the 08:00 cut-off is turned into an instant with the IANA zone's DST rules. SEC-LINK-02 and a DST example in AC-SEC-LINK-02. Zone still `[HALCYON_TIMEZONE]`, `America/New_York` until Q-LINK-03. **Changes A16** (plan used wall-clock minutes) |
| 14 | Re-seeding | Fixed. REQ-LINK-05 and AC-LINK-05: the seed replaces only `source = 'seed'` rows; CONTRACTS §5 says the seed owns only those |

## D10 as built (§5.16, CONTRACTS)
- CONTRACTS §1.1: `ToolChatMessage`, `ToolChatRequest.answerSchema`, `ToolChatLLM extends LLM` (`LLM` unchanged),
  `createLLM()` returns it; recording key = kind `tool` + system + `{ messages, tools, answer schema }`;
  `AssistantRequest` history limits; `checked` comment. §6 `POST /api/assistant`: Router calls it; 400 `invalid`; 503
  on a tool failure.
- §5.16: "Where it shows" table (dock on every screen but Overview; Router sends typed follow-ups; chips and plan stay
  code-built; flag off = Router unchanged); steps 1, 4–7; figure check (K/M/B, rate rounding, question numbers do not
  count); wording rules; history and answer limits; rate limit scope.
- **REQ-ASK-04 decision:** a figure counts only if it is in a tool result or a tool's arguments; a number only in the
  question does not. **Code must change** (`answer.ts` passes `input.question`); follow-up added at the end of the C plan.

## New or changed ids
- New: REQ-ASK-11 / AC-ASK-11 (wording rules in the prompt), REQ-ASK-12 / AC-ASK-12 (failure → 503).
- Changed in SPEC: REQ-ASK-01, -04, -08, -10; NFR-ASK-02; SEC-ASK-01, -06; AC-ASK-01, -04, -07, -08, -10;
  AC-NFR-ASK-02; AC-SEC-ASK-01, -06. REQ-LINK-01, -05, -08, -09; SEC-LINK-01, -02, -08; AC-LINK-01, -02, -04, -05, -08,
  -09; AC-SEC-LINK-01, -02, -08, -09.
- Changed in SPEC-auth (v0.4): SEC-AUTH-02, NFR-AUTH-04, AC-NFR-AUTH-04; Q-AUTH-06 answered.
- Script check: every **MUST** row in SPEC.md and SPEC-auth.md has an AC with the same suffix.

## Output
- `docs/SPEC.md` v0.12 (change note; §3, §4.4, §5.7, §5.16, §5.17, §12, §13, §14.1 three rows, §16).
- `docs/CONTRACTS.md` §1.1, §5, §6, §7.
- `docs/SPEC-auth.md` v0.4 (§4.1, §4.2, §5.5, §7.3, §7.2, §8, §9.1, §9.2, §13).
- One pointer each: end of the C plan (REQ-ASK-04 code follow-up), E19 banner of the A plan (rules changed for A16–A20).
- Not touched: C13 lines of the C plan (branch `C13-e2e-sign-in` edits them; avoids a conflict), CLAUDE.md, code.

## Open §12 questions that need a team answer
- Q-LINK-02 (narrowed): who sets up the Maps account for SAS (identity, role, `listSas`). Ask the Azure admin.
- Q-LINK-03: margin, floor and time zone. Q-LINK-04, -05, -06 unchanged. Q-ASK-03, -04 unchanged.
- Q-AUTH-01 to -05 unchanged. Q-AUTH-06 answered with its default (revisit before real data).

## Handed to
- `planner`: C plan, the REQ-ASK-04 follow-up (drop the question from the figure sources; tests named AC-ASK-04, -11,
  -12). A plan, update A16 Steps 2–3 (instant arithmetic, DST example), A17/A18 (SAS only, `AZURE_MAPS_SAS_PRINCIPAL_ID`,
  operator-edit and flag-off cases, thread revocation tests), A18 Step 3 fixtures 21 and 34, A20 Steps 1 and 3 settings.
- Email owner (A): fixtures 08, 12, 15, 17, 22, 28 and 47 are gold `ALL_CLEAR` with `Medium` map recordings, which
  REQ-INT-09 decides as `CONFIRM_ADDRESS`; check the extraction eval (AC-INT-04/05) compares what you expect.
- `network-security-auditor`: SEC-LINK-01 log controls and the SAS credential (L2, L7) before A20.
- Note: SPEC-auth v0.4 describes `cd.yml` as on branch `C13-e2e-sign-in` (2 commits ahead of `main`); merge that branch
  with or before this spec change.

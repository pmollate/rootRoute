# spec-writer · in-app assistant (D10) and address link (E19) · 2026-10-29

**Asked by:** Priyank (resource C) · **Branch / commit:** `spec-assistant-magic-link` from `main` be3894b (nothing committed)
**Request:** Specify two features decided on 29 Oct, both built after the code submission behind flags: an in-app
"Ask LateLens" assistant that routes questions to the MCP server's read-only tools, and a one-time address link with a
map pin in `CONFIRM_ADDRESS` replies.

## What it did
- Read CLAUDE.md; SPEC §3, §4.2, §4.4, §5.3, §5.14, §6–§8, §12–§16; SPEC-auth §2, §4.2, §4.4, §6, §7, §8, §13;
  SPEC-email-address-resolution §5.10, §7, §9–§10; CONTRACTS.md; both 29 Oct auditor records (PC-01 to -19, NS-01 to -13).
- Read code: `modules/mcp/{server,routes}.ts` (six read-only tools), `modules/intake/{decide,reply,address}.ts`,
  `core/llm/{azureOpenai,types,recorded}.ts` (no tool-calling method; `store: true` on every call),
  `core/permissions.ts`, `core/maps/types.ts`, `frontend/middleware.ts`, `frontend/lib/auth/proxy.ts` (401 for any call
  without a session when `AUTH_REQUIRED=on`, so the link routes need an explicit proxy exception), migrations 001, 100, 101.
- Chose to reuse `saved_addresses` (migration 100) with new columns instead of a new `client_addresses` table.
- Checked: 42 new ids, each with its AC (script over SPEC.md); no table in the three files changes column count.

## Output
- `docs/SPEC.md` v0.11: change note; §3 rows D10, E19 and an "after submission" note; §4.2 `address_confirm_tokens`;
  §4.4 agents row and "tools come from one registry" rule; §5.3 step 14 and REQ-INT-09 (link-confirmed address counts as
  verified); §5.7 panel and link states; §5.14 shared registry note; new §5.16 (D10) and §5.17 (E19, with threat model
  L1–L11); §6; §7; §8 pointer; §10.1; §12 Q-ASK-01 to -04, Q-LINK-01 to -06; §12.1 SD-04; §13; §14.1 two rows.
- New ids: REQ-ASK-01 to -10, NFR-ASK-01 to -03, SEC-ASK-01 to -06, REQ-LINK-01 to -11, NFR-LINK-01, SEC-LINK-01 to -11,
  with AC-ASK-*, AC-NFR-ASK-*, AC-SEC-ASK-*, AC-LINK-*, AC-NFR-LINK-01, AC-SEC-LINK-*. Changed: REQ-INT-09.
- `docs/CONTRACTS.md`: §1.1 types (`ToolDef` registry, `LLM.toolChat`, `AssistantRequest/Answer`, `LinkView`,
  `MapReading`, `LinkState`); §5 migration 102 (`address_confirm_tokens`, `saved_addresses` columns); §6 routes
  `POST /api/assistant`, `GET`/`POST /api/confirm/:token` and additions to the intake routes; §7 env vars; §8 folders.
- `docs/SPEC-auth.md` v0.3: §4.2 and §4.4 rows; REQ-AUTH-01, -04 and AC-AUTH-04 exempt `/confirm/*`; threats T14, T15.
- Design settings stated as such, not data: 5 tool calls, 10 questions/min/user, 500 characters, 6 history messages,
  20 s p95; link 24 h, cut-off margin 2 h, 1 h floor, 500 m, 10 requests/min/IP, 20 map look-ups per link.
- Not changed: §16 (both features are after submission, so no Level 1 evidence changes); CLAUDE.md (Q-ASK-01 instead).

## Handed to
- Team: Q-ASK-01 (widen the CLAUDE.md AI rule) before any D10 work; Q-ASK-03 (tools by role).
- Email owner (A): Q-LINK-01 (agree to E19 in A's folders, and who builds it), Q-LINK-04, Q-LINK-05; review the
  `LLM.toolChat` change to P3 and migration 102.
- `planner`: tasks for D10 (registry refactor of `mcp/server.ts`, `LLM.toolChat` for azure-openai and recorded with
  `store: false`, `modules/assistant`, figure check, rate limit, `permissions.ts` entry, panel in `DashboardShell.tsx`,
  recordings and the out-of-scope fixture set) and E19 (migration 102, `intake/link.ts`, draft placeholder and
  `send_reply` minting, re-decide on confirm, approve writes `saved_addresses`, `/confirm/[token]` page, middleware open
  list, proxy exception, web rate limit, headers, Maps tile credential, read-time expiry in `GET /api/intake`).
- `network-security-auditor`: review threat model L1–L11 and T14/T15 before either flag goes on in Azure.

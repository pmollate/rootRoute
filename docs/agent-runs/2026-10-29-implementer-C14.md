# Implementer run: Task C14 (D10 part 1: one tool registry; `LLM.toolChat` with `store: false`)

- **Date:** 2026-10-29 · **Asked by:** Priyank (resource C) · **Branch:** `C14-tool-registry` (from `spec-assistant-magic-link`, 30e7f3b)
- **Plan:** `docs/superpowers/plans/2026-10-26-latelens-C-carriers.md`, Task C14 (all 10 steps ticked). Q-ASK-01 answered yes (29 Oct).
- **REQ:** REQ-ASK-02, REQ-ASK-10, SEC-ASK-03, SEC-ASK-04, REQ-MCP-01

## Files
- Created: `backend/api/src/modules/mcp/tools.ts` (registry: `TOOLS`, `TOOL_NAMES`, `ToolName`, `ToolDef`, `toolByName`, `toolParameters`)
- Modified: `backend/api/src/modules/mcp/server.ts` (registers from `TOOLS`; `mcpAuth` unchanged),
  `backend/api/src/core/llm/{types,azureOpenai,recorded,index}.ts`, `backend/api/src/core/recordings.ts` (`'tool'` kind)
- Tests: `backend/api/test/assistant/tools.test.ts`, `backend/api/test/assistant/llm-tools.test.ts`,
  `backend/api/test/routes/assistant-tools.test.ts`

## Tests added
| Test | AC |
|---|---|
| tools.test: MCP lists the registry (names, descriptions, input schema keys and required) | AC-ASK-02 |
| tools.test: every registry tool is read-only, six tools | AC-ASK-07 (registry half) |
| llm-tools.test: Azure request has `store: false`, tools, no `metadata`; tool calls returned raw | AC-SEC-ASK-03 (request half) |
| llm-tools.test: final turn returns content | (REQ-ASK-10 support) |
| llm-tools.test: RecordingLLM saves a turn, RecordedLLM replays it twice identically, unseen prompt -> `missing_recording` | AC-ASK-10 (replay half) |
| routes/assistant-tools.test: every tool and enum value, no personal key, no email address in output | AC-SEC-ASK-04 (needs test DB) |

## Commands and results
- Step 2 `npm --prefix backend/api test -- test/assistant/tools.test.ts`: FAIL, cannot resolve `mcp/tools.js` (expected).
- Step 5 `... test/assistant/tools.test.ts test/mcp.test.ts test/routes/mcp.test.ts`: 7 passed, 4 skipped (routes/mcp, no DB).
- Step 6 `... test/assistant/llm-tools.test.ts`: 3 failed, `llm.toolChat is not a function` (expected).
- After Step 7 `... test/assistant test/llm.test.ts`: 12 passed.
- Full `npm --prefix backend/api test`: 27 files passed, 13 skipped; 308 tests passed, 36 skipped, 0 failed.
- `npm run typecheck` (frontend tsc + backend tsc): exit 0.
- An extra one-off tsc that also included `test/llm.test.ts`, `test/assistant`, `test/mcp.test.ts` and `test/routes/mcp.test.ts` (tests are outside `tsconfig.json`): 0 errors after deviation 2.
- Frontend not touched; frontend tests not run.

## Deviations from the plan
1. `FinalAnswer` is inlined in `llm-tools.test.ts` (as the plan allows until C15). C15 Step 5 switches it to the import from `modules/assistant/answer.ts`.
2. `RecordingLLM`'s constructor takes `inner: LLM | ToolChatLLM`, not `ToolChatLLM`. Its `toolChat` throws
   `LLMError(..., 'transport')` if the wrapped model has none. Why: narrowing to `ToolChatLLM` gave 4 TS2741 errors in
   the existing `test/llm.test.ts`, whose plain `LLM` fakes have no `toolChat`. Root typecheck missed them because it
   skips `test/`. This keeps the plan's own aim that plain `LLM` stand-ins need no change.
3. Not a code deviation: the plan calls `toolChat` a P3 (A's model layer) change. It is limited to adding types to
   `types.ts`, one method on `AzureOpenAILLM`, `toolChat` on `RecordedLLM` and `RecordingLLM`, `createLLM()`'s return
   type, and a `'tool'` `RecordingKind`. Intake calls (`json`/`text`, `store: true`) are unchanged. A should review.

## Left for the reviewer / C15
- **The DB test has not run.** No Postgres server is installed on this machine and Docker isn't running, so
  `routes/assistant-tools.test.ts` (AC-SEC-ASK-04) and `routes/mcp.test.ts` were skipped. A static check found no
  personal keys in the `overview`/`causes`/`replay`/`recommendFromLane` outputs. A direct run of `check_promise`
  returned only `promiseDate, commitment, downgraded, reason`. Run with the test DB before merging.
- In MCP, `overview` has no input shape, so the SDK passes `extra` as the first handler argument. The registry handler
  ignores its args, so this is harmless, same as on `main`.
- C15: switch the `FinalAnswer` import; build `/api/assistant` on `TOOLS`, `toolByName`, `toolParameters` and `createLLM().toolChat`.
- CONTRACTS §1.1 deviation (`ToolChatLLM` sub-interface, optional `answerSchema`) is for `spec-writer`, as the plan notes.

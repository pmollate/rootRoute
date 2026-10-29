# Reviewer run: `C14-tool-registry` (Task C14, D10 part 1)

- **Date:** 2026-10-29 · **Branch:** `C14-tool-registry` (01e14a3 on top of the spec/plan commit 30e7f3b)
- **Reviewed:** `git diff 30e7f3b..01e14a3` against plan Task C14 (C plan), SPEC §5.14 and §5.16 (REQ-ASK-02, -10,
  SEC-ASK-03, -04), CONTRACTS §1.1, and the implementer's record `2026-10-29-implementer-C14.md`.
- **Verdict: approve.** I found no blocking issue. The findings below are low severity: two small robustness gaps in
  `toolChat` and its recordings, plus some test-strength and doc points. C15 can pick them up, or they can be fixed
  before merge.

## Tests
- Touched tests (`test/assistant`, `test/mcp.test.ts`, `test/llm.test.ts`, `test/routes/mcp.test.ts`,
  `test/routes/assistant-tools.test.ts`): **22 passed, 0 skipped**. A test database was available on this machine, so the
  DB tests the implementer could not run did run here, and they passed. That includes **AC-SEC-ASK-04** (every tool
  with every enum value; no personal key and no email pattern) and all 4 `routes/mcp` tests (AC-MCP-02/03, scenario
  figures 71.0 / 85.9 / 92.0%, no `recommendations` row written).
- Full `backend/api` suite: 40 files, 344 tests. 2 to 7 tests fail, and the count changes from run to run. The failures
  are in `routes/intake`, `routes/permissions` and `routes/review`. **These failures are not caused by this branch.**
  The same tests fail the same way on a clean export of the base 30e7f3b (`ALL_CLEAR` undefined, 409/500 instead of
  403/400). That points to the local test-DB or provider environment. The A and B owners should look at them.
- Root `npm run typecheck`: exit 0. A separate tsc run that also checks the touched test files (root tsconfig skips
  `test/`) also gave exit 0.
- **MCP regression check:** I ran `tools/list` from `buildMcpServer()` on base and on branch. The two outputs are
  **byte-identical**: the same six names, titles, descriptions, input schemas and read-only annotations. `mcpAuth` and the
  route are untouched.
- The branch merges cleanly into the current `origin/main` (3bbede2). Note that 30e7f3b is not on `main` yet, so this
  PR also carries the spec commit unless that commit merges first.

## Checks that passed
- The registry is the single source. `server.ts` registers only from `TOOLS`, and the handler bodies match `main`
  line for line. `recommendFromLane` is still used, not `recommendCarrier`, so no tool writes a row.
- `toolChat` sends `store: false` and no `metadata` (the test checks both). Message mapping is correct: system first,
  `tool` → `tool_call_id`, assistant tool calls → `tool_calls` with `type: 'function'`, and the content is null when empty.
  Error kinds match `complete()`: content filter → `refusal`, model refusal → `refusal`, `length` → `invalid`,
  anything else → `transport`.
- The intake `json`/`text` paths are unchanged. Only the import line and the `implements` clause changed, and
  `llm.test.ts` passes.
- Recordings use their own `'tool'` kind inside the hash, so they cannot collide with `json`/`text` entries. The key covers
  system + messages + tools. Refusal and invalid errors are replayed, and transport errors are not saved, as for the
  intake.
- The `core/llm` change (A's P3 area) is small and additive: new types, one method per class, the return type of
  `createLLM()`, and one `RecordingKind`. A's review is still needed, as the plan says.
- No secrets, no `.env`, no `NEXT_PUBLIC_` use. No figures are invented. Tests name their AC ids. The commit names the
  REQ.

## Findings (most severe first; all low)

1. **`backend/api/src/core/llm/recorded.ts:31`: a bad recording throws a raw `SyntaxError`, not an `LLMError`.**
   `toolChat` calls `JSON.parse` on the saved text and does not check its shape. The `json` path, by contrast, goes
   through `parseJson`, which maps bad JSON to `LLMError('invalid')`.
   *Scenario:* a recording is hand-edited or truncated, or was saved by an older format. C15's route maps `LLMError`
   kinds to 503 `assistant_unavailable`. A plain `SyntaxError` misses that mapping and becomes a 500 or a generic error.
   *Fix:* wrap the parse and check the turn's shape (a small zod schema for `ToolChatTurn`), throwing
   `LLMError(..., 'invalid')` on failure.

2. **`backend/api/src/core/llm/recorded.ts:7`: the recording key leaves out `answerSchema`.** CONTRACTS §1.1 says the
   key is "a hash of the whole request".
   *Scenario:* C15 changes `FinalAnswer`, for example by adding `citations`. The live model would now get a different
   `response_format`, but replay still finds the old final turn under the same key. The test then fails later on the
   caller's schema check, instead of failing as `missing_recording` the way AC-ASK-10 expects for a changed prompt.
   *Fix:* add `answer: req.answerSchema ? z.toJSONSchema(req.answerSchema) : null` to `toolChatKey`. Or, if the
   current key is intended, record the narrower key in CONTRACTS.

3. **`backend/api/src/modules/mcp/tools.ts:18,30`: "validated before run" is a comment, not a guarantee.** `tool()`
   erases the per-tool types with `as unknown as ToolDef`, and `run` does no parsing of its own. On the MCP path the SDK
   validates the arguments. On the assistant path nothing does yet.
   *Scenario:* C15 calls `toolByName(c.name)!.run(JSON.parse(c.arguments))` directly. Then `region: "Mars"` reaches
   `laneRows` and `recommendFromLane`, which throw "fewer than 2 carriers", and AC-ASK-03 fails.
   *Fix (for C15, or now):* export one `runTool(t, raw)` that does `z.object(t.input).safeParse` first and returns a
   "skipped" result on failure. The assistant then uses only that function.

4. **`backend/api/src/core/llm/azureOpenai.ts:56-67`: two malformed-input edges end up as `transport` errors.**
   (a) `tools: []` is sent as an empty array, and the OpenAI API rejects that with a 400. This would happen, for
   example, if Q-ASK-03 left some role with no tools. (b) A `tool` message without `toolCallId` is sent with
   `tool_call_id: ''`, which also gets a 400.
   *Fix:* leave `tools` out when the list is empty, and throw `LLMError('tool message without toolCallId', 'invalid')`
   instead of sending `''`. Typing `ToolChatMessage` as a discriminated union would also do it.

5. **`backend/api/src/core/llm/azureOpenai.ts:8-9`: the class doc comment is now false.** It still says "Every call is
   kept as a stored completion". `toolChat` deliberately is not. That statement is about a privacy property
   (SEC-ASK-03 / PC-04), so it is worth correcting: "Intake calls (`json`/`text`) are stored completions; `toolChat`
   is not."

6. **`backend/api/test/assistant/tools.test.ts:22,28-29`: the tests are weaker than their AC names claim.**
   - AC-ASK-02 compares MCP's listing with `toolParameters()`, which comes from the same zod shape. It checks only the
     property *keys* and `required`, not the types or enum values. It would not catch a description or enum drifting
     away from `main`. (I checked `main` vs branch by hand: identical.)
   - The AC-ASK-07 check `t.readOnly === true` asserts a literal type, so it can never fail.

   *Fix:* compare the full `inputSchema` with `toolParameters(t)`, minus `$schema`, or keep an inline snapshot of
   `tools/list`. The "no table changes" half of AC-ASK-07 belongs to C15, as the record says.

7. **`backend/api/test/routes/assistant-tools.test.ts:6,10`: the segment lists are hard-coded.** If B adds a segment
   to `q.SEGMENTS` or `q.REPLAY_SEGMENTS`, this AC-SEC-ASK-04 scan silently skips it.
   *Fix:* import `SEGMENTS` and `REPLAY_SEGMENTS` from `warehouse/queries.js`, and read the region and commitment enums
   from the tool shapes.

## Notes (no action needed on this branch)
- `RecordingLLM` accepts `LLM | ToolChatLLM` (implementer deviation 2) and throws `transport` if the inner model has no
  `toolChat`. That is reasonable. `createLLM()` always wraps `AzureOpenAILLM`, so production can never reach that
  branch.
- The transport error message passes the raw SDK or server text through, the same as the intake does. C15 must show the
  fixed "assistant unavailable" message on the dashboard, never `err.message`.
- `RECORD=1` writes final answers to `test/recordings/`. That is fine for development. It should never be set in a
  deployed environment (SEC-ASK-03 "no saved answers").
- `spec-writer` still needs to update CONTRACTS §1.1: the `ToolChatLLM` sub-interface, the optional `answerSchema`,
  and the key definition (see finding 2).

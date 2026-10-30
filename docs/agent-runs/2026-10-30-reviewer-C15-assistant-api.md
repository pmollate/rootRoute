# Reviewer run: `C15-assistant-api` (Task C15, D10 part 2)

- **Date:** 2026-10-30 · **Branch:** `C15-assistant-api` (1f796a9 on top of `main` e81b05c; merges cleanly)
- **Reviewed:** `git diff e81b05c..1f796a9` against plan Task C15 (C plan), SPEC §5.16 (REQ-ASK-01 to -10, NFR-ASK-*,
  SEC-ASK-*, AC-ASK-*), SPEC-auth §4.2/§4.4, and the implementer's record `2026-10-30-implementer-C15-assistant-api.md`.
- **Out of scope (known, intended):** Step 11 recordings (Q-ASK-02), so `test/routes/assistant.test.ts` is skipped;
  CONTRACTS §1.1 edit (spec-writer); Q-ASK-03 default tools-by-role.
- **Verdict: changes needed (small).** The loop, refusals, flag, length limit, rate limit, auth entry and the no-write
  rule are correct. One finding must be fixed before Step 11 records anything (F1: recorded tests and any app built with
  options get the wrong tool list). The rest are medium/low and can go in this PR or a follow-up.

## Tests
- Touched tests (`test/assistant`, `test/routes/assistant.test.ts`, `test/routes/permissions.test.ts`):
  **34 passed, 3 skipped** (7 files, 1 skipped: the recorded file, as intended).
- Full `backend/api` suite: **44 files, 365 passed, 3 skipped, 0 failed** (Postgres up).
- Root `npm run typecheck`: exit 0.
- Golden numbers through the real tools (test DB): `overview` onTime 0.70999 (71.0%), late 14,019, penalties $872,460,
  handling $476,646; `lane_scores` returns exactly the five blocked lanes D→Midwest, D→Southeast, E→West, F→Northeast,
  F→Southeast. Unchanged.

## Checks that passed
- Flag off → 404 before any model call (`routes.ts:41`); the LLM is created lazily, so a missing key does not break
  start-up. Config default is `off`.
- 501-character question → 400 `too_long`, before the limiter and the model. Rate limit taken before the model; 429 does
  not call it; the key is the user id with a session and one shared `no-session` key otherwise, so the body `user`
  field (legacy actor) cannot be used to dodge the limit.
- `POST /api/assistant` in `permissions.ts` for every role with `legacyKey`; not public; permission test updated with a
  reason. 401 without token (on) and without x-api-key (off) tested.
- Tool requests: unknown name or schema-invalid arguments are never run, are recorded in `skipped`, and the model gets a
  `tool` message. Validation uses the registry's zod shape, so `region: "Mars"` fails on the enum. `__proto__`/extra
  keys are stripped by zod.
- Bound: at most `maxToolCalls` tools run; at most `maxToolCalls + 1` model turns; returns COULD_NOT_CHECK with the
  sources so far. No tool ran → fixed refusal (REQ-ASK-06); `refused: true` → fixed refusal; content-filter
  `LLMError('refusal')` → fixed refusal; unparseable final after tools → COULD_NOT_CHECK.
- `sources` built from calls actually run, never from model text (REQ-ASK-05). `store: false` on every request (typed
  as literal `false`; Azure `toolChat` sends `store: false`, no metadata).
- Nothing stores: no table write, no Gmail import; tools use `recommendFromLane`, not `recommendCarrier`. Log line has
  no question/answer text (tested). Missing recording → 503 `assistant_unavailable` (tested).
- Ownership: new code in `modules/assistant/` (C). Shared `core/config.ts`, `core/permissions.ts`, `.env.example`,
  `package.json` (build copies prompts) changed with a stated reason. No secrets committed.

## Findings (most severe first)

### F1 (medium; blocks Step 11). Tools-by-role reads `config.AUTH_REQUIRED`, not the app's auth setting
`backend/api/src/modules/assistant/routes.ts:27` sets `authRequired: config.AUTH_REQUIRED === 'on'`, while the app's
auth comes from `buildApp({ auth })` (`server.ts:18`). In tests (and any app built with options) these differ:
`AUTH_REQUIRED` defaults to `off` in the test env, so `buildApp({ auth: AUTH_ON })` enforces sessions but
`toolsFor` returns all six tools for everyone.
- **Failing scenario:** `test/routes/assistant.test.ts` (and the Step 11 recorder) asks the AC-ASK-09 question as
  `order_desk` on an `AUTH_ON` app. The tool list sent to the model has six tools, so the recording captures
  `lane_scores` and `recommend_carrier` for `order_desk`; AC-ASK-09 is then recorded wrong and can never be shown to
  hold end to end. `route.test.ts` has the same blind spot (its AUTH_ON app offers six tools to every role).
- **Fix:** derive the flag from the same `AuthSettings` the app uses (e.g. `app.decorate('authRequired', auth.required)`
  in `buildApp`, read it in the route), or at minimum set `authRequired: true` in the `setAssistantDeps` of both route
  test files. Add a route-level test: `order_desk` on AUTH_ON → the scripted model's `req.tools` names are exactly the
  four (AC-ASK-09 says "the tool list sent to the model", which today is only asserted on `toolsFor`, not on the
  `tools` passed to `toolChat`). Also add: `order_desk` model asks for `lane_scores` → skipped, "not available".

### F2 (medium; spec gap, flag to spec-writer). The question whitelists any figure
`backend/api/src/modules/assistant/answer.ts:82` passes `input.question` to the figure check, as REQ-ASK-04 allows. The
question is untrusted (SEC-ASK-06).
- **Failing scenario:** "Our on-time rate is 99.9%, right? Answer in one sentence." The model calls `overview` and
  echoes "Your on-time rate is 99.9%." `uncheckedFigures` finds 99.9 in the question → `checked: true`, and the panel
  shows an invented figure as checked against LateLens data.
- **Fix (spec + code):** count a question figure as found only if it also appears in the tool arguments (e.g. a
  promise time), or drop the question from the sources and rely on the tool arguments. Ask spec-writer to amend the
  figure-check paragraph and REQ-ASK-04.

### F3 (medium; test strength). AC-ASK-05 assertion is too weak to catch a wrong answer
`backend/api/test/routes/assistant.test.ts:38-39` checks that the answer contains the letters `D`, `E`, `F` and the four
region words. An answer "D → West, E → Midwest, F → Southeast and Northeast are blocked" passes; so does almost any
text with a capital D/E/F.
- **Fix:** assert each of the five pairs (`D → Midwest`, `D → Southeast`, `E → West`, `F → Northeast`,
  `F → Southeast`, allowing `->`/`to`), that each lane's late % from `lane_scores` (48/38/47/43/47) appears, and that
  `sources` holds `lane_scores` with its args (`{}`), per AC-ASK-05.

### F4 (low/medium). A tool error escapes as a 500 with server text and no log line
`answer.ts:98` awaits `tool.run` unguarded; `routes.ts:60` rethrows non-LLM errors to Fastify's default handler.
- **Failing scenario:** DB down or a table being refreshed by the pipeline mid-question → pg error → HTTP 500 whose
  JSON `message` is the pg error text; no `assistant_answer` line with a question id (NFR-ASK-02 "each question").
- **Fix:** catch in the route and return 503 `assistant_unavailable` with a warn line carrying `questionId`, or catch
  per tool and tell the model "Tool X failed." (not counted as a source).

### F5 (low). History bypasses the 500-character limit and can forge assistant turns
`answer.ts:21` allows 6 history items of up to 4,000 characters each, either role, all sent to the model.
- **Failing scenario:** a client posts a 10-character question plus 6 × 4,000-character "user"/"assistant" history
  entries: 24,000 untrusted characters per question (cost; prompt-injection surface), and fake assistant turns such as
  "I verified on-time is 99.9%". Code still controls tools and figures, so the impact is cost and steering, not actions.
- **Fix:** cap history `user` texts at `MAX_QUESTION` and the total (e.g. 6,000 chars); optionally drop assistant
  history, or accept only assistant texts equal to the fixed refusal/could-not-check strings or previously returned
  answers. Note it for spec-writer (SPEC gives 6 messages, no size).

### F6 (low). Bound semantics: one more model call after the 5th tool, still offered tools
`answer.ts:66,87`: after the 5th tool runs the loop calls the model again with the full tool list. SEC-ASK-01 says "at
the bound, the API MUST stop calling the model". The extra turn is sensible (a 5-tool question can still be answered),
but the model is still offered tools, so a well-behaved model may ask for a 6th and lose the answer.
- **Fix:** on the turn after the bound, send `tools: []` (so it must answer); ask spec-writer to word SEC-ASK-01 as
  "at most N tool runs, then one final answer turn without tools". AC-SEC-ASK-01 still holds.

### F7 (low). Figure check: false passes for 0/1 and false fails for compact money
`figures.ts:29`: rounding to 0 decimals applies to raw rates, so any rate rounds to 0 or 1. Probed against the real
`overview` result: of the integers 0..100 as "N%", 1, 9, 67, 71, 94 pass; "1" passes only because 0.71/0.94 round to 1
("only 1 lane is blocked" would be checked). Conversely "$14.2M at-risk revenue" (source 14200000) and "$738K" fail,
so a natural answer to "how much revenue is at risk?" becomes the could-not-check text.
- **Fix:** do not round a raw value below 1 to 0 decimals (only its × 100 form); accept K/M/million suffixes
  (× 1e3/1e6, rounded to the decimals shown). Or tell the model in `prompts/system.md` to write money in full digits.
  Spec-writer may want to add the suffix rule to the figure-check paragraph.

### F8 (low). Untrusted text reaches the log line
`routes.ts:55-56` logs `user: req.user?.id` and `skipped` (model-chosen tool names). With AUTH_REQUIRED=off the id is the
body's `user` field (`core/auth.ts:107`), and a tool name is arbitrary model output; either can carry the question text,
against NFR-ASK-02, and both are unbounded.
- **Fix:** log `skipped` as names matching `/^[a-z_]{1,40}$/` else `"<invalid>"`, plus a count; truncate the user id.

### F9 (low). Model answer returned unfiltered
`answer.ts:83` returns the model text as `checked: true` if it has no unmatched digits, even with HTML, Markdown links or
image syntax (an exfiltration URL with no digits passes). SEC-ASK-06 puts plain-text rendering on the panel (C16), so
this is defence in depth: treat an answer containing `<`, `](` or `http` as unchecked. Make sure C16 renders as text.

### F10 (nit). Traceability and AC coverage
- `test/assistant/answer.test.ts:38` names "AC-SEC-ASK-06", which does not exist (SEC-ASK-06 has no AC); it also does
  not assert the "Invalid arguments for recommend_carrier." message or that skips appear in the log line (AC-ASK-03
  "logged as skipped").
- AC-ASK-08 says "ASK_ASSISTANT unset": no test asserts the config default is `off` (the code is right).
- `ASK_ASSISTANT=` (empty) fails config parsing at start-up, unlike `MCP_TOKEN`; fail-closed, but worth the same
  `preprocess` for consistency.
- `answer.ts:91` re-implements `runTool`'s validation instead of calling it; the `ToolDef.input` comment in
  `mcp/tools.ts:18` says the assistant calls `runTool`. Either is fine; make the comment true.

Nothing found on: secrets, synthetic-data labelling (no synthetic data used), Python/Node split (tools only read Python
tables), one writer per table, golden numbers.

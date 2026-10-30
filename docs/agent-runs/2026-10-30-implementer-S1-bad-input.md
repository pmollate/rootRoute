# implementer · S1: bad input and edge cases (jury scorecard 1.2, 2.2) · 2026-10-30

**Task:** S1, given by the coordinator (not in a plan file, so there are no plan steps to tick). It covers jury
scorecard 2.2: empty, malformed, oversized and missing-field input all get clear messages, never a crash or a silently
wrong result. It also covers 1.2: every edge case listed is handled or tested. **Branch:** `S1-bad-input-and-edge-cases`,
cut from `main` a667cff, in the worktree `agent-aacae2a380c2f5298`. Not pushed; no PR. **REQ:** REQ-INT-16, -17, -18,
-19 (new), NFR-02, REQ-INT-09 (EC-09), REQ-LINK-07 / -09 (EC-20).

## Tests added (each run red first for the expected reason)
| File | Tests | ACs |
|---|---|---|
| `backend/api/test/routes/intake-input.test.ts` (new, test DB) | 15 | **AC-INT-16**: an empty body and a whitespace-only body both give 400 `{ error: "The email body is empty.", fields }` and nothing is stored. A valid body with surrounding blank lines is processed and stored unchanged. **AC-INT-17**: each missing field is named in one message. A subject of the wrong type is refused. Four malformed `from` values, six malformed or impossible `receivedAt` values (incl. 30 Feb and 24:00), a non-numeric `inReplyTo`, and a non-object JSON body (`[]`, `"hello"`, `null`, plain text) are each refused. `GET /api/intake` returns `limits`. **AC-INT-18**: a body, subject or `from` over its limit gives 400 naming the limit. A request over 1 MB gives 413 as JSON (not Fastify's default). Broken or empty JSON gives 400. A form-encoded request gives 415. The action and fetch bodies use the same shape. |
| `backend/api/test/intake/decision-time.test.ts` (new, test DB) | 1 | **AC-NFR-02**: each of the 50 fixtures runs through `processEmail` (store → PII → extract → address/map → decide → promise → warehouse → carrier → reply draft → save) with the recorded PII, model and map. Each must reach a decision (not WAITING) in under 30 s, and at least 48 of 50 must match gold. Prints p50, p95 and max. |
| `frontend/components/dashboard/intake/IntakeScreen.test.tsx` | +5 | **AC-INT-19**: the API's 400 sentence shows in an alert inside the form. The field is marked `aria-invalid` until it is edited, and the typed body is kept. A 413 shows the API sentence. A 500 stays generic and shows no server text. Process email is disabled for an empty or whitespace-only body. The counter reads "20 / 1,000 characters"; at 1,001 the form says the body is too long, disables sending and makes no call. |

Why each test failed first: the API ones got raw zod JSON or Fastify's `{statusCode, error, message}`, 200 for a
whitespace body or `not-an-email`, and `undefined` config limits. The frontend ones found no alert, no counter and no
form role. `decision-time` passed on its first run: it adds a test for behaviour that already existed.

## Commands and results (from the worktree)
- `npm --prefix backend/api test`: before **50 files, 450** (the first full run after the API change was 465 with my 15 new tests). After: **52 files, 466 passed** (+16), 0 failed.
  The worktree first needed `backend/synthetic-data/out/` (gitignored), so I ran `npm run data` with a worktree `.venv`
  (`requirements.txt`). That changed no tracked file, and the fixtures are byte-identical.
- `npm --prefix frontend test`: before 114 (119 minus my 5), after **18 files, 119 passed**.
- `npm run typecheck`: exit 0 (frontend `tsc` and API `lint`).
- `PATH="$PWD/.venv/bin:$PATH" npm run test:py`: **71 passed, 2 skipped** (no Python change).
- AC-NFR-02 output: `decision time over 50 fixtures: p50 0.003 s, p95 0.005 s, max 0.012 s (limit 30 s)`.
- Live check: I started the API on port 3901 against the **test** database (recorded providers, `AUTH_REQUIRED=off`,
  its own key) and ran `npm run send:fixtures`. Result: 50 sent, 50 decided, 49 match the expected decision (fixture 03,
  the injection email refused by the content filter, is `MISSING_INFO`; this is the known A1 miss). Seconds: p50 0.00,
  p95 0.01, max 0.04. `curl` with a whitespace body, a bad `from` + `receivedAt`, broken JSON, a 1.2 MB request and a
  form-encoded request gave the readable 400 / 400 / 400 / 413 / 415 answers. I stopped the server afterwards.
- `npm run pipeline` was not run because no pipeline table is written.

## What changed
- `backend/api/src/modules/intake/input.ts` (new): holds `EmailBody`, `ActionBody` and `FetchBody` with a message for
  each field, `readable(zodError)` → `{ error, fields }`, `isLocalTime`, `FROM_MAX = 320` and `limits()`.
  Whitespace-only counts as empty, but the body is stored as sent so dedupe hashes do not change. `subject` may be left
  out (defaults to `''`).
- `routes.ts`: the three POST bodies use `readable`, and `GET /intake` adds `limits`.
- `server.ts`: `bodyErrors(bodyLimit)`, a root `setErrorHandler`. It maps `FST_ERR_CTP_BODY_TOO_LARGE` (413),
  `INVALID_MEDIA_TYPE` (415), `INVALID_JSON_BODY` / `EMPTY_JSON_BODY` (400) and `INVALID_CONTENT_LENGTH` to
  `{ error, fields: {} }`. Any other error is rethrown to Fastify's default handler, which leaves it unchanged. Before
  this the app had no error handler.
- `core/config.ts` + `.env.example`: `INTAKE_MAX_BODY_CHARS` (default 20000) and `INTAKE_MAX_SUBJECT_CHARS` (default
  300). These are design settings in the same pattern as `ASK_*`.
- `frontend/lib/api.ts`: adds `InputRefused` (an `Error` with `status` and `fields`). It is thrown only for 400/413/415
  answers that carry `{ error: string, fields: object }`; every other error is unchanged.
- `IntakeScreen.tsx` + `intake.module.css`: the paste pane is now a labelled `<form>` (`noValidate`, submit prevented;
  buttons stay `type="button"`). It adds `pasteError` state, an alert inside the form, `aria-invalid` on the refused
  field, and a counter against `limits.bodyChars`. Over the limit it shows a message and disables the button.
  `refusal()` returns an `InputRefused` message as it is.
- `scripts/send-fixture-emails.mjs` + `npm run send:fixtures`: posts the chosen fixtures (HTML fixtures are turned into
  text the way the Gmail reader does) with `API_URL` / `API_KEY` from the shell or `.env`, reading only those two keys.
  It prints a table and a p50/p95/max line, and exits 1 on any HTTP error or when the API does not answer.
- README "Sample input" only: how to run the sender, "Try your own email", and a "Bad inputs to try" table with a curl.
- SPEC v0.14: REQ/AC-INT-16 to -19. §9.4 changes: the EC-09 reason, EC-20 updated for A17, new EC-21 to EC-23, and a
  new summary. CONTRACTS: the error shape, `limits`, and the two settings.

## Deviations
1. **EC-09 not implemented; the reason is recorded in the row.** With the recorded map answers, 7 of the 50 fixtures
   (08, 12, 15, 17, 22, 28, 47) come back `medium` with no issue, and all 7 have gold `ALL_CLEAR`. The specified rule
   would turn 7 confirmed orders into confirmation emails, which is a product decision for the Email owner. It would
   also need four other changes. The SD-02 gold would have to change (the eval and AC-INT-02 read it). REQ-INT-11's
   "partly matched" wording would need new model-draft recordings, which only a live Azure OpenAI run can produce. A
   map-down → WAITING path would mean `validateAddress` throwing, which E4 rules out today. And the tests that rely on
   the format-rule fallback would have to change.
2. **AC numbering:** SPEC's convention is one AC per REQ with the same number, so the four ACs got four REQs
   (REQ-INT-16 to -19) rather than one REQ with several ACs.
3. **`subject` is now optional** (defaults to empty). An email can have no subject, and a missing subject used to be
   refused as a raw zod error.
4. **Plain-text requests are 400, not 415.** Fastify has a built-in `text/plain` parser, so a pasted plain-text request
   reaches the schema and gets "Send the email as a JSON object…". Only a type with no parser (e.g. form-encoded) is 415.
5. `.env.example` is normally devops's file. I changed it because the coordinator asked for the setting there.
6. A small follow-up commit only reflows the README paragraph I added.

## For the reviewer
- **AC-NFR-02 numbers use recorded AI answers.** They time our code and Postgres, not Azure. With recordings every
  reply is the template (no reply recordings match these facts). Live Azure OpenAI, Language and Maps latency comes on
  top; `npm run send:fixtures` against an API with the live providers measures that end to end.
- The 413 handler applies to every route, not only intake. It changes only the parse-error codes listed above.
- `InputRefused` is shown as it is wherever `refusal()` is used. For the action route, that now includes zod messages
  such as "Unknown action." and "The reason is empty.", which are written for users.
- `aria-invalid` on the body is also set when the body is over the local limit.
- Not touched: CI/CD, infra, `Halcyon-Hackathon-Dataset/`, recordings, fixtures, Python.

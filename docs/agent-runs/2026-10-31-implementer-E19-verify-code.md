# implementer · E19 verification code (REQ-LINK-17 to -19, SEC-LINK-12) · 2026-10-31

**Asked by:** nvarada (via the lead agent) · **Branch / commit:** `A20-link-azure`, on 9a6faae
**Request:** Build the emailed 6-digit code before the address page (SPEC §5.17 "Verification code", REQ-LINK-17, -18,
-19, SEC-LINK-12; CONTRACTS rows `POST /api/confirm/:token/code`, `/verify`, setting `CONFIRM_LINK_CODE`). No plan task.

## What it did
- Test first: service tests (memory) failed on the missing `sendCode`/`verifyCode`, page tests on the missing
  `VerifyStep`, the proxy test on `/code` being refused (401); then implemented until they passed.
- Migration `105_link_codes.sql` applied with `npm run migrate` and `npm run migrate:test`.
- `npm --prefix backend/api test`: 588 passed (575 before + 13). One earlier full run had 4 failures in DB route tests
  (link and intake) that did not repeat in two further full runs or alone; most likely another session's run on the same
  test database at the same moment.
- `npm --prefix frontend test`: 208 passed, three runs (the working tree also holds another session's uncommitted tests).
- `npm run typecheck`: passes (frontend tsc, API tsc).
- Not run: `npm run test:py` (no Python touched). `npm run pipeline` not needed (no analytics table written).

## Tests added (AC ids)
- `backend/api/test/intake/link.test.ts` "E19 verification code (memory)": AC-LINK-17 (masked GET, no map credential,
  nothing sent on open; full view with the token; flag off as before), AC-LINK-18 (one email to the sender as a new
  message, `[CODE]` in outbound_messages, hash only; 429 within 60 s with retryIn; 4th code 429; 503 for no Gmail, failed
  send, sender off the allow-list, nothing stored), AC-LINK-19 (triesLeft 4..0, locked after 5, new code works, 11 min
  expiry, unsent code, 400 malformed, 404; /lookup and Confirm 401 without the token, work with it; a new code keeps the
  token; another link's token refused), AC-SEC-LINK-12 (no code or token in rows, outbound, audit, events).
- `backend/api/test/routes/link.test.ts`: the code and verify routes in the token-redaction and public-route tests; an
  HTTP flow on the test DB (AC-LINK-17/-18/-19); AC-SEC-LINK-12 search of every table, log line and outbound body.
- `backend/api/test/intake/link-deps.test.ts`: AC-LINK-17 setting default on (empty too), outbox uses ALLOW_LIST.
- `backend/api/test/intake/link-seed.test.ts`: the seven new columns.
- `frontend/lib/auth/link.test.ts`: AC-SEC-LINK-12 `/code`, `/verify` are link routes; `x-link-verify` forwarded only on
  link routes and only in the token's shape.
- `frontend/components/confirm/VerifyStep.test.tsx` (7) and `ConfirmScreen.test.tsx` (+2): the verify step, messages,
  countdown, header on look-up and Confirm, 401 back to the verify step. `frontend/lib/confirm/load.test.ts` (+1).

## Deviations and choices
- The 4th code answers `429 { error: "code_wait", retryIn: null }` (no time would help); the page says no more codes
  can be sent. The SPEC/CONTRACTS do not say what `retryIn` holds here.
- The 5th wrong code answers `code_wrong` with `triesLeft: 0`; later entries (even the right code) `code_expired`.
- Each entry is counted before it is compared (atomic `code_tries + 1`), so parallel guesses cannot pass 5.
- A right code is spent (code_hash cleared): a second verify with it is `code_expired`. A second verification replaces
  the stored token hash (one token per link at a time).
- Sender off ALLOW_LIST: 503 `email_unavailable` (a `refused` outbound row with `[CODE]`), not 403, so the page does not
  tell anyone about the allow-list.
- `/code` and `/verify` answer 404 `link_invalid` when the flag is off or the order is no longer SENT.
- `LinkDeps.code`/`outbox` are optional (missing = off) so the existing literal deps in tests stay valid.

## Output
- API: `backend/db/migrations/105_link_codes.sql`, `backend/api/src/modules/intake/{link,linkRules,linkDeps,mailbox,repo,routes}.ts`,
  `backend/api/src/core/{config,permissions}.ts`, `test/intake/memoryLinks.ts`.
- Web: `frontend/components/confirm/VerifyStep.tsx` (new), `ConfirmScreen.tsx`, `app/confirm/[token]/page.tsx`,
  `lib/confirm/load.ts`, `lib/auth/proxy.ts`. `.env.example`: `CONFIRM_LINK_CODE=on`.

## Handed to
- reviewer: the choices above (retryIn null, triesLeft 0, 503 off the allow-list); the existing DB route tests run with
  `code: false` except the one code-flow test.

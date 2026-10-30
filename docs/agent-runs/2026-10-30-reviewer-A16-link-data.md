# reviewer · A16-link-data (E19 part 1: migration 103, link rules, reply placeholder) · 2026-10-30

**Branch:** `A16-link-data`, one commit `8de2b87` on `6ca402d` (`spec-pass-30oct`, already in `origin/main`, so
`origin/main..A16-link-data` is this commit only). **Task:** A16 in `docs/superpowers/plans/2026-10-26-latelens-A-email.md`,
owner A, built by C (Q-LINK-01); this review stands in for A's until A looks. **Against:** SPEC v0.12 §5.17
(REQ-LINK-01/-05/-09, SEC-LINK-01/-02/-10, REQ-INT-09, their ACs), CONTRACTS §5 and §7.

## Verdict: changes needed (one small fix, finding 1); everything else can merge as is

## Tests
- Branch tests: `link-rules`, `link-draft`, `link-config`, `link-seed`, `address`: 5 files, **41 passed**.
- Full backend suite: **48 files, 401 passed**, 0 failed, 0 skipped (matches the implementer's count).
- `npm run typecheck`: exit 0.
- Test DB checked directly: `schema_migrations` holds `103_address_links.sql`; constraints `address_confirm_tokens_token_hash_key`
  (UNIQUE), `address_confirm_tokens_email_id_fkey`, `saved_addresses_source_check`; no FK on `saved_addresses.email_id`;
  index `address_confirm_tokens_live`; 567 `saved_addresses` rows, all `source = 'seed'`. Same as the file.
- My own checks (scratch scripts, not committed): `linkExpiry` checked by hand on the four AC-SEC-LINK-02 examples, both
  2026 DST changes, a send after that day's cut-off, a send late in the evening, a send in the repeated hour on 1 Nov, an
  arrival time later than the send, and a `T` separator. A sweep over every 7 minutes of 2026 (two arrival times) gave
  lifetimes from 1 h to 24 h, and every expiry under 24 h fell at 06:00 New York time. No errors.

## Findings, most severe first

### 1. Medium: nothing stops `CONFIRM_LINK=on` before A17, and the placeholder would then be emailed as text
`backend/api/src/core/config.ts:46-48` (`checkConfirmLink`), `backend/api/src/modules/intake/actions.ts:77-79` (send_reply,
unchanged). The run record's "do not turn CONFIRM_LINK on before A17 merges" is a note in a doc. No code enforces it.
`npm run setup` (`frontend/scripts/demo-users.mjs:31`) already writes `AUTH_URL=http://localhost:3000` into every local
`.env`, so the start check passes as soon as someone sets `CONFIRM_LINK=on`.
**Failing scenario:** a developer on `main` after this merge sets `CONFIRM_LINK=on` to try E19 and pastes a
`CONFIRM_ADDRESS` email. The stored draft holds "Or confirm the address on a map with this one-time link: [CONFIRM_LINK]".
An operator approves and sends it, and the allow-listed client gets the literal `[CONFIRM_LINK]`. The draft is stored in
`intake_extractions.reply_draft`, so turning the flag back off does not clean it: until A17 lands, any later send of that
draft still sends the placeholder. That breaks SPEC §5.17 step 2: "The placeholder is never sent as text."
**Fix (either one, a few lines):** (a) for now, make `checkConfirmLink` refuse `on` outright ("CONFIRM_LINK=on needs
A17 (send_reply link minting): refusing to start") and have A17 replace that with the `AUTH_URL` check; or (b) bring the
flag-off half of REQ-LINK-09 into A16: in `send_reply`, drop every line holding `LINK_PLACEHOLDER` before sending, with
a test. A17 then adds minting on top. (b) also cleans up stray drafts already stored.

### 2. Low: re-seeding moves link rows ahead of seed rows in candidate order (for A17)
`backend/api/src/modules/intake/seedTables.ts:13` with `repo.ts:104` (`ORDER BY id`). The seed now deletes and
re-inserts only `source='seed'` rows, so after a re-seed they get new, higher ids and every surviving `source='link'`
row sorts first. Nothing breaks today because there are no link rows yet.
**Scenario (after A17):** client C190 has one link-confirmed address. After `npm run seed`, that address moves to the top
of the "Is it one of your saved addresses?" list, and `checkAddress` may pick it first when matching. Reply text and model
prompts change, and the recorded model answers no longer match.
**Fix:** in A17, give `savedAddresses` a stable order (for example `ORDER BY source, label, id` or a seed-order column) and
add a test that re-seeds with one link row present.

### 3. Low: `saved_addresses.email_id` can point at the wrong email after a reset (accepted trade-off; document it)
`backend/db/migrations/103_address_links.sql:701-703`. Dropping the FK is right: `TRUNCATE … CASCADE` ignores
`ON DELETE SET NULL` and would empty `saved_addresses` anyway. But the route tests and a demo reset use
`RESTART IDENTITY`, so a kept `link` row's `email_id` can later match a different, newer email.
**Scenario:** a link row has `email_id = 3`. A demo reset truncates `intake_emails` with RESTART IDENTITY, and the next
pasted email becomes id 3. A screen or query that joins on `email_id` shows the wrong order as the address's source.
**Fix:** state in the CONTRACTS §5 note that `email_id` is for provenance only and must never be joined after a reset.
Optionally also store the email's `message_id` or a hash with it.

### 4. Low: `localToInstant` resolves a time in the spring-forward gap to an hour earlier
`backend/api/src/modules/intake/linkRules.ts:140-144`. `2026-03-08 02:30` in New York gives `06:30Z` (01:30 EST). The
usual "compatible" rule would give 07:30Z (03:30 EDT). An ambiguous time (`2026-11-01 01:30`) gives the earlier instant,
05:30Z, which is fine. Not reachable today, because the only caller passes 08:00, and 08:00 is not a transition time in
`America/New_York` or any likely `MAILBOX_TIMEZONE`. The function is exported, though, and its doc comment says it
follows "that IANA zone's own daylight-saving rules".
**Fix:** say in the doc comment that a time in the gap resolves to the earlier offset, or shift forward when
`wallAt(result) !== wall`. Add one gap test either way. Also, `wallAt` (lines 133-137) duplicates
`mailbox.toLocalTimestamp`; reusing it would keep a single formatter.

### 5. Low: `ConfirmBody` details for A17/A19
`backend/api/src/modules/intake/linkRules.ts:175-183`.
- (a) `line2` is `.nullable()` but not `.optional()`. A body that leaves out `line2` gets 400 (checked). The A19 page must
  always send `line2: null`, or make it `.nullish()`.
- (b) Control characters, including CR/LF, pass in `line1`, `line2` and `city` (checked: `"1 A St\r\nBcc: x"` parses).
  SEC-LINK-10 does not forbid them, and the address only lands in reply bodies, never headers. But a link-confirmed
  address later goes into `saved_addresses` and into reply text.
  **Fix:** add `.regex(/^[^\p{Cc}]*$/u)` to `text()`.
- (c) `needsSecondConfirm` compares ZIPs as strings, so typing `32801-1234` for a start ZIP of `32801` asks for a second
  Confirm. That is conservative and acceptable, but write it down.

### 6. Low: model drafts may put `[CONFIRM_LINK]` on a line that also carries required facts (for A17)
`backend/api/src/modules/intake/reply.ts:52` makes the placeholder a required phrase but does not require its own line.
REQ-LINK-09 says to remove "the line holding `[CONFIRM_LINK]`" when the flag is off.
**Scenario:** the model writes "We can deliver by 3 Nov 2026; or confirm here: [CONFIRM_LINK]". The flag is turned off,
the draft is sent, and A17's line removal also deletes the promise date.
**Fix (A17):** remove only the placeholder sentence or token rather than the whole line, or check the required phrases
again after stripping and fall back to the template.

### 7. Nit: traceability and docs
- `link-rules.test.ts:559` ("a local time converts…") and `link-seed.test.ts:603` (CONTRACTS §5 columns) name no AC id.
  Tag them `SEC-LINK-02` / `AC-SEC-LINK-01` as the others are.
- The `AC-LINK-09` pipeline test (`link-draft.test.ts:483`) only compares flag off with flag absent. "Byte-identical to
  before E19" actually rests on the unchanged `pipeline`, `reply`, `eval` and `oracle` suites passing. That is true here
  (no existing test or recording changed), but the test name claims more than it checks.
- The plan's Step 3 text (`2026-10-26-latelens-A-email.md`, "arithmetic is in whole minutes … off by the shift") is stale.
  The new "As built" note supersedes it; strike it. SPEC §5.17 line 984 and §6 still say migration `102` (already flagged
  for the spec-writer).
- The API App Service gets no `AUTH_URL` in `infra/setup-auth.sh:60-61`. That is fine while the flag is off; A20 must add
  it, and A17 should trim a trailing `/` from `AUTH_URL` before adding `/confirm/<token>`.

## Deviations in the implementer's record: all nine are sound
1. **Migration 103:** right; `102_client_emails.sql` exists. CONTRACTS updated; SPEC still says 102 (see finding 7).
2. **Lifetime on instants, returning `Date`:** right, and SPEC v0.12 requires it. Verified by hand and by the sweep above.
3. **No FK on `saved_addresses.email_id`:** right. With `TRUNCATE … CASCADE`, any FK (even `ON DELETE SET NULL`) empties
   the table. Residual risk in finding 3. The token table keeps its FK, so a reset revokes every link by deleting it,
   which is correct.
4. **Seed moved to `seedTables.ts`:** right, and it stays in A's module folder. `seed.ts` still owns BEGIN/COMMIT/ROLLBACK
   around `writeSeed`. The insert relies on the column default `'seed'`; passing `source` explicitly would read more
   clearly (nit). The CD path still works: `cd.yml:164-166` runs `npm run migrate` before `npm run seed`, and CI runs
   `migrate:test` before `seed:test`.
5. **`checkConfirmLink` exported:** right; it is testable and also checked in a fresh process. Side effect: `AUTH_URL` is
   now URL-validated by the API even with the flag off, so a malformed value stops the API. Every known source (setup
   script, `setup-auth.sh`) writes a valid URL.
6. **`test/setup.ts` pins `CONFIRM_LINK=off`:** right; a developer's `.env` cannot change recordings. It guards the tests
   only, not a running API (finding 1).
7. **CHECK on `source`:** right; it matches CONTRACTS' two values. A future value needs a migration, which is intended.
8. **Extra tests:** useful, especially the DST, floor, days-later and fresh-process start checks.
9. **No Maps settings:** right; they belong to A18/A20.

## Checked and found nothing wrong
- **Tokens:** 32 bytes from `randomBytes`, base64url, 43 characters. `TOKEN_SHAPE` is exported for route validation.
  Only the SHA-256 hex hash has a column; there is no token column (the test asserts the exact column set). A
  constant-time compare is not needed, because lookup is by hash equality in the DB with a 256-bit secret.
- **Migration:** matches CONTRACTS §5 column by column. Safe on a populated DB: `source NOT NULL DEFAULT 'seed'` fills
  existing rows, and the new columns are nullable. Runs once, inside a transaction, through `schema_migrations`. The
  UNIQUE on `token_hash` gives the lookup index. No `expires_at` index is needed, because expiry is read per link or per
  email. No down migration, which is consistent with the repo.
- **Flag off:** `facts` gains no key (conditional spread), so the model prompt JSON, `requiredPhrases` and the template
  are byte-identical. No existing test or recording changed, and the existing reply, pipeline, eval and oracle tests pass.
  `ALL_CLEAR` and `MISSING_INFO` drafts never carry the placeholder.
- **`decide`** treats `confirmed` as verified (REQ-INT-09). Only A17 will set it. The frontend label for it is A18's job,
  as noted.
- **`repo.savedAddresses`** selects explicit columns, so the new columns do not leak into replies, prompts or the API.
- **Rules:** no secrets or `.env` committed; no dataset edits; no numbers shown to users; no change to Python or pipeline
  tables. One writer per table holds: `saved_addresses` is split by `source` between A's seed and A's approval
  (SPEC REQ-LINK-05). Shared files touched with a reason: `core/config.ts` (B's core; REQ-LINK-09 start check, same
  pattern as the `ASK_*` settings), `.env.example`, `test/setup.ts`.
- **Commit message** names the REQ ids. Tests name AC ids, apart from finding 7.

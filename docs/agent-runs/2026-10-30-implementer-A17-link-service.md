# implementer · A17 (E19, part 2): mint at send_reply, open, confirm, decide again, save on approval · 2026-10-30

**Task:** A17 in `docs/superpowers/plans/2026-10-26-latelens-A-email.md`, including the "From the A16 review" box.
Owner A, built by C (Q-LINK-01); A reviews. **Branch:** `A17-link-service`, cut from `A16-link-data` (55a688a), in the
worktree `root-route-a17`. **REQ:** REQ-LINK-01 (send half), -03, -04, -05, -07, -08, -09 (send half), SEC-LINK-01, -02,
-03, -04 (look-ups), -06, -08 (service half), -09, -10, -11, REQ-INT-09. The plan predates SPEC v0.12; where they
disagree this follows SPEC v0.12 (deviations below).

## Tests added or changed (all in `backend/api/test/`)
| File | Tests | ACs |
|---|---|---|
| `intake/link.test.ts` (new, memory store) | 27 | AC-LINK-01 (43-char token in the Gmail text only, one hashed row, `outbound_messages.body` keeps the placeholder, `expires_at` 06:00 next day; trailing `/` on `AUTH_URL` trimmed; operator removed the placeholder → sent as edited, no row); AC-SEC-LINK-01; AC-SEC-LINK-09 (403 and 503 leave no row; a Gmail failure after minting revokes the link; `mintLink` has no caller but `send_reply`); AC-SEC-LINK-03 / -06 (view keys; 3 opens leave it unused and confirmable); AC-SEC-LINK-08 service half (`map.kind = 'sas'`, expires with the link; no credential for an expired link); AC-LINK-03 (600 m → 409 + reading, then checkId → 200; ZIP change → 409 at 0 m; a made-up checkId or a pin moved after the reading → 409); AC-LINK-04 (400 m → ALL_CLEAR with warehouse, carrier, arrival-time promise, template draft without placeholder, AWAITING_APPROVAL, `client-link:<id>` audit, `send_to_wms` 409; no start pin → second Confirm); AC-LINK-05 (saved only on approval, `savedAddress: 'link'` in the approval audit; a non-link approval saves nothing); AC-LINK-07 / AC-SEC-LINK-02 (random, malformed, used, expired → identical 404); AC-LINK-08 (resend revokes; a follow-up email's link revokes the first email's); AC-SEC-LINK-10 (four bad bodies → 400, unused, no look-up); AC-SEC-LINK-04 (21st look-up → 429); AC-SEC-LINK-11 (5 event kinds, each with email id + 8-char hash prefix, never the token); REQ-LINK-09 (flag off: a valid token opens and confirms nothing); AC-LINK-09 flag-off send (template drafted with the flag on strips to exactly the flag-off template; sentence-level strip cases; placeholder on the promise line → template fallback keeps the date; standalone sentence → model text kept minus that sentence; flag on but no link service → stripped, no row) |
| `intake/memoryLinks.ts` (new) | – | the plan's in-memory `LinkRepo` |
| `intake/link-repo.test.ts` (new, test DB) | 2 | REQ-LINK-08 / SEC-LINK-01 / -02 / -04 on the SQL `linkRepo` (thread walk up and down, hash-only lookup, look-up count, pending reading round-trip, expired `markUsed` refused, two concurrent `markUsed` → exactly one wins, thread revocation leaves the used link alone, `newestFor`, `saveAddress` columns incl. `source='link'`); AC-LINK-05 / REQ-LINK-05 re-seed with a link row present: `SAVED_ADDRESSES_SQL` order identical before and after, though the link row's id is now lower (rolled back) |
| `maps.test.ts` | +2 | REQ-LINK-03: `AzureMapsValidator.reverse` calls `/reverseGeocode?coordinates=lon,lat` with the key in a header, transport error on 401; recorded/recording `reverse` round-trip by pin, `missing_recording`, `unsupported` for an inner validator without `reverse` |
| `intake/link-config.test.ts` | 2 changed | AC-LINK-09: back to "on with `AUTH_URL` starts" (in-process check and fresh-process start, exit 0, empty stderr) |

Each new test was run red first: `link.test.ts` (module `link.js` not found), `link-repo.test.ts` (`linkRepo` undefined,
`SAVED_ADDRESSES_SQL` undefined), `maps.test.ts` (`reverse is not a function`), `link-config.test.ts` ("not available
yet" thrown).

## Commands and results (from the worktree)
- `npm --prefix backend/api test` before: 48 files, 402 passed. After: **50 files, 433 passed** (+31), 0 skipped.
- `npm run typecheck`: exit 0. The API `lint` covers `src` only, so the five new/changed test files were also
  type-checked with a temporary tsconfig (scratchpad, not committed): clean.
- `npm --prefix frontend test`: 17 files, 99 passed (no frontend change).
- `npm run test:py` (main checkout's `.venv`): 73 passed (no Python change).
- Intake recordings: no file under `test/recordings/` changed; `eval`, `oracle`, `reply`, `pipeline` suites pass unchanged.
- `npm run pipeline` not run: no pipeline table written. No live Gmail, model, Maps or Azure call.

## Deviations from the plan
1. **Expiry:** `linkExpiry(email.received_at, now, d.hours, d.timeZone)` is the `expires_at` `Date` directly (A16
   signature, SPEC v0.12 time arithmetic); the plan's `localOf` + `localToInstant` wrapping is gone.
2. **Map credential is SAS only** (SEC-LINK-08, CONTRACTS `LinkView.map.kind = 'sas'`): `MapCredential.kind` is
   `'sas'`, not `'sas' | 'entra'`. The issuer stays injected (`LinkDeps.credentials.issue`); the real `listSas` issuer is A18/A20.
3. **Flag-off send (REQ-LINK-09, A16 review finding 6):** instead of dropping every line holding the placeholder, the
   new `reply.withoutLinkPlaceholder` removes only the placeholder's sentence (a line left empty goes, with its doubled
   blank line, so the flag-on template strips to exactly the flag-off template). `actions.withoutLink` then re-checks the
   required phrases for the stored facts: if a phrase the text held was lost, the fixed template (names restored) is
   sent instead. This also applies to operator-edited text that still holds the placeholder (rare: it then loses the
   operator's edits only if stripping would have dropped a required phrase). SPEC §5.17 step 2 / REQ-LINK-09 still say
   "the line holding the placeholder": spec-writer.
4. **Flag on, no link service:** `send_reply` with `CONFIRM_LINK=on` but no `opts.link` (the action route until A18)
   strips the placeholder like flag off; no link, no row. So removing the A16 start guard is safe before A18.
5. **`savedAddresses` order:** `ORDER BY source = 'link', id` (exported as `SAVED_ADDRESSES_SQL`): seed rows first in
   seed-file order, then link rows oldest first. It uses `id` only within each source, where a re-seed keeps the
   relative order; the cross-source order no longer depends on ids. Chosen over `source, label, id` because that would
   reorder today's seed rows and change every recording. Today all rows are `seed`, so existing output is unchanged.
6. **One fact builder:** `replyFactsOf` (and `formatAddress`) moved into `reply.ts`; `processEmail` uses it (same
   fields, same conditional `link` key; recordings unchanged), and so do `decideAgain` and the flag-off fallback.
7. **`decideAgain`:** decides on the extraction with the confirmed address in it; looks the client up by sender address
   and domain (as the pipeline does), not domain only; the draft is the template from `replyFactsOf`.
8. **Maps:** `AzureMapsValidator` shares one private `get` for `geocode` and `reverse`; `RecordingAddressValidator.reverse`
   throws `AddressValidatorError(..., 'unsupported')` when the wrapped validator has no `reverse`. Recording key:
   `('address', 'reverse', JSON.stringify({ lat, lon }))`.
9. **`linkRepo` tested now** against the test database (`link-repo.test.ts`), not left to A18; includes a concurrent
   `markUsed` race.
10. **AC-LINK-03 "a browser flag claiming not moved":** A16's `ConfirmBody` is `.strict()`, so an extra field is 400
    (SEC-LINK-10), not 409. The service test covers the intent with a made-up `checkId` at 600 m → 409.
11. **Gmail failure after minting** revokes the new link (plan's step 4); the row remains, `revoked`. A 403/503 is
    decided before minting, so it leaves no row (AC-SEC-LINK-09).
12. Files outside `modules/intake`: `core/maps/*` (listed in the plan's Files) and `core/config.ts` (guard removal
    required by the A16 review). Both are B's core folder, changed as the plan and review direct.

## For the reviewer (A) and for A18
- **A18 must pass `link` to `applyAction`** in `POST /intake/:id/action`. Until then `CONFIRM_LINK=on` starts, drafts
  carry the placeholder, and `send_reply` sends them without it (no link). Safe, but no link goes out.
- **Reverse-geocoding recordings:** none exist. Route tests on `ADDRESS_PROVIDER=recorded` that reach a second Confirm
  (AC-LINK-04 with fixture 34 has no start pin, so it always does) need a recording under the key above, or a fake
  `maps` through `setLinkDeps`. The start pin uses `geocode` recordings; a missing one is swallowed (pin `null`).
- `confirmLink` lets a `reverse` transport error or a provider without `reverse` throw (500 from the route). A18 may
  want a 503. The look-up has already been counted by then.
- **Open behaviour to decide (A):** revocation happens only when a new link is minted. If the client answers by email
  instead and that follow-up is processed, the earlier link stays live until expiry; confirming it then re-decides the
  first email to AWAITING_APPROVAL alongside the follow-up's own decision (two review entries for one order). Options:
  revoke the thread's unused links when a follow-up is processed, or have `decideAgain` refuse when a newer email in the
  thread exists. SPEC does not say.
- `decideAgain` sets AWAITING_APPROVAL whatever the email's current status; only `CONFIRM_ADDRESS` emails get links, so
  today that is SENT (or APPROVED if the send failed after approval).
- `saveOnApproval` returns false when the flag is off at approval time, even for an address confirmed while it was on.
- `IntakeScreen.tsx` still shows status `confirmed` as "Missing" (A18 / A19, from A16).
- SPEC §5.17 still says migration `102` and "the line holding" the placeholder (spec-writer).

---

## Review fixes (same day): `docs/agent-runs/2026-10-30-reviewer-A17-link-service.md`, findings 1–8

All test-first: the 16 new/changed tests below were run red for the expected reason (state `sent` not `revoked`, `[1, 2]`
awaiting instead of `[2]`, `used_at` set after a failure, 200 instead of 404/409, `[CONFIRM_LINK]` in the sent text,
three links instead of one, `linkRepo.confirm is not a function`, `$&` rewritten, AUTH_URL with a path accepted).

| Finding | Change | Tests (`test/intake/link.test.ts` unless named) |
|---|---|---|
| 1 High: one order decided twice | **Default for A to confirm (not in SPEC):** (a) `find` (GET and POST) answers the invalid 404 when the thread holds an email newer than the link's; (b) `processEmail`, on a client follow-up, revokes the thread's unused links (whatever `CONFIRM_LINK` says), and when the follow-up is ALL_CLEAR closes an earlier link-confirmed email still AWAITING_APPROVAL as `REJECTED`, audited `system:intake` / `superseded` with `{ by }`. `Deps.links` (optional; `getDeps` passes `linkRepo`). | REQ-LINK-08: email first then link (link revoked, 404, one order awaiting); newer email without revocation → 404, unused; link first then email → `[newer]` awaiting, earlier REJECTED + audit |
| 2 Medium: link burnt before the re-decision | `decideAgain` now only computes (returns the extraction row). `LinkRepo.markUsed` is replaced by `LinkRepo.confirm`: one transaction for link use + `SENT → AWAITING_APPROVAL` + extraction + audit row; false with nothing written if the link is no longer live or the email no longer SENT; a failed write rolls back. | REQ-LINK-04 P4 (carriers throw → link unused, status SENT, 1 extraction, no audit; retry → 200); `link-repo.test.ts` (expired, not SENT, failing write rolls back, concurrent confirms → one wins, counts) |
| 3 Medium: placeholder via untrusted data | `neutralisePlaceholder` (linkRules) removes `[CONFIRM_LINK]` from untrusted values; `replyFactsOf` applies it to items, the given address, candidates (saved addresses incl. link-confirmed ones) and the suggestion; `safeNames` applies it to names put back (send_reply, template fallback, and the `GET /intake/:id` draft display in `routes.ts`). Mint/strip is decided on the operator's text or the tagged draft before names go back. Last guard: a non-minting reply still holding the placeholder → 409, not sent. Values without the placeholder are unchanged (no recording changed). | P6 flag off (template fallback, no placeholder), P6 flag on (one placeholder → exactly one link), P6 operator removed theirs (no mint), P7 (flag off `Hello Bob,`; flag on mints nothing for the name; with a real placeholder exactly one link) |
| 4 Medium-low: operator text replaced | Operator-edited text holding `[CONFIRM_LINK]` that cannot get a link (flag off, no link service, not CONFIRM_ADDRESS) → 409 "Remove [CONFIRM_LINK] from your reply…"; nothing sent. The template fallback stays for the stored draft only. | P3 flag off → 409, nothing sent, status APPROVED; flag on without link service → 409 |
| 5 Low: status guard | `confirmLink` answers the invalid 404 unless the email is SENT (checked before any look-up or write, and again inside the transaction). Coordinator asked SENT only (reviewer suggested SENT or APPROVED). | APPROVED, AWAITING_APPROVAL, ENTERED, REJECTED → 404, link unused, status unchanged |
| 6 Low: save on approval | `saveOnApproval` runs before `setStatus('APPROVED')`; `saveAddress` returns false when the client already has the same address (letters/digits, case-blind, 5-digit ZIP; any source); the approval audit says `savedAddress: 'link'` or `'already_saved'`. | failing save → still AWAITING_APPROVAL, no approve audit; duplicate not saved (memory and `link-repo.test.ts`) |
| 7 Low: re-send failure | `mintLink` no longer revokes; `settleLink` revokes the thread's other unused links (`revokeUnused(…, keepId)`) only after Gmail accepted; on failure only the new link is revoked (`LinkRepo.revoke`). | the client's first link still works after a failed re-send; new row revoked |
| 8 Low: link URL | `replaceAll(…, () => url)`; with `CONFIRM_LINK=on`, `checkConfirmLink` requires `AUTH_URL` to be an origin only (no path, query, fragment or credentials; a trailing `/` is fine). No https requirement (local is `http://localhost:3000`). | `$&` in appUrl inserted literally; `link-config.test.ts` (3 origins accepted, 4 non-origins refused, flag off unaffected) |

**Not done (finding 9, as asked):** two concurrent `send_reply` calls can still leave two live links (and send twice);
this predates E19. A conditional status update (`… SET status = 'SENDING' WHERE status IN (…)`) would close both.

### Commands and results
- `npm --prefix backend/api test`: **50 files, 448 passed** (+15 on b5f11b5: 14 in `link.test.ts`, 1 in
  `link-config.test.ts`; `link-repo.test.ts` rewritten, still 2). The first full run after the change had 3 failures
  (the `link-repo` SQL test and two `routes/complaints` tests timing out at 5 s); I did not capture the message, and it
  did not recur in 3 further full runs and 6 runs of those two files together. Possibly test-database slowness;
  the reviewer may want to watch for it.
- `npm run typecheck`: exit 0; the changed test files type-check with the temporary tsconfig (scratchpad).
- `npm --prefix frontend test`: 99 passed. `npm run test:py`: 73 passed. No recording changed.

### SPEC / CONTRACTS text that now differs (for the spec-writer; SPEC not edited)
- §5.17 step 2 and REQ-LINK-09: "the line holding the placeholder is removed" → the code removes the placeholder's
  sentence, falls back to the template for a stored draft that would lose a required phrase, and refuses (409)
  operator-edited text holding it; a reply that mints nothing never goes out holding it.
- AC-LINK-03 "a browser flag claiming 'not moved' … then 409": the strict body (SEC-LINK-10) makes it 400.
- §5.17 intro and §6: migration `102` → `103`.
- REQ-LINK-08 additions (default for A): a link stops working when a newer email exists in its thread; a client
  follow-up revokes the order's unused links; an ALL_CLEAR follow-up supersedes (REJECTED, audited) an earlier
  link-confirmed email still awaiting approval. REQ-LINK-04: only a SENT email is decided again, in one transaction.
- REQ-LINK-05: a link address the client already has is not saved again.
- REQ-LINK-09 start check: `AUTH_URL` must be an origin only.
- CONTRACTS §6 `POST /api/intake/:id/action`: `send_reply` can answer 409 for a reply holding `[CONFIRM_LINK]` that
  cannot carry a link.

### Left for A
- **Confirm or change the finding-1 default** (newest email wins; superseding uses `REJECTED`, which the screen shows
  as rejected; a dedicated status would need CONTRACTS and screen changes). A follow-up after a link-confirmed order
  was already APPROVED or ENTERED is not superseded, so it can still create a second review entry; the same holds
  without E19 for any follow-up to an approved order (pre-existing).
- Whether a flag-off approval should still save a link-confirmed address (unchanged: it does not).
- The newer-email check in `find` runs outside the confirm transaction (a follow-up stored in the same instant could
  race it); the follow-up's revocation and the SENT check inside the transaction narrow it.

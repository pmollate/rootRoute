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

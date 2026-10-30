# reviewer · A17-link-service (E19 part 2: mint at send_reply, open, confirm, decide again, save on approval) · 2026-10-30

**Branch:** `A17-link-service`, one commit `b5f11b5` on `A16-link-data` (`55a688a`); reviewed with
`git diff 55a688a..b5f11b5` in the worktree `root-route-a17`. **Task:** A17 in
`docs/superpowers/plans/2026-10-26-latelens-A-email.md`, owner A, built by C (Q-LINK-01); this review stands in for A's
until A looks. **Against:** SPEC v0.12 §5.17 (REQ-LINK-01, -03, -04, -05, -07, -08, -09, SEC-LINK-01 to -04, -06, -08 to
-11, their ACs), CONTRACTS §5 to §7.

## Verdict: changes needed (findings 2 and 3 are small code fixes; finding 1 needs A's decision before A18 wires the link)

Nothing reaches a client yet: the action route does not pass `link` (A18), so with `CONFIRM_LINK=on` every send takes
the strip path. Removing the A16 start guard is safe on that basis, apart from finding 3 (which also applies today).

## Tests
- Branch tests (`intake/link.test.ts`, `intake/link-repo.test.ts`, `maps.test.ts`, `intake/link-config.test.ts`):
  4 files, **37 passed**.
- Full backend suite: **50 files, 433 passed**, 0 failed, 0 skipped (matches the implementer's count).
- `npm run typecheck`: exit 0. No file under `test/recordings/` changed.
- My own probes (a scratch vitest file in the session scratchpad importing the branch's `actions.ts`, `link.ts`,
  `reply.ts` and the test memory stores; nothing committed): scenarios P1 to P7 quoted in the findings below.

## Findings, most severe first

### 1. High (open point, needs A before A18): an order can be decided twice, once by the link and once by the client's email
`backend/api/src/modules/intake/link.ts:184-185` (`confirmLink` → `decideAgain`), `link.ts:195-218`;
`backend/api/src/modules/intake/pipeline.ts:82` (a follow-up is stored as a new email with `in_reply_to`). Links are revoked
only when a new link is minted (`mintLink`), and `decideAgain` does not look at the rest of the thread.
**Failing scenario:** email #1 (CONFIRM_ADDRESS) is sent with a link. The client answers by email with the full
address; the poll stores #2 (`in_reply_to = 1`), decided ALL_CLEAR, AWAITING_APPROVAL. Later the client also clicks the
link and confirms: #1 becomes ALL_CLEAR, AWAITING_APPROVAL. The order review now holds two entries for one order; a
supervisor approves both and both go `send_to_wms` → the order is entered twice. The reverse order (link first, then
an email answer) gives the same result. This is the implementer's open point; I rank it highest because it ends in a
duplicate WMS entry.
**Fix (A to choose, then spec-writer):** in `confirmLink`, before `markUsed`, answer `INVALID` when
`orderEmailIds(l.email_id)` holds an id greater than `l.email_id` (a newer email of the order exists), and in
`processEmail` revoke the thread's unused links when a follow-up is stored (needs the `LinkRepo` in `Deps`). The second
direction (link confirmed, then an email answer) needs a rule in the pipeline too, e.g. a follow-up to an order whose
link was used goes to review flagged "already confirmed by link". SPEC §5.17 says nothing; add it to REQ-LINK-08.

### 2. Medium: a failure after `markUsed` burns the link and leaves the order stuck, with nothing shown to staff
`link.ts:184-185`. `markUsed` commits, then `decideAgain` runs the warehouse and carrier calls and the two writes. If any
of them throws, the link is used, the email keeps its old status and extraction, and every retry gets 404.
**Failing scenario (probe P4):** carriers' `recommendCarrier` throws once. First confirm → `Error: carriers down`;
afterwards `used_at` is set, status still `SENT`, extractions unchanged (1); the client's retry →
`{"code":404,"body":{"error":"link_invalid"}}`. The order list would show the link as confirmed (REQ-LINK-06 reads
`used_at`), so the desk does not follow up, yet the order never reaches the review.
**Fix:** compute the decision, promise, warehouse and carrier first (no writes), then `markUsed`, `saveExtraction` and
`setStatus` in one transaction (or clear `used_at` if the writes fail). Add a test with a throwing `recommendCarrier`
asserting the link stays usable.

### 3. Medium: `[CONFIRM_LINK]` can still be sent as text, and can trigger a mint, through untrusted email data
`backend/api/src/modules/intake/actions.ts:31-39` (`withoutLink`), `actions.ts:103-105`. The template fallback at line 39
is sent without checking it for the placeholder, and the placeholder test at 103-104 runs on text that already holds
restored names and the client's own address fields. Email content is untrusted (SEC-02); nothing stops a client
writing `[CONFIRM_LINK]` into its address or signature.
**Failing scenarios (flag off, or flag on before A18):**
- P6: city extracted as `Boston [CONFIRM_LINK]`, issue `zip_mismatch` with a suggested ZIP. Stripping removes the
  sentence carrying the suggested ZIP (a required phrase), so the template is sent instead, and the template prints
  the address: sent text holds `...you gave: 12 Main St, Boston [CONFIRM_LINK], MA 02210. The ZIP code 02210 does not
  match Boston [CONFIRM_LINK], MA...`.
- P7: `pii_map` `[PERSON_1]` → `Bob [CONFIRM_LINK]`, model draft with the promise date in the placeholder's sentence →
  template fallback → sent text starts `Hello Bob [CONFIRM_LINK],`.
- Flag on with the link service (after A18): if the operator deletes the placeholder line but the restored text still
  holds an injected `[CONFIRM_LINK]`, `send_reply` mints a link anyway (breaks REQ-LINK-01's "MUST NOT mint").
Impact today is small (replies go only to the allow-listed sender), but REQ-LINK-09 says the placeholder is never sent
as text, and this is the one path that does it.
**Fix:** (a) decide minting and stripping on the stored draft or edited text *before* `restore`, and (b) as a last
step before `sendReply`, on the no-link path remove any remaining `LINK_PLACEHOLDER` occurrences outright
(`replaceAll(LINK_PLACEHOLDER, '')`) or refuse with 409. Better still, neutralise `[CONFIRM_LINK]` where untrusted text
enters (extracted address fields and PII values). Add P6 and P7 as tests.

### 4. Medium-low: an operator's edited reply is silently swapped for the template
`actions.ts:104` with `actions.ts:39`. When the operator's own text (`opts.edited`) still holds the placeholder and
stripping its sentence loses a required phrase, the fixed template goes out instead of what the operator wrote and saw.
**Failing scenario (probe P3):** flag off, operator sends "Hi Bob, sorry for the delay on PO 7781. Please send the
street address. We can deliver by 30 Oct 2026 or confirm at [CONFIRM_LINK].\nThanks, Ana". Gmail receives the
template ("Hello Client 25, Thank you for your order: ..."); the PO reference and sign-off are gone and the response
is still 200. SEC-03 / §5.17 step 2 keep the operator in charge of the text.
**Fix:** for `opts.edited`, do not fall back to the template: return 409 "remove [CONFIRM_LINK] from your reply (the
address link is off)" so the operator edits it. Keep the template fallback for stored drafts only.

### 5. Low: `decideAgain` re-decides whatever status the email has
`link.ts:195-218` sets AWAITING_APPROVAL unconditionally. Today only a SENT email (or APPROVED if the bookkeeping after
a successful Gmail send failed) can hold a live link, so I found no reachable path to re-open an APPROVED, REJECTED or
ENTERED order through the link's own email; finding 1 is the reachable variant through the thread. Add a guard
(`status` in SENT/APPROVED, else answer INVALID before `markUsed`) so a later change cannot re-open a closed order.

### 6. Low: `saveOnApproval` ordering and flag-off loss
`actions.ts:80-84`, `link.ts:222-228`. It runs after `setStatus('APPROVED')` and before `logApproval`; if `saveAddress`
throws, the order is APPROVED with no approval audit row. With the flag off at approval time (or before A18 passes
`link`), a link-confirmed address is never saved and nothing will save it later; the run record notes this. No dedupe:
the same address confirmed on two orders becomes two saved rows, offered twice. **Fix:** save before `setStatus` (or one
transaction); decide with A whether flag-off approval should still save (the confirmation already happened); skip the
insert when an identical row exists for the client.

### 7. Low: a Gmail failure on a re-send leaves the client with no working link
`actions.ts:111`. `mintLink` has already revoked every earlier unused link of the order; on a Gmail failure only the
new link is revoked, so the link the client already holds is dead too. Acceptable (the operator retries), but say so
in the run record or revoke earlier links only after Gmail accepted the message.

### 8. Low: link URL building
`link.ts:122`. `replaceAll` with a string replacement interprets `$&`, `` $` `` and `$'`; an `AUTH_URL` containing them
would rewrite the text (`$&` puts `[CONFIRM_LINK]` back). The token alphabet has no `$`, and `AUTH_URL` is operator
config, so this is hardening: use a replacer function (`() => url`) and validate `AUTH_URL` at start as an origin only
(no path, query or fragment; https outside localhost). The trailing-slash trim is correct and tested.

### 9. Low: two concurrent `send_reply` calls can leave two live links
`actions.ts:90-105`. Both pass the APPROVED check, and each `revokeUnused` can run before the other's `insert`, so the
order ends with two live links (REQ-LINK-08 wants one). Double-sending is older than E19; a conditional status update
(`UPDATE ... SET status='SENDING' WHERE status IN (...)`) would close both.

### 10. Notes for A18 / spec-writer (no change needed in A17)
- `confirmLink` throws on a missing `reverse` (`link.ts:176`) or a Maps transport error, whose message includes Azure's
  response text; the A18 route must answer a fixed message (e.g. 503), never the error text.
- AC-LINK-03's "browser flag claiming not moved" cannot be 409 with the strict body (it is 400, SEC-LINK-10); the AC
  text needs updating. REQ-LINK-09 / §5.17 step 2 say "line"; the code removes the sentence (deviation 3). §5.17 still
  says migration `102`.
- AC-SEC-LINK-11's "rate limited" event is logged (`link_refused`, `why: 'map_lookups'`) but not asserted in the
  events test; AC-LINK-07's byte-identical check does not include a revoked link in the same assertion (revoked is
  covered via `viewLink` in AC-LINK-08). AC-LINK-04 with fixture 34 is service-level only here; the route test is A18.
- The PR description must name the REQ ids (REQ-LINK-01, -03, -04, -05, -07, -08, -09, SEC-LINK-01 to -04, -06, -08
  to -11, REQ-INT-09).

## Security checks that passed
- Token: 32 random bytes, base64url, 43 chars; only `hashToken(token)` is stored, looked up by hash after a shape
  check. Every `d.log` call carries `{ emailId, hash: prefix }` only; the audit row carries the prefix; no thrown error
  in the new code includes the token or the link URL; `outbound_messages.body` keeps the placeholder (tested).
- Single use, expiry and revocation are in the `markUsed` WHERE clause (`used_at IS NULL AND revoked_at IS NULL AND
  expires_at > $5`); the SQL race test (two concurrent `markUsed` on separate pool connections) has exactly one winner.
  Thread revocation walks `in_reply_to` up and down (tested on the real DB, used links untouched).
- Map look-ups counted atomically in SQL, 21st refused; the distance is measured server-side; a `checkId` only counts
  for its pin (< 1 m) and ZIP.
- Map credential: `kind: 'sas'` only, from the injected issuer, expiring with the link, not issued for an invalid link.
  The server-side reverse geocode uses the key in a header, never in the URL (tested).
- Mint happens only in `send_reply`, after the allow-list and Gmail checks (403/503 leave no row, tested; source scan
  test for other callers).

## The implementer's deviations and open points
1. Expiry as a `Date` from `linkExpiry`: agree (SPEC v0.12 time arithmetic).
2. SAS only: agree (SEC-LINK-08, CONTRACTS).
3. Sentence strip plus template fallback: agree with the sentence strip; the fallback needs findings 3 and 4. Spec text
   to follow.
4. Flag on without a link service strips: agree; makes removing the start guard safe, except finding 3.
5. `ORDER BY source = 'link', id`: agree. `source` is NOT NULL with a CHECK, so no NULL-ordering surprise; with only
   seed rows today the order equals `ORDER BY id`, so recordings cannot change (none did). The re-seed test is
   meaningful: it asserts the link row's id is now lower than the seed rows' and the order is unchanged.
6. `replyFactsOf` shared: agree; same fields and conditional `link` key as before; pipeline/reply/eval suites unchanged.
7. `decideAgain` client lookup by sender then domain: agree (matches the pipeline). See findings 1, 2, 5.
8. Maps `get` refactor and `unsupported` kind: agree; geocode behaviour unchanged; recording key for reverse is distinct
   (`system = 'reverse'`).
9. `linkRepo` tested now: agree, good.
10. Strict body → 400 instead of 409: agree; AC text to update (note 10).
11. Gmail failure revokes: agree; see finding 7.
12. Changes in B's `core/maps` and `core/config.ts`: acceptable. Additive (`reverse` optional, a new error kind),
    `geocode` unchanged in behaviour, and the guard removal was asked for by the A16 review. Tell B.
- Open: thread double review → finding 1 (High). `decideAgain` status → finding 5. `saveOnApproval` with flag off →
  finding 6. Reverse errors → note 10.

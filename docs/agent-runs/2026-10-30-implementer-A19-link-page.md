# implementer · A19 (E19, part 4): /confirm/{token} page, proxy exception, per-IP limit, link states on screen · 2026-10-30

**Task:** A19 in `docs/superpowers/plans/2026-10-26-latelens-A-email.md`. **Branch:** `A19-link-page`, cut from
`A18-link-routes` at `5a6e71e` (A18 not merged yet). **Spec:** SPEC §5.17 (REQ-LINK-02, -03, -06, -07, -09, -10, -11,
NFR-LINK-01, SEC-LINK-01, -04, -05, -07, -08, -10). Not pushed; no PR. Azure, infra and `cd.yml` untouched (A20).

## What was built
- `frontend/lib/auth/open.ts` (new): `isOpen(path, confirmLink)`, `isLinkPage`. `/` stays open (as on `main`).
- `frontend/lib/auth/linkGate.ts` (new): `linkGate`, `LINK_HEADERS`, `linkRoutePattern` (log redaction).
- `frontend/lib/auth/proxy.ts`: `isLinkRoute`; `/api/confirm/<token>` forwarded with no session, key or internal token;
  Origin check unchanged; log lines name `/api/confirm/[token]`, never the token.
- `frontend/lib/auth/demo.ts`: `RateLimiter.take`. `frontend/auth.ts`: `clientIp` exported.
- `frontend/middleware.ts`: link gate after maintenance, before the `AUTH_REQUIRED` early return (404 off, 429 + log
  by pattern, pass with the two headers); `isOpen` from `lib/auth/open.ts`.
- `frontend/app/confirm/[token]/{page,not-found}.tsx`, `frontend/lib/confirm/load.ts`,
  `frontend/components/confirm/{ConfirmScreen,ConfirmMap}.tsx`, `text.ts`, `confirm.module.css`.
- `frontend/lib/confirm/{atlasVersion,atlas}.ts` and `frontend/app/confirm-map/[version]/[file]/route.ts`: the pinned
  Azure Maps Web SDK (`azure-maps-control` 3.7.4, exact, in `package.json`) served from the app's own origin as two
  static files built at `next build`.
- `IntakeScreen.tsx`: `link` on `EmailItem` / `Detail`; row chip "Link sent" / "Address not confirmed" /
  "Confirmed by client link"; `confirmed` counts as done in the stepper, readiness and ship-to ("confirmed by client link").
- `OrderReview.tsx`: for `addressSource === 'link'`, the chip "Address confirmed by client link" and a text block with
  the email's address, the confirmed address and the map's reading.
- `.env.example`: `CONFIRM_LINK` read by both apps; `CONFIRM_LINK_RATE_PER_MINUTE=10`.

## Tests added (ACs)
- `lib/auth/link.test.ts` (8): AC-SEC-LINK-05 (open list; proxy without session/key/token, also with a session;
  deeper path still 401), AC-SEC-LINK-07 + SEC-LINK-01 (cross-origin POST 403, log by pattern), AC-SEC-LINK-04 (11th
  refused, other IP passes, window resets), AC-LINK-09 + AC-SEC-LINK-07 (off 404, headers), SEC-LINK-01 pattern,
  AC-SEC-LINK-08 (no `NEXT_PUBLIC_*MAPS*` in `.env.example` or web source; confirm code never reads `AZURE_MAPS_KEY`).
- `lib/confirm/load.test.ts` (3): AC-SEC-LINK-05 (no headers but `accept`, `no-store`), AC-LINK-07 (404 → null; token
  stays one segment), API failure throws.
- `lib/confirm/atlas.test.ts` (3): SEC-LINK-07 (exact pin = installed = served URL; only the two files),
  AC-SEC-LINK-08 (SDK file has no key).
- `components/confirm/ConfirmScreen.test.tsx` (9): AC-LINK-02 (page, fixture 21), AC-LINK-10, AC-LINK-03 (page),
  REQ-LINK-03 (checkId dropped on ZIP/pin change; no start pin), REQ-LINK-07 (page), SEC-LINK-10 (page),
  SEC-LINK-04 (page 429), SEC-LINK-07 (text, not markup).
- `IntakeScreen.test.tsx` (+2): AC-LINK-06 (UI), REQ-LINK-11 (UI). `OrderReview.test.tsx` (+2): AC-LINK-11 (UI).
- `e2e/confirm.spec.ts` (4, skipped without `CONFIRM_TOKEN`): AC-NFR-LINK-01, AC-SEC-LINK-07, AC-SEC-LINK-05, AC-LINK-07.

## Commands
- `npm --prefix frontend test`: 25 files, 173 passed (146 before).
- `npm --prefix backend/api test`: 64 files, 548 passed (unchanged).
- `npm run test:sim`: 5 passed. `npm run typecheck`: clean (frontend and API).
- `npm run test:py`: not run, no `python`/`.venv` on this machine; no Python changed. `npm run pipeline`: not needed.
- `npm --prefix frontend run build` with `CONFIRM_LINK=on AZURE_MAPS_KEY=<sentinel>`: OK; sentinel and the real `.env`
  key found in neither `.next/static` nor `.next/server/app/confirm*`; no `NEXT_PUBLIC_*MAPS*` anywhere (AC-SEC-LINK-08).
- Local run (API on the test DB with `ADDRESS_PROVIDER=recorded`, `AUTH_REQUIRED=on`, one link row inserted then
  deleted): page 200 with both headers; random token 404 with the invalid text; `/dashboard` and `/confirmx` 307 to
  `/login`; `/api/overview` 401; `/api/confirm/<token>` through the proxy 200; 11th request from one IP 429, another IP
  200; log line `{"event":"link_rate_limited","route":"/api/confirm/[token]"}`; the token in neither log.
- Playwright `e2e/confirm.spec.ts` against that local run: 3 passed (headers, no-redirect, invalid 404); the touch-drag
  test failed at the marker: the recorded stand-in SAS token is refused by Azure Maps, so the map never becomes ready
  and the page shows "The map could not load…" (width was 375). Needs A20's real credential.

## Deviations from the plan
1. **SDK from npm, served by the app, not the CDN.** The CDN serves only the rolling major (`/mapcontrol/3/`; exact
   versions 404), and the user asked for exact pins. Bundling `azure-maps-control` fails in `next build` (SWC breaks its
   minified code: "Identifier 'e' has already been declared"), so the two files are served by a static route at
   `/confirm-map/3.7.4/…` and added with one `<script>`/`<link>`. The page loads no third-party script at all.
   This adds one public path (a library file like those in `public/`, no data); SEC-LINK-05 lists only data routes.
2. **Link chips sit before `waitingOnClient`**, not before the `CONFIRM_ADDRESS` line: there they never ran (a SENT
   CONFIRM_ADDRESS email returns "Waiting on client" first). The list row now shows the chip too (it had none).
3. **No start pin:** the pin starts at a fixed display default (centre of the contiguous US), not "the centre of the
   ZIP the client types": that needs geocoding in the browser, which SEC-LINK-08 forbids. The API still asks for the
   second Confirm with the map's reading (REQ-LINK-03).
4. **`loadLink`** returns null only for the API's 404; any other status throws (error page), so an API outage is not
   shown as "link no longer valid".
5. **`LINK_INVALID_TEXT`** lives in `components/confirm/text.ts` (re-exported by the screen): a constant imported
   from a `'use client'` module into the server not-found page would be a client reference, not the string.
6. AC-LINK-02's page test uses fixture 21 (SPEC), not 47, as in A18.
7. `/` kept in the open list (the plan's `open.ts` dropped it).

## For the reviewer
- The touch-drag e2e and the real map need A20 (`listSas`). Until then the map shows its failure line; if the start
  pin was null the client cannot move it and confirms the US-centre pin after the reading (the supervisor then sees
  that reading next to the address, L3).
- The root layout preloads the landing hero poster on every page, `/confirm` included (shared file, not changed).
- `.next/` was rebuilt locally with `CONFIRM_LINK=on`; nothing from it is committed.

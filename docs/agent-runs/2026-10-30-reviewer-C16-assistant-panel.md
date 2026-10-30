# Reviewer run: `C16-assistant-panel` (Task C16, D10 part 3)

- **Date:** 2026-10-30 · **Branch:** `C16-assistant-panel` (bf73d39 on top of `C15-assistant-api` 8ee2ac5; merges cleanly onto `origin/main` e81b05c)
- **Reviewed:** `git diff 8ee2ac5..bf73d39` against plan Task C16 (C plan), SPEC §5.16 (REQ-ASK-01, -04, -05, -08,
  SEC-ASK-03 browser half, SEC-ASK-06, NFR-ASK-01; AC-ASK-01, -08, AC-SEC-ASK-03, -06), SPEC-auth REQ-AUTH-11,
  `frontend/README.md`, the API in `backend/api/src/modules/assistant/{answer,routes}.ts`, and the implementer's record.
- **Out of scope (known, intended):** Step 6 (flag on in Azure, live latency/log evidence); no "Synthetic data" badge.
- **Verdict: changes needed (small).** Rendering, storage, flag handling, proxy path and history shape are correct.
  One visible defect on the Overview screen (F1) should be fixed before the flag is switched on; the rest are medium/low.

## Tests
- `npm --prefix frontend test`: **16 files, 91 passed, 0 failed** (8 new in `AskPanel.test.tsx`, 1 new in `DashboardShell.test.tsx`).
- `npm run typecheck`: exit 0.
- `npx playwright test -g "Ask LateLens" --list`: 12 tests (6 screens x phone/desktop); with `ASK_ASSISTANT` unset all
  skip; with it on, desktop skips via the viewport callback and phone (375 px) runs. Skip logic is correct.
- No figures added; golden numbers untouched (the panel shows only what the API returns).

## Checks that passed
- **Plain text only.** Answer, user text, tool name, `JSON.stringify(args)` and `JSON.stringify(result)` are React text
  children (`<p>`, `<code>`, `<pre>`). No `dangerouslySetInnerHTML`, no Markdown renderer, no `<a>`/`<img>` built from
  data, no URL ever constructed from an answer or a source. The API also replaces markup answers with COULD_NOT_CHECK.
- **No browser storage.** State is `useState` only; the panel lives in `DashboardShell` inside the dashboard layout, so
  it persists across client navigation between screens and is gone on reload. Test spies `Storage.prototype.setItem`
  (covers local and session storage).
- **Flag.** Read in the server component `app/dashboard/layout.tsx` and passed as a boolean prop; no `NEXT_PUBLIC_ASK*`
  anywhere, nothing in `next.config`. Only on/off reaches the client.
- **Same-origin proxy.** `postJSON('/api/assistant')` -> `app/api/[...path]/route.ts` -> `lib/auth/proxy.ts`. The proxy
  has no allow-list of paths: any clean segment is forwarded, POST body forwarded, Origin checked for writes (the
  browser's same-origin fetch sends it), 401 `session_expired` with `AUTH_REQUIRED=on` and no session, internal token
  with a session, `x-api-key` added server-side with auth off. Middleware treats `/api/*` as open (proxy decides). Works
  with auth on and off.
- **History shape.** Only answered pairs stay in `turns` (a failed question is removed), so turns alternate
  user/assistant and `slice(-6)` always starts on a user turn. 4th exchange: 6 earlier turns sent (API max 6, OK);
  5th+: the oldest pair drops. User turns are the trimmed question (<= 500 by the panel's guard); assistant turns are
  the API's own answer, which the API caps at 2000 (`answer.ts:94`) or replaces with REFUSAL / COULD_NOT_CHECK (both
  short), so no history the panel builds can fail the schema.
- **Errors.** 401 session_expired -> SESSION_ENDED; 429 -> fixed wait text; 400 too_long -> fixed text; 400 invalid,
  403, 404 (API flag off), 503, non-JSON 5xx (App Service, maintenance rewrite), network failure -> "Ask LateLens is
  not available right now." No server text reaches the screen. Question goes back into the box; nothing resent.
- **Phone width.** Dock `max-width: calc(100vw - 32px)`, panel `min(420px, 100vw - 32px)` with `border-box`; `<pre>`
  wraps; panel scrolls vertically within 70vh.

## Implementer deviations
1. More tests than the plan: sound.
2. Ask disabled over 500 (`tooLong`) as well as `maxLength`: sound (a paste via script or an IME can exceed it).
3. Question back in the box and the failed turn removed: sound; keeps history alternating and matches REQ-AUTH-11's
   "do not resend until clicked". See F3 for what the message promises.
4. Own message for `too_long`: harmless, though unreachable from this UI (client trims and blocks > 500 first).
5. Panel above the button (`order: -1`), `border-box`: sound for the panel itself; it missed the existing Overview
   launcher in the same corner (F1).
6. Smoke test as a skipping `describe` at 375 px only: sound, but its overflow assertion cannot fail for this panel (F4).

## Findings (most severe first)

### F1 (medium-high): the Ask LateLens button sits on top of the Overview "Router" launcher and the Router panel's send button
- **Where:** `frontend/components/dashboard/assistant/ask.module.css:2` (`position: fixed; right: 16px; bottom: 16px; z-index: 40`)
  vs `frontend/components/dashboard/overview/overview.module.css:195` (`.launcher`: fixed, right 16, bottom 16, 52x52,
  z-index `--z-header + 2` = 32) and `:207` (`.assistant` side panel, fixed to bottom 16 / right 16, z 34; scrim z 33).
- **Scenario:** `ASK_ASSISTANT=on`, open `/dashboard/overview` at any width. The pill "Ask LateLens" (~38 px tall) covers
  most of the round "Open Router" launcher; a tap there opens Ask LateLens instead. Open Router: its panel (z 34) is
  under the Ask button (z 40), which now covers the bottom-right of the Router panel where its question input's send
  button is. The e2e smoke test does not catch this (it only clicks "Ask LateLens", which is on top).
- **Fix:** give the two a single corner. Either move the Overview launcher up when the panel exists (e.g. pass
  `assistant` through a context and offset `.launcher` / `.assistant` bottom), or move the dock (e.g. `bottom: 80px` on
  Overview), and put the dock below the Router scrim/panel (`z-index` under `--z-header + 3`) or hide the dock while
  Router is open. A product decision is also due: two assistants on one screen ("Router", canned answers, and "Ask
  LateLens", the live model) will confuse a demo audience; consider retiring Router when the flag is on. Add an e2e
  check on Overview that both buttons are clickable (`button.click({ trial: true })` on each).

### F2 (medium): new answers are not announced to screen readers; no Escape / focus handling
- **Where:** `AskPanel.tsx:64-68` (toggle, `<section>`, `<ol>`).
- **Scenario:** a screen-reader user asks a question; the button changes to "Asking…" and back, the answer is appended
  to the `<ol>` silently (only errors have `role="alert"`). They do not know an answer arrived. Opening the panel leaves
  focus on the toggle; Escape does nothing (ReportsMenu, Overview Router and Journey popups all close on Escape and
  return focus, so this panel breaks the dashboard's own convention).
- **Fix:** `aria-live="polite"` (and `aria-busy={busy}`) on the `<ol>` or on a one-line status ("Answer received");
  move focus to the textarea on open; Escape closes and returns focus to the toggle; `aria-controls` on the toggle;
  `aria-describedby` linking the counter to the textarea. Add one test (Escape closes; the turns list has `aria-live`).

### F3 (low-medium): ended-session message promises what the panel cannot do and offers no sign-in link
- **Where:** `AskPanel.tsx:20` returns `SESSION_ENDED` ("Your session has ended. Sign in again; your changes are kept.").
- **Scenario:** `AUTH_REQUIRED=on`, session expires, user asks. The panel says changes are kept, but signing in is a full
  page load and SEC-ASK-03 forbids storing the conversation, so the question and the whole conversation are gone after
  sign-in. There is no "Sign in again" link either; every other screen pairs SESSION_ENDED with `signInAgain(...)`
  (`IntakeScreen.tsx:642`, `OrderReview.tsx:46`, `ComplaintsScreen.tsx:100`, `CarriersScreen.tsx`).
- **Fix:** a panel-specific fixed text, e.g. "Your session has ended. Sign in again, then ask again; this conversation
  is not kept.", with a link to `signInAgain(usePathname())`. Update the REQ-AUTH-11 test accordingly.

### F4 (low): the phone smoke test's overflow check cannot fail because of the panel
- **Where:** `frontend/e2e/smoke.spec.ts:125`.
- **Scenario:** the dock is `position: fixed`; fixed boxes are laid out against the viewport and do not add to the
  document's scrollable width in Chromium. If the panel were 500 px wide at 375 px, `scrollWidth - innerWidth` would still
  be 0 and the test would pass while the panel is cut off on the left.
- **Fix:** assert the panel's box instead: `const b = await page.getByRole('region', { name: 'Ask LateLens' }).boundingBox();`
  then `b.x >= 0 && b.x + b.width <= 375`. Keep the existing scrollWidth check for the page itself.

### F5 (low): "could not check" answers say "Here is what the tools returned" but the results are collapsed
- **Where:** `AskPanel.tsx:74` (`<details>` closed by default).
- **Scenario:** REQ-ASK-04 says a failed check is replaced by the fixed text *and the tool results*. The user reads
  "Here is what the tools returned." and sees nothing until they find and open "Sources (n)". (API-side edge: when every
  tool request was skipped, COULD_NOT_CHECK comes back with zero sources and the panel shows no Sources at all.)
- **Fix:** `<details open={!t.a.checked && !t.a.refused}>`; optionally show "No tool returned data." when the
  sources list is empty on an unchecked answer.

### F6 (low): test labels stretch some AC ids
- `AskPanel.test.tsx` "AC-SEC-ASK-01" and "AC-SEC-ASK-02" tests check the panel's message/guard; those ACs are about the
  API (5 tool calls / 400 with no model call; the 11th question gets 429). Name them as panel behaviour for SEC-ASK-01/-02
  (or "UI half of AC-SEC-ASK-0x") so the traceability matrix does not count them as AC evidence. The AC-ASK-08 shell
  test covers the prop, not `layout.tsx`'s `process.env.ASK_ASSISTANT === 'on'` mapping; acceptable, but note it.
- The e2e `SCREENS` list (pre-existing) has 6 screens; AC-ASK-01 says "each dashboard screen", and Labs, Settings and
  complaints/other screens under the same layout are not checked. Low; the shell test shows the panel is layout-wide.

## Nothing found on
Security of rendering (no HTML/link/image/URL path), browser storage, NEXT_PUBLIC leakage, proxy forwarding with auth on
or off, history bounds on the 4th+ exchange and with long or COULD_NOT_CHECK answers, ownership (shared files
`DashboardShell.tsx`, `layout.tsx`, `.env.example`, `smoke.spec.ts` changed as the plan says), secrets.

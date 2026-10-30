# Implementer run: Task C16 (D10 part 3: "Ask LateLens" panel on every screen)

- **Date:** 2026-10-30 · **Asked by:** Priyank (resource C) · **Branch:** `C16-assistant-panel` (from `C15-assistant-api`, 8ee2ac5)
- **Plan:** `docs/superpowers/plans/2026-10-26-latelens-C-carriers.md`, Task C16. Steps 1–5 and 7 ticked. Step 6 (set
  `ASK_ASSISTANT=on` on both App Service apps, live latency and log checks) not done: out of scope for this run (no Azure
  changes, no live calls); blocked on `AUTH_REQUIRED=on` and the T14 review.
- **REQ:** REQ-ASK-01, REQ-ASK-08 (panel), SEC-ASK-03 (browser half), SEC-ASK-06, NFR-ASK-01 (Step 6, open)

## Files
- Created: `frontend/components/dashboard/assistant/{AskPanel.tsx,ask.module.css,AskPanel.test.tsx}`
- Modified: `frontend/components/dashboard/DashboardShell.tsx` (prop `assistant`, renders `<AskPanel />` in `<main>`),
  `frontend/app/dashboard/layout.tsx` (reads `process.env.ASK_ASSISTANT` on the server), `frontend/components/dashboard/DashboardShell.test.tsx`,
  `frontend/e2e/smoke.spec.ts`, `.env.example` (note that both apps read `ASK_ASSISTANT`), the plan (ticks)

## Tests added
| Test | AC |
|---|---|
| AskPanel: button opens the panel; answer, `Sources (1)`, `overview({})`; body `{ question, history: [] }` | AC-ASK-01 |
| AskPanel: a follow-up sends the earlier turns as `history` | AC-ASK-01 |
| AskPanel: `<img>` and a Markdown link in an answer show as text; no `img` / `a[href*=evil]` in the DOM | AC-SEC-ASK-06 |
| AskPanel: `Storage.prototype.setItem` never called | AC-SEC-ASK-03 (browser half) |
| AskPanel: `checked: false` shows "Figures not checked" | REQ-ASK-04 |
| AskPanel: 501 characters: textarea `maxLength` 500, counter `501/500`, Ask disabled, submit sends nothing | AC-SEC-ASK-01 |
| AskPanel: 429 `rate_limited` and 503 `assistant_unavailable` show fixed messages | AC-SEC-ASK-02, AC-ASK-10 |
| AskPanel: 401 `session_expired` shows `SESSION_ENDED` and keeps the question | REQ-AUTH-11 |
| DashboardShell: no button without `assistant`; button with it | AC-ASK-08, AC-ASK-01 |
| e2e smoke (skipped unless `ASK_ASSISTANT=on`): each screen at 375 px shows the button; open panel adds no sideways scroll | AC-ASK-01, AC-UI-03 |

## Commands and results
- Step 1 `npm --prefix frontend test -- components/dashboard/assistant`: FAIL, cannot resolve `./AskPanel` (expected).
- Step 2 same: **8 passed**.
- Step 3 `npm --prefix frontend test -- components/dashboard/DashboardShell.test.tsx`: 1 failed (second render: no
  "Ask LateLens" button, expected), 4 passed.
- Step 4 `npm --prefix frontend test`: **16 files, 91 passed**. `npm run typecheck`: exit 0.
- Step 5 `WEB_URL=http://127.0.0.1:9 npx playwright test -g "Ask LateLens"` (from `frontend/`, flag unset): **12 skipped**,
  no page opened. Not run against the deployed site.
- `npm --prefix frontend run build`: success (~13 s).

## Deviations from the plan
1. **More tests than the plan's four** (follow-up history, 500-character block, 429/503 messages, ended session), as the
   run brief asked for the UI block on long questions and the API's real error codes.
2. **Ask is disabled over 500 characters** (`tooLong`), not only by `maxLength`: jsdom (and a paste via script) can set a
   longer value, so the button and `ask()` both refuse it; the counter shows e.g. `501/500`.
3. **On an error the question goes back into the box** and the unanswered user turn is removed (the plan cleared the box
   and left the turn). REQ-AUTH-11 says screens keep what was typed when the session ends, and keeping only answered
   turns means the next `history` never has two user turns in a row.
4. **`too_long` (400) has its own message**; the plan mapped every non-429 error to "not available".
5. **CSS:** the dock is a flex column with the panel ordered above the button (`order: -1`, `margin-bottom`) so the open
   panel grows upwards from the bottom-right button instead of off the bottom of the screen; `box-sizing: border-box` on
   the panel so its padding stays inside `calc(100vw - 32px)` at 375 px.
6. **Smoke test** is a `describe` that skips unless `ASK_ASSISTANT=on` and skips the desktop project (checked at 375 px only).
- No plan/code mismatch otherwise: `DashboardShell` props, `mockApi` in `test-utils.tsx`, `Pill` (`tone="warn"`) and the
  API's `AssistantAnswer` (answer.ts) match the plan.

## Left for the reviewer
- Step 6 (live): `ASK_ASSISTANT=on` on both App Service apps after `AUTH_REQUIRED=on`; AC-NFR-ASK-01 / -02 evidence in
  `docs/TEST-EVIDENCE.md`; `network-security-auditor` on T14 first.
- The panel shows no "Synthetic data" badge: the plan does not ask for one, and the assistant's tools read the supplied-data tables.
- The smoke test's `ASK_ASSISTANT` must be set to match the deployed web app's setting; with the flag on locally but off
  on the server, the button test fails (by design: it tells you the panel is not on).

---

## Follow-up run (30 Oct): review findings F1–F6, Overview Router uses the AI

**Asked by:** Priyank (resource C), after the reviewer's run (`2026-10-30-reviewer-C16-assistant-panel.md`, committed
with this change). **User decision (30 Oct):** Overview's "Router" answers typed follow-ups with Ask LateLens when the
flag is on; the Ask LateLens dock is hidden on Overview (one assistant per screen). This settles F1.

### What changed
- **Shared code (C):** `frontend/components/dashboard/assistant/useAsk.ts` (request, exchanges, last 6 turns as
  history, busy/error, a failed exchange removed and `ask()` resolving `false` so the caller puts the question back),
  `AskAnswer.tsx` (`AskAnswer`: plain-text answer, "Figures not checked" pill, sources `<details>`; `AskErrorNote`:
  fixed message plus the "Sign in again" link), `AssistantFlag.tsx` (React context with the server-read flag; no
  NEXT_PUBLIC variable). `AskPanel.tsx` now uses them.
- **DashboardShell:** wraps the screens in `<AssistantFlag on={assistant}>`; the dock renders only when the path is not
  `/dashboard` or `/dashboard/overview*` (`/dashboard` only redirects today; covered in case it ever renders Overview).
- **Router (`overview/OverviewScreen.tsx`, resource B's file; B should review):** only the `Assistant` component
  changed. `asked` entries carry `live: boolean`; with the flag on, the free-text box sends to `useAsk().ask` and the
  reply renders with `AskAnswer` ("Asking LateLens…" while pending); on failure the entry leaves the thread, the
  question goes back in the box and `AskErrorNote` shows above the form. Chips, the opening plan and "Copy plan" are
  unchanged and still canned; flag off, the box behaves exactly as before. The asked list is wrapped in
  `<div className={s.asked} aria-live="polite">`; one line added to `overview.module.css` (`.asked { display: grid; gap: 14px; }`)
  so the wrapper keeps the thread's spacing. Input gets `maxLength=500` and Send is disabled while asking, flag on only.
- **F2:** answers list `aria-live="polite"` + `aria-busy`; focus to the textarea on open; Escape closes and returns
  focus to the toggle; toggle `aria-controls="ask-latelens"`; counter `id="ask-count"` linked by `aria-describedby`.
- **F3:** `ASK_SESSION_ENDED` = "Your session has ended. Sign in again, then ask again; this conversation is not kept."
  with `<a href={signInAgain(usePathname())}>Sign in again</a>` (`lib/api.ts` helper).
- **F4:** the phone smoke test checks the panel's `boundingBox()` is within 0–375 px (and keeps the page scrollWidth check).
- **F5:** `<details open>` when the answer is neither checked nor refused.
- **F6:** panel-side tests renamed to `SEC-ASK-01 (panel side)` and `SEC-ASK-02 and AC-ASK-10 (panel side)`; the e2e
  list for the dock is the 5 non-Overview screens plus Complaints, Labs and Settings; a new e2e test on Overview asserts
  no Ask LateLens button and trial-clicks Router's launcher and (after typing) its Send button.
- **Manual-test fix:** Enter in the Ask panel textarea sends (`form.requestSubmit()`), Shift+Enter adds a line, IME
  composition is left alone.

### Tests added / changed
| Test | AC / REQ |
|---|---|
| AskPanel: ended session says "not kept", link to `/login?expired=1&next=%2Fdashboard%2Fcarriers`, question kept | REQ-AUTH-11, SEC-ASK-03 |
| AskPanel: sources open for an unchecked answer, closed for a checked one | REQ-ASK-04 |
| AskPanel: focus to box on open; Escape closes, focus back on toggle; `aria-controls`, `aria-live`, `aria-describedby` | REQ-ASK-01 (accessibility) |
| AskPanel: Enter sends, Shift+Enter does not | REQ-ASK-01 |
| Router: flag on, a typed follow-up goes to `/api/assistant` (`history: []`), plain text, pill, sources, no `<img>`, live region | REQ-ASK-01, REQ-ASK-04, SEC-ASK-06 |
| Router: chips keep worked-out answers, no model call | REQ-ASK-01 |
| Router: flag off, typed follow-up gets the canned answer, no model call | REQ-ASK-08 |
| Router: 429 shows the fixed message and puts the question back | SEC-ASK-02 (Router side) |
| DashboardShell: on Overview no dock with the flag on; the flag reaches the screen through the context | REQ-ASK-01 |
| e2e: dock screens + Complaints/Labs/Settings, panel box within 0–375 px; Overview: Router only, launcher and Send clickable | AC-ASK-01, AC-UI-03 |

### Commands and results
- Red: `npx vitest run components/dashboard/assistant components/dashboard/DashboardShell.test.tsx` failed to resolve
  `./AssistantFlag` / `./useAsk` (expected). Green after the change: 4 files, 23 passed (one Router test first failed on a
  second `role="alert"` from the Overview Status block under my 404 stub; fixed the stub to serve the Overview routes).
- `npm --prefix frontend test`: **17 files, 99 passed**.
- `npm run typecheck` (frontend + API lint): exit 0.
- `npm --prefix frontend run build`: success.
- `WEB_URL=http://127.0.0.1:9 npx playwright test -g "Ask LateLens"`: 18 listed, **18 skipped** (flag unset). Not run
  against the deployed site or a live model.

### Deviations
1. Hook returns `exchanges` (`{ question, answer? }`) rather than a flat turn list; the history sent is the same
   alternating user/assistant shape, last 6 turns (the existing history test passes unchanged).
2. One CSS line in B's `overview.module.css` for the live-region wrapper (otherwise the grid gap between follow-ups is lost).
3. `AskPanel` re-exports the `AssistantAnswer` / `AssistantSource` types from `useAsk.ts`.

### For the reviewer / resource B
- **B should review** the `Assistant` (Router) diff in `frontend/components/dashboard/overview/OverviewScreen.tsx` and the
  `.asked` line in `overview.module.css`.
- The Overview e2e test and the dock tests still need a run with `ASK_ASSISTANT=on` against a local stack (not done here).
- Router's thread pairs live entries with `useAsk` exchanges by order; a chip pressed while a live question is pending
  appears after it in the thread, and the live answer still lands on its own entry.

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

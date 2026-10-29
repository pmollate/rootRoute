# B17: Overview card style on Warehouses, Carriers and Replay

Branch `B17-frontend-changes`. Frontend only (`root-route/frontend`). No data, API or number changes.

Goal: the Warehouses, Carriers and Replay screens follow the Overview screen's page head, card and heading style, so the
dashboard reads as one product. Order emails (`intake/`) and Journey are out of scope.

## Global Constraints

- The reference is the Overview screen: `frontend/components/dashboard/overview/OverviewScreen.tsx` and
  `overview.module.css`. Read both before changing anything. Match them; do not invent a third style.
- **Page head (Overview `.pageHead`):** a plain row above everything else: left, an uppercase eyebrow
  (`.eyebrow`: 0.7rem, 600, letter-spacing 0.14em, `--ink-2`) over an `h1` (`.title`: display font,
  `clamp(1.6rem, 2.6vw, 2rem)`, 700, letter-spacing -0.03em); right, small chip actions (`.chip`: 0.74rem, 500,
  padding 5px 10px, radius 8px, 1px `--line` border, `--surface` background, 14px stroke icon at strokeWidth 2).
  Exactly one `h1` per page.
- **Hero:** where the screen already has a `PageHero`, keep it below the page head (as Overview does), but it must not
  render a second `h1`: use `variant="metric"` with a figure the screen ALREADY computes and shows (for example one of
  its existing hero chips), or otherwise make the hero's title not a heading. Never invent a number (CLAUDE.md: every
  number shown is computed from the dataset). Screens with no `PageHero` today (Replay) do not get one.
- **Cards (Overview `.panel`):** `--surface` background, 1px `--line` border, `border-radius: var(--radius)`,
  `box-shadow: 0 1px 2px rgb(var(--shadow-rgb) / 0.05)`, padding `var(--pad)` with `--pad: clamp(18px, 2.4vw, 24px)`.
  Screen grid gap 16px; card-to-card gaps 16px.
- **Card headings (Overview `.head` / `.h2` / `.sub`):** the section heading goes INSIDE its card, top-left: `h2`
  (display font, 1.08rem, 700, letter-spacing -0.02em, margin 0 0 6px) over a `.sub` line (0.76rem, `--ink-2`,
  line-height 1.5, max-width 52ch). Tags or tools sit top-right in the same row (`.head`: flex, wrap,
  space-between, gap 12px 20px, margin-bottom 18px). No coloured icon tiles beside headings: remove the
  `SectionHead` / `SecHead` icon marks. A section that is several cards side by side gets one heading inside each card
  rather than one heading floating above them.
- **Tags (Overview `.tagGood` / `.tagBad` / `.tagMuted`):** 0.7rem, 600, padding 3px 9px, pill radius.
- **Tables (Overview `.table`):** th 0.6rem, 600, letter-spacing 0.12em, uppercase, `--ink-2`, 1.5px `--ink` bottom
  border; td 0.74rem with 1px `--line` bottom borders.
- Keep each screen's own CSS module (`warehouses.module.css`, `carriers.module.css`, `replay.module.css`). Do not edit
  `overview/`, `ui.module.css`, `ui.tsx`, `PageHero.tsx`, `pageHero.module.css` or other screens.
- Keep every figure, label meaning, link, export, filter, accessible name and `aria-*` attribute working. Copy changes
  limited to what the new heading placement needs.
- Phones: no horizontal page scroll at 360px; existing responsive behaviour keeps working.
- Remove CSS and helpers left unused by the change. Match the surrounding code's naming, comment density and idiom.
- Verify with `npm run typecheck` (repo root) and the screen's unit test
  (`cd frontend && npx vitest run components/dashboard/<screen>`). Update a unit test only where it asserts on markup
  that this plan deliberately changes. The e2e smoke test (`frontend/e2e/smoke.spec.ts`) checks each page's `h1`
  text (Warehouses, Carriers, Replay) and some figures; keep those true.
- Do not use Playwright or a browser; the user checks the UI.
- Commit only the files of your task (`git add <paths>`, never `git add -A`); other files in the tree may have
  unrelated uncommitted edits. Do not push.

## Task 1: Warehouses screen

Files: `frontend/components/dashboard/warehouses/WarehousesScreen.tsx`, `warehouses.module.css`,
`WarehousesScreen.test.tsx` (only if needed).

- Add the Overview-style page head above the `PageHero`: eyebrow `Before pickup`, `h1` `Warehouses`, chip actions
  Export CSV and Open replay (moved out of the hero's tools). The site filter (segmented buttons and the phone
  `<select>`) stays where it is.
- Hero: `variant="metric"`, no second `h1`, keeping its text and chips.
- Sections "Warehouse causes of lateness", "Sites", "Fixes to decide", "Weekly stock placement" and the finance
  section: heading inside the card per the Global Constraints, no icon tiles (`SectionHead` goes or becomes a plain
  `.head`). For "Warehouse causes of lateness" (three cause cards) and "Fixes to decide" (two fix cards), wrap each
  group in one `.panel` with the heading inside it, the cards nested within.
- Card shell, radius, shadow, h2/sub, tags and table header styles per the Global Constraints. The recent compact
  sizing of the Sites cards, the fix cards and the site map caption (bottom right) stays.

## Task 2: Carriers screen

Files: `frontend/components/dashboard/carriers/CarriersScreen.tsx`, `carriers.module.css`,
`CarriersScreen.test.tsx` (only if needed).

- Add the Overview-style page head above the `PageHero`: an eyebrow that fits the screen (`After pickup` or the
  hero's current eyebrow), `h1` `Carriers`, and the hero's action buttons as chip actions.
- Hero: `variant="metric"`, no second `h1`, keeping its text and chips.
- Every `SectionHead` section ("Which carrier for this lane?", backtest, tracking, override, and any other): heading
  inside its `.panel` per the Global Constraints, no icon tiles.
- Card shell, radius, shadow, h2/sub, tags and table header styles per the Global Constraints.

## Task 3: Replay screen

Files: `frontend/components/dashboard/replay/ReplayScreen.tsx`, `replay.module.css`,
`ReplayScreen.test.tsx` (only if needed).

- Page head: restyle to Overview's: add an eyebrow (`What-if scenarios`), keep `h1` `Replay`; the lede may stay as a
  `.sub`-style line under the title. Export CSV and Copy summary become Overview-style chips (Copy summary keeps its
  copied-state popover and `aria-live`).
- Every `SecHead` section (chart, assumptions, alternative scenarios, accounts at risk): heading inside its card per the
  Global Constraints, no icon tiles. "Alternative scenarios" and "Accounts at risk" get a `.panel` card if they are
  not in one.
- Card shell, radius, shadow, h2/sub, tags and table header styles per the Global Constraints.

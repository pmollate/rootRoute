# Implementer run: Task S2 (config-driven labels: ROADMAP L7, jury criterion 3.4)

- **Date:** 2026-10-30 · **Asked by:** lead agent · **Branch:** `S2-config-driven-labels` (from `main`, 392613f)
- **Plan:** no plan file; the brief, ROADMAP L7 and `SPEC-data-upload.md` §3, REQ-DATA-12, REQ-DATA-14, AC-DATA-21.
- **REQ:** REQ-DATA-12 (data line from the API), REQ-DATA-14 (window-relative dates), REQ-CAR-05, REQ-REP-01

## What changed
- **Python computes** (`backend/analytics/core/window.py`, new): `RECENT_MONTHS = 2`, `recent_start(d)` = first day of
  the window's last two calendar months, `window_info(d)` = first/last order day, recent start, deliveries, distinct
  fulfilment warehouses and carriers. No date literal is left in the analytics code.
- `carriers/backtest.py`: the fixed `SPLIT = 2026-08-01` is now `recent_start(d)`.
- `core/diagnosis.py`: segment `aug_sep` is `order_received_ts >= recent_start(d)` (key kept for the API contract);
  `kpis` gains `warehouses`, `carriers`, `window_from`, `window_to`, `recent_from` (days as epoch ms, UTC midnight, so
  the existing numeric `value` column holds them; no migration, no new table).
- **Node looks up** (`api/src/modules/warehouse/queries.ts`): `toOverview(rows)` maps `kpis` to the overview and adds
  `warehouses`, `carriers`, `windowFrom`, `windowTo`, `recentFrom` (`YYYY-MM-DD`, `null` when an older `kpis` lacks
  them). Same route, `GET /api/overview`.
- **Frontend:** `lib/dataWindow.ts` (`monthSpan`, `dataLine`, `periods`). `DashboardShell` reads `/api/overview`; the
  drawer and footer show "Supplied dataset" / "Loading…" / "Details unavailable" and "Computed from the supplied Halcyon
  dataset." until the API answers. `ReplayScreen`'s `aug_sep` button is named from the window ("Aug–Sep", fallback
  "Last two months"). `CarriersScreen`'s backtest heading and Train/Test chips come from the window (fallback "earlier
  months" / "last two months").
- Docs: ROADMAP L7 marked fixed with file list; CONTRACTS (`kpis` keys, `/api/overview` shape, `aug_sep` meaning);
  SPEC REQ-CAR-05 and REQ-REP-01 wording; SPEC-data-upload U5 and U16 "partly done"; ARCHITECTURE known limits.

## Regression check (the supplied data must give identical results)
Before any change, every core table plus `carrier_backtest` was dumped to CSV from `main`; after the change the same
dump was diffed: **all tables byte-identical** (`scenario_results` incl. the `aug_sep` segment, `cause_summary`,
`carrier_backtest`, ...), except `kpis`, which only gains the five new rows.

## Tests added
| Test | AC |
|---|---|
| `test_window.py::test_ac_data_01_recent_window_on_supplied_data_is_aug_sep` | AC-DATA-01, REQ-DATA-14 |
| `test_window.py::test_req_data_14_recent_window_follows_the_data` (Nov 2026–Feb 2027 → 1 Jan 2027; 3 months → 1 Dec) | REQ-DATA-14 |
| `test_window.py::test_ac_data_21_window_info_from_the_data` | AC-DATA-21 |
| `test_window.py::test_ac_data_01_aug_sep_segment_unchanged` (equals the old `month >= 8` mask) | AC-DATA-01 |
| `test_window.py::test_ac_data_01_backtest_unchanged_on_supplied_data` (n 15,041; 71.31% → 78.20%; $15.23 → $13.03) | AC-DATA-01, AC-CAR-05 |
| `test_window.py::test_req_data_14_backtest_split_moves_with_the_window` (dates + 1 year, same test orders) | REQ-DATA-14 |
| `test_diagnosis.py::test_ac_data_21_kpis_carry_the_data_line` | AC-DATA-21 |
| API `test/warehouse/overview.test.ts` (no DB): data line mapped, ISO days; missing keys → null | AC-DATA-21 |
| API `test/routes/warehouse.test.ts`: overview carries the data line (needs the test DB re-filled) | AC-DATA-21 |
| `lib/dataWindow.test.ts`: month spans across a year end, data line, train/test periods | AC-DATA-21, REQ-DATA-14 |
| `DashboardShell.test.tsx`: line from the API (1,234 deliveries, Nov 2026–Feb 2027); neutral line on 404, no `48,340` | AC-DATA-21 |
| `ReplayScreen.test.tsx`: `aug_sep` button named "Jan–Feb 2027" from the API; "Last two months" without it | AC-DATA-21 |
| `CarriersScreen.test.tsx`: backtest periods from the API; neutral names and no "Apr–Jul/Aug–Sep" without it | AC-DATA-21 |

## Commands and results
- Red first: `pytest test_window.py test_diagnosis.py` → ImportError (`window`); API `overview.test.ts` → 2 failed
  (`toOverview` missing); `DashboardShell.test.tsx` → 2 failed; Replay/Carriers → 3 failed. (`lib/dataWindow.test.ts`
  was written before the module but not run red.)
- `python -m pytest -q` (repo root, venv with requirements.txt): **78 passed, 2 skipped**.
- `npm --prefix frontend test`: **19 files, 123 passed**.
- `npm run typecheck`: exit 0 (frontend `tsc` and API `tsc`).
- `ruff check analytics`: all checks passed.
- API, touched files only: `npx vitest run test/warehouse/overview.test.ts test/routes/warehouse.test.ts` →
  **8 passed, 1 failed**: the new route assertion fails because the shared test DB holds `kpis` from an older pipeline
  run. Not re-filled here (another agent runs API tests on the same Postgres). Needs `npm run pipeline:test` once.

## Deviations from the brief
1. **`CompareCard.tsx` does not exist on `main`.** The Replay screen's line is already from the API
   (`ReplayScreen.tsx`: "Replayed on {int(o.data.deliveries)} orders"); nothing to change there. The Replay segment
   label and the Carriers backtest labels were fixed instead, as they used the same fixed months.
2. **Derived, not a setting:** the split and segment are "the last `RECENT_MONTHS` calendar months of the data"
   (REQ-DATA-14), a module constant like `CUTOFF_HOUR` in `core/load.py`; no env setting was added.
3. **Stored in `kpis`, not a new `analysis_info` table**, per the brief's "extend an existing table"; dates as epoch ms
   because `value` is numeric. When U8 builds `analysis_info` and U10 `/api/analysis/current`, the shell should switch.
4. **Segment key `aug_sep` kept** so the API enum, MCP tool schema and CONTRACTS do not change.

## Left for the reviewer
- Run `npm run pipeline:test` (and `npm run pipeline` for the dev DB) once, then the warehouse route test passes.
- Literals still in code (not simple to read from an existing response): `backend/api/src/modules/mcp/server.ts:13`
  MCP instructions "48,340 deliveries, Apr–Sep 2026"; `modules/mcp/tools.ts:35` "the 94% benchmark" in a tool
  description; tracking demo day `2026-09-10` (`CarriersScreen.tsx:25`, `modules/carriers/routes.ts:31`, tied to the
  synthetic feed); `TARGET = 0.95` (Overview, Replay; a team target, documented as such); landing page copy
  (`frontend/config/copy.ts`, `config/scenes.ts`, `components/sections/Deliver.tsx`: 48,340, 71.0%, 88.5%, 5 warehouses,
  6 carriers, 280 clients; static marketing page, no API); `IntakeScreen.tsx:369` sample draft time (synthetic form default).
- REQ-DATA-16 (skip the backtest under three months of history) is not built.

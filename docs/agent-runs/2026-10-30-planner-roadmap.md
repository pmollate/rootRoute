# planner · roadmap · 2026-10-30

**Asked by:** team (via orchestrating agent) · **Branch / commit:** `B30-limitations-and-roadmap` from `main` 98e4f38
**Request:** Write an honest known-limitations list and a prioritised roadmap to production, including what breaks at
10× load and what can be reused for another client (jury scorecard 7.4, also 4.2).

## What it did
- Read `CLAUDE.md`, `README.md`, `docs/SPEC.md` §1.2, §3, §9.2, §12, all of `docs/SPEC-data-upload.md`,
  `backend/analytics/core/load.py`, `core/db.py`, `pipeline.py`, `infra/setup.sh`, `.github/workflows/cd.yml`.
- Checked each claim in the code: fixed rules at `load.py:16-20`; cut-off uses `dt.hour` with no zone (`load.py:25-27`);
  whole-CSV read (`load.py:49`); exclusive lock and full replace (`db.py:36-44`); Node-only App Service
  (`setup.sh:58`) and B1 / B1ms tiers (`setup.sh:37,56`); pipeline only in CD (`cd.yml:143-155`); fixed backtest
  split (`backtest.py:9`) and `aug_sep` (`diagnosis.py:34`); hard-coded 48,340 in `DashboardShell.tsx:69-70,100`;
  in-memory cache (`cache.ts:3`); flags off by default (`config.ts:34,39`); model trained once (`model_report.md`).
- Sizes for 10× / 100× scaled from `deliveries.csv` (48,340 rows, 7.7 MB). No timed run exists
  (`docs/TEST-EVIDENCE.md` absent); the doc says so and points to AC-DATA-23 / U17.

## Output
- `docs/ROADMAP.md`: what works (5 bullets), 15 known limitations with evidence, 10× / 100× / billions table,
  reuse section, Now / Next / Later roadmap (18 steps, effort labelled as estimates) linked to U-tasks, REQ/AC ids
  and scorecard criteria.
- No plan files changed: the steps map onto existing tasks U1–U17 in SPEC-data-upload §10 plus new items
  (time zones, "late with no known cause" alert, retraining, multi-tenant, warehouse storage, pilot measurement).
- README.md and SPEC.md not edited (owned by other agents).

## Handed to
- `spec-writer`: new requirements not yet in any SPEC: "late with no known cause" alert (N4), zone-aware cut-off
  (N2), model retraining gate (X5), multi-tenant isolation (T1). Each needs REQ/AC ids before planning.
- Team: link `docs/ROADMAP.md` from the README and the submission deck (scorecard 7.4).

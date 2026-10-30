# implementer · S3: timed scale run (1×, 10×, second client) · 2026-10-30

**Task:** S3 from the lead (no plan file): a timed 10× run, a second-client reuse run and "what breaks at 10×" for
jury criterion 4.2, replacing ROADMAP §3's "No timed run at 10× exists yet". **Branch:** `S3-timed-scale-run`, cut
from `main` at `392613f`. **ACs:** SPEC-data-upload AC-DATA-23, NFR-DATA-02 (and AC-DIAG-01 / SPEC §2.4 golden
figures as the correctness check). Not pushed; no PR.

## What was added
- `backend/analytics/scaledata.py`: SD-09 generators. `write_replica(src, out, factor)` (N× copy, copies 1..N-1 get
  `-Rkk` ids, seeded interleave, `manifest.json` + `SYNTHETIC.txt`) and `write_second_client(src, out)` (synthetic
  "Northwind Freight": clients N1001–N1280, carriers ATLAS…FJORD, warehouses DC1–DC5, dates −2,191 days, and
  `client_profile.json`). Read and written as strings; never touches `Halcyon-Hackathon-Dataset/`.
- `backend/synthetic-data/generators/sd09_scale.py`: thin generator script (same pattern as SD-05/SD-06); SD-09 in the
  register (`backend/synthetic-data/README.md`).
- `backend/analytics/bench.py`: runs `load()` + the pipeline's own `STEPS` on a data folder, one subprocess per
  dataset; per-step wall time, peak RSS (`ru_maxrss`), optional tracemalloc pass, optional write timing to a throwaway
  database (refuses `latelens`, `latelens_test`, `DATABASE_URL`, `TEST_DATABASE_URL`); 16 golden checks; machine info;
  results to `backend/synthetic-data/out/scale/results.json`.
- `npm run bench` (root `package.json`, forwards like `pipeline`); one line in `README.md`.
- `docs/SCALE-RUN.md` (results, correctness, reuse, how to repeat); ROADMAP intro, L4, L5, §3 table and note, §4
  "Measured with a second client", X2 row, and shifted `load.py` / `backtest.py` line references.

## Analysis code changed (smallest change)
1. `core/load.py`: `FRIDAY_CAP_CARRIER = "D"` constant; `f_d_friday` uses it. `carriers/backtest.py`: the Friday plan
   excludes `core.FRIDAY_CAP_CARRIER` instead of a literal `"D"`. Needed so a client profile can name its own carrier.
   Same values for Halcyon; all golden tests unchanged.
2. `core/context.py`: `Ctx.tracking_dir` (default `None` = the shared `synthetic-data/out/tracking`);
   `carriers/__init__.py` writes and reads the feeds there. Needed so the bench (and tests) do not overwrite the shared
   tracking feeds with 10× or second-client events. `npm run pipeline` behaviour unchanged.

## Tests added (`backend/analytics/tests/test_scale.py`, 6 tests, ~12 s)
| Test | ACs |
|---|---|
| `test_ac_data_23_replica_is_seeded_labelled_and_unique` | AC-DATA-23 (2× store from supplied data, unique ids, same columns, penalties doubled, manifest `synthetic`, same bytes on a second generation) |
| `test_ac_data_23_nfr_data_02_steps_timed_with_peak_memory` | AC-DATA-23, NFR-DATA-02 (load + 4 steps each with seconds and peak memory) |
| `test_ac_data_23_replica_keeps_the_golden_rates` | AC-DATA-23 with AC-DIAG-01 / SPEC §2.4 (71.0%, late/penalties/handling ×2, 88.5 / 85.9, points within 0.06) |
| `test_ac_data_23_second_client_runs_with_a_profile_only` | AC-DATA-23 reuse (renamed ids/carriers, 2020 dates, same figures, backtest non-empty) |
| `test_bench_write_refuses_the_app_databases` | SPEC §4.2 one writer per table (guard on `--db-url`) |
| `test_profile_overrides_are_restored` | profile applied for one run only |

The first module run failed for the expected reason (`ImportError: cannot import name 'bench'`). Then
`points_lost.f_route` was 3.15 vs the deck's 3.2: the checks now use the 0.06 tolerance `test_scenarios.py` already
uses. The `--db-url` guard was written before its test (test added straight after; it would have failed on the
missing `throwaway`).

## Commands and results
- `python -m pytest -q` (venv, Python 3.13.12) before: 71 passed, 2 skipped. After: **77 passed, 2 skipped** (+6).
- `ruff check backend/analytics backend/synthetic-data/generators`: all checks passed.
- `python backend/synthetic-data/generators/sd09_scale.py`: wrote `out/scale/x10` (deliveries 79.9 MB) and
  `out/scale/second-client`.
- `python -m analytics.bench --trace` (no DB): x1 4.49 s, x10 17.88 s analysis; all golden checks pass.
- `python -m analytics.bench --trace --db-url …/latelens_bench_s3` (the reported run, 16:34): 1× analysis 4.19 s +
  write 27.65 s, peak RSS 269 MB; 10× analysis 19.42 s + write 275.67 s, peak RSS 1,323 MB; second client 4.19 s +
  28.57 s, 319 MB; second client without profile fails in `carriers`. 16/16 golden checks pass on all three.
- Per-table write split at 1× and partial-profile runs: scratch scripts (not committed), results in `docs/SCALE-RUN.md`.
- The throwaway database `latelens_bench_s3` was created on `root-route-db-1` for the run and dropped afterwards;
  `latelens` and `latelens_test` were not written.
- Not run: Node API tests, frontend tests, `npm run typecheck` (no Node or frontend code changed; `package.json` only
  gains a script), `npm run pipeline` (would write the shared `latelens` DB, which the lead asked us not to touch).

## Deviations
1. AC-DATA-23 says results go in `docs/TEST-EVIDENCE.md`; the lead asked for `docs/SCALE-RUN.md`. TEST-EVIDENCE is
   rewritten by the qa-evidence agent, so it was not edited; the next qa-evidence run should link SCALE-RUN.md.
2. AC-DATA-23 assumes the data store (U1–U9); none exists yet, so the run reads CSV folders. "Full-window" = whole file.
3. The client profile is applied by the bench (overriding named module constants for one run), not by
   `npm run pipeline`. Making the pipeline read it is ROADMAP N1.

## For the reviewer
- Measured finding that changes ROADMAP §3: the analysis is not what breaks first at 10× (19 s, 1.0 GB); the table
  write is (276 s under an exclusive lock; 90% in `deliveries_clean`, `carrier_events`, `delivery_causes`). The §3
  "does not grow" sentence was corrected: the API does query those three row-level tables.
- Reuse finding: without the profile the second client is silently wrong once it gets past the tracking adapters
  (lane cause 0.0 points, as built 79.9%, backtest on 0 orders). Worth a guard in N1 (e.g. fail when a configured
  carrier or lane is absent from the data, or when the backtest test set is empty).
- Limits found, not fixed: `warehouse/stock.py: assign_skus` needs client ids of one letter + digits; tracking file
  names break on carrier codes with `_`; empty API feed files crash `read_feeds`; labels say "Carrier D".
- SD-05 stock tables do not scale exactly 10× (random SKU per delivery); synthetic, outside headline figures.
- 100× figures in ROADMAP/SCALE-RUN are straight-line estimates and labelled so.
- `npm run data` now also builds SD-09 (about 90 MB in `out/scale/`, a few seconds).

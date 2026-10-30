# Scale run: 1×, 10× and a second client, timed

Date: 30 Oct 2026 · Task: S3 (`S3-timed-scale-run`) · ACs: SPEC-data-upload AC-DATA-23, NFR-DATA-02 · Related:
`docs/ROADMAP.md` §3–4 · Raw results: `backend/synthetic-data/out/scale/results.json` (gitignored; rebuilt by the run)

Every figure below was measured on the machine listed, in one run of `npm run bench -- --trace --db-url <throwaway>`
started 30 Oct 2026 16:34. Figures labelled **estimate** are not measured.

## What was run

The same code as `npm run pipeline`: `load()` (read CSVs, five cause flags, SPEC §5.1) and the pipeline's four steps
(`core` = diagnosis, attribution, replay; `warehouse`; `carriers` = lane scores, capacity, backtest, tracking feeds;
`intake` = risk lookup), then the table write. Each dataset runs in its own Python process so its peak memory is its
own. The write went to a **throwaway database** (`latelens_bench_s3`, created for the run and dropped afterwards), never
`latelens` or `latelens_test`; without `--db-url` the bench writes nothing.

| Dataset | What it is | Deliveries | `deliveries.csv` | All input CSVs |
|---|---|---|---|---|
| 1× | The supplied `Halcyon-Hackathon-Dataset/` | 48,340 | 7.7 MB | 7.9 MB, 53,535 rows |
| 10× | SD-09 synthetic replica: 10 copies of every delivery, new ids for copies 1–9, rows interleaved by order time with a seeded shuffle | 483,400 | 79.9 MB | 81.6 MB, 532,524 rows |
| Second client | SD-09 synthetic "Northwind Freight": other client, delivery, order, carrier and warehouse codes, dates moved to Apr–Sep 2020 | 48,340 | 8.0 MB | 8.2 MB, 53,535 rows |

Machine: Apple M5, 10 cores, 16 GB RAM, macOS 27.2 (arm64); Python 3.13.12, pandas 3.1.0, numpy 2.5.4; Postgres 16 in
Docker on the same laptop.

## Results

Wall time per step, in seconds:

| Step | 1× | 10× | Second client | 10× ÷ 1× |
|---|---|---|---|---|
| load (read CSVs + flags) | 0.10 | 0.72 | 0.08 | 7.2 |
| core (diagnosis, attribution, replay) | 0.55 | 5.57 | 0.53 | 10.1 |
| warehouse | 2.64 | 3.64 | 2.67 | 1.4 |
| carriers (incl. synthetic tracking feeds) | 0.89 | 9.47 | 0.91 | 10.6 |
| intake | 0.01 | 0.02 | 0.00 | — |
| **Analysis total** | **4.19** | **19.42** | **4.19** | **4.6** |
| Table write to Postgres (`to_sql`, one transaction) | 27.65 | 275.67 | 28.57 | 10.0 |
| **Total** | **31.84** | **295.09** | **32.76** | **9.3** |

Memory, in MB:

| | 1× | 10× | Second client |
|---|---|---|---|
| Peak resident memory, analysis only (after `intake`) | 236 | 1,017 | 253 |
| Peak resident memory, including the write | 269 | 1,323 | 319 |
| Largest per-step Python/numpy allocation peak (tracemalloc, the `carriers` step) | 97 | 958 | 97 |
| Result rows written (25 tables) | 338,659 | 2,997,363 | 338,659 |

tracemalloc peaks per step (1× / 10×): load 30 / 300, core 63 / 631, warehouse 62 / 596, carriers 97 / 958,
intake 73 / 714. They come from a second pass with tracing on (tracing slows the steps 2–6×, so its times are not
used). A repeat without the write, minutes earlier, gave analysis totals of 4.49 s (1×) and 17.88 s (10×).

Where the write time goes (1×, each table written on its own, same throwaway database): `deliveries_clean` 11.0 s
(38%), `carrier_events` 8.8 s (31%, 193,360 rows), `delivery_causes` 6.1 s (21%), `stock_daily` 2.0 s (7%); the
other 21 tables together about 1 s.

## Correctness check

The bench compares 16 figures with the golden 1× numbers (CLAUDE.md "Key numbers", SPEC §2.2, §2.4). Rates must
match to 0.1 point; counts must be the factor × the 1× count; points of on-time lost must be within 0.06 of the deck
(the tolerance `test_scenarios.py` already uses; the deck rounds route's 3.15 up to 3.2).

| Figure | Golden | 1× | 10× | Second client |
|---|---|---|---|---|
| On-time | 71.0% | 71.0% | 71.0% | 71.0% |
| Late deliveries | 14,019 (× factor) | 14,019 | 140,190 | 14,019 |
| Penalties | $872,460 (× factor) | $872,460 | $8,724,600 | $872,460 |
| Late-delivery handling | $476,646 (× factor) | $476,646 | $4,766,460 | $476,646 |
| Points lost: lane / address / warehouse / cut-off / route | 7.6 / 7.0 / 5.6 / 5.6 / 3.2 | 7.63 / 7.05 / 5.61 / 5.57 / 3.15 | same | same |
| Replay: route only / lanes + routes / as built / all but routes | 73.6 / 80.4 / 88.5 / 96.3% | 73.6 / 80.4 / 88.5 / 96.3% | same | same |
| Expected adoption: as built / full programme | 85.9 / 92.0% | 85.9 / 92.0% | same | same |
| Result: **16 of 16 checks pass** | | pass | pass | pass |

Also identical across the three runs (reported, not in the 16): late share with a cause before pickup 67.3%, 15
blocked lanes, carrier backtest 71.3% actual vs 78.2% recommended (15,041 test orders at 1×, 150,410 at 10×).
Two warehouse tables built from synthetic stock (SD-05: `stock_daily`, `placement_suggestions`) do not scale by
exactly 10×, because SD-05 draws a random SKU per delivery and ten copies spread over more SKUs. They are synthetic
and outside the headline figures (REQ-REP-04).

## Reuse for a second client

The second client has nothing in common with Halcyon's labels: clients `N1001`–`N1280`, deliveries `NW…`, carriers
ATLAS, BOREAL, CEDAR, DUNE, EMBER, FJORD, warehouses DC1–DC5, and every date 2,191 days (313 weeks) earlier, so weekdays
and calendar months match. The only extra input is `client_profile.json` (4 keys, generated with the data):

| Key | Halcyon value (in code) | Second client |
|---|---|---|
| `bad_lanes` | D→Midwest, D→Southeast, E→West, F→Northeast, F→Southeast | the same lanes under DUNE, EMBER, FJORD |
| `friday_cap_carrier` | `D` | `DUNE` |
| `backtest_split` | 2026-08-01 | 2020-08-01 |
| `tracking_feeds` | API: A, B, C · portal: D · batch: E, F | API: ATLAS, BOREAL, CEDAR · portal: DUNE · batch: EMBER, FJORD |

**Analysis code changed for the second client: none.** With the profile, all 25 tables build and every checked figure
equals Halcyon's (table above). One code change was made once, in this task, so the profile could reach every rule:
the Friday-cap carrier was a literal `"D"` in two files and is now the constant `FRIDAY_CAP_CARRIER` (`load.py`,
`backtest.py`; 3 lines). The bench applies the profile for one run (`analytics/bench.py: client_profile`);
`npm run pipeline` does not read it yet (ROADMAP N1).

What happens without the profile, measured by running the second client with parts of it left out:

| Profile given | Result |
|---|---|
| None | Fails in the `carriers` step: the tracking adapter expects feeds from carriers A, B and C (`AttributeError … shipment_ref`) |
| `tracking_feeds` only | Runs, and is **silently wrong**: on-time 71.0% and late 14,019 are right, but the lane cause drops from 7.63 to 0.0 points, "as built" replay reads 79.9% instead of 88.5%, 21 lanes are blocked instead of 15, and the backtest has 0 test orders |
| + `backtest_split` | Backtest back to 15,041 test orders; lane cause still 0.0 points |
| + `friday_cap_carrier` | Lane cause 2.67 points, as built 82.9% |
| + `bad_lanes` (all four keys) | Every figure equals Halcyon's |

So the risk for a new client is not a crash but a quiet under-count of the carrier cause. The fix in ROADMAP N1 (bad
lanes derived from the client's data, gated on matching the known lanes) removes the need to type them in.

Other limits found while building the second client (not fixed here):
- Client ids must be one letter followed by digits: the synthetic SKU generator reads `client_id[1:]` as a number
  (`analytics/warehouse/stock.py: assign_skus`).
- Carrier codes must not contain `_`: tracking file names are split on it (`analytics/carriers/tracking.py`).
- Labels still name Halcyon's carrier ("Carrier D on a Friday", `analytics/core/diagnosis.py`), and the replay's
  `aug_sep` segment is fixed to months 8–9.

## What this says about 10× and beyond

Measured at 10×: the analysis is not what breaks first. It takes 19 s and about 1.0 GB, both well inside a laptop or a
CI runner. What breaks first is the **write**: 276 s (4.6 min) with an `ACCESS EXCLUSIVE` lock on every result table,
so the dashboard's reads wait for the whole write (L5). At 1×, 90% of it is three row-level tables (`deliveries_clean`,
`carrier_events`, `delivery_causes`) that the API queries for lookups by delivery id and the tracking at-risk list;
the other tables write in under a second together (1×).
Second: memory. 1.0–1.3 GB at 10× would not fit next to Node on the current B1 App Service plan (1.75 GB) once
Python runs beside the API (U15).

**Estimates** (straight-line from the two measured points; not measured): at 100× (4.8 M deliveries, about 800 MB
CSV) the analysis would take about 3 minutes and need about 10 GB, and the write about 45 minutes under the lock.
Python loops that run per (week, client) in `warehouse` stayed flat here only because the replica keeps 280 clients;
with 10× the clients they would grow too.

## How to repeat

```bash
python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
npm run bench                         # builds out/scale/x10 and out/scale/second-client if missing; no DB write
npm run bench -- --trace              # adds a tracemalloc pass per dataset
npm run bench -- --db-url postgres://…/latelens_bench   # also times the write: a THROWAWAY database only
python backend/synthetic-data/generators/sd09_scale.py --factor 20   # another factor; then
cd backend && python -m analytics.bench --factor 20
```

Results print one line per dataset and go to `backend/synthetic-data/out/scale/results.json`. The fast test
`backend/analytics/tests/test_scale.py` (2× replica and the second client, about 12 s) runs with `npm run test:py`.

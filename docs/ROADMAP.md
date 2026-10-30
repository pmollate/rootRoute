# Root Route: known limitations and roadmap to production

Date: 30 Oct 2026 · Status: submission version · Owner: team · Related: `docs/SPEC.md` (§1.2, §3, §9.2, §12),
`docs/SPEC-data-upload.md` (tasks U1–U17)

This is an honest list of what Root Route does not do yet, what breaks as data grows, and the order in which we would
fix it. Effort figures are **rough team estimates in person-days**, not measurements. The 1× and 10× run times and
memory in §3, and the second-client run in §4, were measured (`docs/SCALE-RUN.md`); every 100× and larger figure is an
estimate and says so.

## 1. What works today

- The Python pipeline reads the supplied dataset, marks each delivery with the five causes (SPEC §5.1) and writes the
  result tables the dashboard reads (`backend/analytics/pipeline.py`).
- Every screen (Overview, Order emails, Warehouses, Carriers, Complaints, Order journey, Replay) shows figures computed
  from that data, with role-based access (README "What it does").
- The email intake agent reads orders, checks addresses and drafts replies; a person approves every order before WMS
  entry and outbound mail goes only to an allow-list (SPEC §5.3, §8).
- CI and CD on GitHub Actions build, migrate, run the pipeline against Azure Postgres, deploy and run end-to-end tests
  (`.github/workflows/cd.yml`).
- Replay shows what each fix would have changed on past deliveries (SPEC §5.8).

## 2. Known limitations

| # | Limitation | Why it matters | Evidence |
|---|---|---|---|
| L1 | Cause rules are fixed in code: 08:00 cut-off, 20% route overrun, carrier D on Fridays, and a fixed list of five bad lanes | A new client, a new season or a changed carrier contract needs a code change and a deploy; the bad lanes are not re-learned from new data | `backend/analytics/core/load.py:16-21` |
| L2 | The cut-off check uses the timestamp's hour with no time zone | Halcyon's time zone is unconfirmed; a client in another zone, or data stored in UTC, would mark the wrong orders as after the cut-off | `load.py:26-28`; SPEC §12 `[HALCYON_TIMEZONE]` |
| L3 | Input is CSV files in `Halcyon-Hackathon-Dataset/`; no upload, no store, no sync from the client's database, no validator | The jury or a client cannot run their own data from the UI; bad rows are not rejected with a readable message | `load.py:48-55`; SPEC-data-upload §1, §3 (U1–U17 all `todo`) |
| L4 | The whole CSV is read into pandas memory and the whole history is analysed on every run | Memory and run time grow with total history, not with the window anyone looks at (measured: analysis 4.2 s / 236 MB at 1×, 19.4 s / 1.0 GB at 10×) | `load.py:50`; `pipeline.py:22-33` |
| L5 | Each run replaces every result table in one transaction, taking an exclusive lock on all of them first | Measured: the write takes 27.7 s at 1× and 275.7 s at 10×, and readers wait while it holds the lock (§3) | `backend/analytics/core/db.py:36-44`; `docs/SCALE-RUN.md` |
| L6 | On Azure the API app runs Node only; Python runs only inside GitHub Actions CD | No analysis can be started on demand on the deployed app; new results need a push to `main` | `infra/setup.sh:58` (`NODE:24-lts`); `cd.yml:143-155` |
| L7 | Date logic is fixed to this dataset: backtest split 1 Aug 2026, an "Aug–Sep" segment, and "48,340 deliveries · Apr–Sep 2026" in the shell | Any other date range gives a wrong split or a wrong label | `analytics/carriers/backtest.py:10`; `analytics/core/diagnosis.py:34`; `frontend/components/dashboard/DashboardShell.tsx:69-70,100` |
| L8 | The supplied data is synthetic and built so the five causes explain every late delivery | Real data will have late deliveries with no known cause, duplicates, late-arriving updates and missing fields; today nothing alerts on "late, cause unknown" | SPEC §12 ("a delivery with no flag is never late"); CLAUDE.md key numbers |
| L9 | Single tenant: Halcyon only, no tenant id on any table or route | A second client cannot share the deployment without seeing Halcyon's data | `backend/db/migrations/` (no tenant column) |
| L10 | The LightGBM carrier risk model was trained once (Apr–Jul train, Aug–Sep test) and is not retrained | Carrier performance drifts; the model will age silently | `backend/carrier-optimization-engine/model_report.md`; SPEC-data-upload §9 |
| L11 | Replay is a what-if on past data; there is no before/after measurement once fixes go live | We cannot yet show that a fix moved on-time in production | SPEC §9.2 (pilot design, not built) |
| L12 | The API keeps Python-computed tables in memory "while the server runs" | After a new analysis the API must be restarted (or the cache cleared) to show it | `backend/api/src/core/cache.ts:3` |
| L13 | Ask assistant (D10) and one-time address link (E19) are built after submission and off by default | They are not part of the submitted, tested behaviour; E19 refuses to start until A17 lands | `backend/api/src/core/config.ts:34,39,49`; SPEC §3 "After submission" |
| L14 | Hosting is the smallest tier: one B1 App Service plan for both apps, Postgres Burstable B1ms with 32 GB storage | Fine for a demo; not sized or load-tested for production traffic or history | `infra/setup.sh:37,56` |
| L15 | Adoption rates, carrier spare capacity and the second pick run are team assumptions | The programme estimate (85.9% as built) depends on them | SPEC §12 assumptions; §1.2 |

## 3. What breaks at 10× and beyond

**Measured at 1× and 10×** (`docs/SCALE-RUN.md`, `npm run bench`, 30 Oct 2026; Apple M5 laptop, 16 GB, Postgres 16 in
Docker): the full pipeline on the supplied data and on a seeded 10× synthetic replica (SD-09), with time per step and
peak memory. The 10× run gives the same rates as 1× and exactly ten times the counts (16 of 16 golden checks pass), so
the code stays correct at that volume. Rows marked **estimate** are not measured.

| Scale | Size | Time and memory | What breaks first | Fix |
|---|---|---|---|---|
| 1× (today) | 48,340 deliveries, 7.7 MB CSV (measured) | Analysis 4.2 s, peak 236 MB; table write 27.7 s; total 31.8 s, peak 269 MB (measured) | Nothing; runs in CD on every push. Even now 87% of the run is the table write | — |
| 10× | 483,400 deliveries, 79.9 MB CSV (measured, synthetic) | Analysis 19.4 s, peak 1.0 GB; table write 275.7 s; total 295.1 s, peak 1.3 GB (measured) | (1) **The write (L5), measured:** 4.6 min of `to_sql` in 1,000-row chunks under an exclusive lock on every result table, so dashboard reads wait the whole time; 90% of it (split per table at 1×) is the three row-level tables `deliveries_clean`, `carrier_events`, `delivery_causes`. (2) Memory: 1.0–1.3 GB would not fit next to Node on the B1 App Service plan (1.75 GB) once Python runs beside the API (L6, L14). (3) No upload path for a file this size (L3); `UPLOAD_MAX_ROWS` is planned at 500,000. The whole-history pandas analysis (L4) is **not** the first limit here: 19 s. | Write only aggregates in the run and serve row-level views from the store with an index, or bulk `COPY` into a new table and swap it in (no long lock); store + windowed read on an indexed `order_received_ts` (U1, U2, NFR-DATA-05); background job with progress (U9); Python next to the API with more memory (U15) |
| 100× | ~4.8 M deliveries, ~800 MB CSV (**estimate**) | **Estimate**, straight-line from the two measured points: analysis ~3 min and ~10 GB; table write ~45 min under the lock | Memory on one machine (more than a standard GitHub-hosted runner or a small App Service tier has); the write; CSV upload through an HTTP body; B1ms Postgres (L14). Per-(week, client) Python loops in the warehouse step grow with the number of clients (flat in the replica, which keeps 280) | Incremental processing: only re-flag new or changed deliveries and update aggregates by day; write result tables by swapping a new version in instead of rewriting; sync from the client's database instead of uploads (U7); bigger Postgres tier with table partitioning by month; job worker separate from the web API |
| Billions | Many clients × years of history (**estimate**) | Not estimated: beyond one machine | Postgres as the analysis store; any design that re-reads history; per-client copies of code rules | Columnar warehouse storage partitioned by tenant and date (for example Azure Synapse / Fabric warehouse, or Parquet in Data Lake with Spark or DuckDB per partition); flags computed once at ingest and kept; dashboard reads pre-aggregated tables only; rules and lanes as per-tenant configuration |

What does **not** grow with volume (measured): the aggregate tables most screens read (`kpis`, `cause_summary`,
`scenario_results`, `lane_scores`, `risk_lookup` and the rest) have the same row counts at 10× as at 1×, and the cause
rules are per-row and independent, so they split cleanly by date and by tenant. What does grow: `deliveries_clean`,
`delivery_causes` (483,400 rows at 10×) and `carrier_events` (1.93 M), which the API also queries (lookups by delivery
id, the tracking at-risk query). Their query times at 10× were not measured; `to_sql(if_exists="replace")` recreates
them without indexes on each run.

## 4. Reuse for another client or another logistics company

**Measured with a second client** (`docs/SCALE-RUN.md` "Reuse"): a synthetic "Northwind Freight" built from the
supplied deliveries with other client ids (`N1001`–`N1280`), other carrier codes (ATLAS…FJORD), other warehouse codes
(DC1–DC5) and dates moved to Apr–Sep 2020. With **no analysis code change** and a 4-key `client_profile.json` (bad
lanes, Friday-cap carrier, backtest split date, which carriers send API / portal / batch feeds), all 25 tables build
in 4.2 s and every checked figure equals Halcyon's (71.0% on-time, 14,019 late, attribution 7.6 / 7.0 / 5.6 / 5.6 /
3.2, replay 88.5% as built). Without the profile the run fails at the tracking adapters; with only the feeds named it
runs but is **silently wrong** (carrier-lane cause 0.0 points instead of 7.6, "as built" 79.9% instead of 88.5%,
backtest on 0 orders). Two more limits found: client ids must be a letter plus digits (synthetic SKU generator) and
carrier codes must not contain `_` (tracking file names). The profile is applied by the bench only; the pipeline does
not read it yet (N1).

**Carries over as is**
- The screens and their layout: Overview, Warehouses, Carriers, Complaints, Order journey, Replay, roles and sign-in.
- The cause framework: every late delivery traced to a cause before or after pickup, points of on-time lost per
  cause, a "fair data" view for carrier scoring, and a replay per fix.
- The pipeline shape: load → flag → per-area build steps → result tables, one writer per table (SPEC §4.2).
- The agents and their guard rails: email intake with human approval, complaint triage, Ask over read-only tools.
- CI/CD, Key Vault for secrets, the test suite pattern.

**Must change**
- **A canonical data schema plus a mapping per client.** Today the column names are the Halcyon data dictionary.
  Each client needs a mapping from their systems onto source views (SPEC-data-upload §2.1, Q-DATA-01).
- **Rules as configuration, per client:** cut-off hour and time zone, route overrun threshold, capacity days, lane
  thresholds (`MIN_N`, `MAX_LATE` in `analytics/carriers/lanes.py`), with bad lanes derived from the data (U4).
- **Reference data per client:** warehouses, regions, carriers, distances are Halcyon's today (warehouses W1–W5,
  carriers A–F are hard limits in the planned validator, SPEC-data-upload §6.2).
- **A tenant id** on every stored row, result table, job, audit row and API route, and tests that one tenant cannot
  read another's data.
- **Auth per tenant:** an Entra ID tenant or app registration per client, roles assigned per tenant
  (SPEC-auth, Q-AUTH-01/02).
- **Mailbox per client:** the intake reads Gmail; Outlook needs Microsoft Graph behind the same calls (SPEC §12).

## 5. Prioritised roadmap to production

Effort is a **rough estimate in person-days** for one developer who knows the code; it excludes client-side work
(data mapping, approvals). Order = what unblocks the most, first.

### Now (next 2–3 weeks): run on the client's own data, correctly

| Step | What | Effort (est.) | Links |
|---|---|---|---|
| N1 | Rules as configuration (cut-off, overrun, Friday rule, lane thresholds) and bad lanes derived from the window's data, gated on matching today's five lanes | 2–3 | U4, AC-DATA-05; L1; scorecard 3.4 |
| N2 | Confirm the time zone and make the cut-off check zone-aware (daylight saving included) | 1–2 | SPEC §12 `[HALCYON_TIMEZONE]`; L2 |
| N3 | Data store, validator with readable errors, seed, CSV upload page | 8–10 | U1, U3, U6, U13; REQ-DATA-01/02/04/05; L3; scorecard 2.1, 2.2 |
| N4 | "Late with no known cause" count on Overview and an alert when it rises, so real data's unexplained lateness is visible, not hidden | 2 | L8; SPEC §12 |
| N5 | Window-relative dates and the data line read from the API (no fixed 48,340 or Apr–Sep) | 2–3 | U5, U16; AC-DATA-21; L7 |
| N6 | Python next to the API on Azure (one image with Node and Python, or a small Python service) and a job runner, so an analysis starts from the UI | 4–5 | U9, U10, U15; L6, L12 |

### Next (1–2 months): scale to 10× and prove the fixes work

| Step | What | Effort (est.) | Links |
|---|---|---|---|
| X1 | Windowed reads from the store and incremental processing (only new or changed deliveries re-flagged) | 4–6 | U2, U8; NFR-DATA-05; L4 |
| X2 | Timed 1× and 10× runs: **done for the pipeline** (`docs/SCALE-RUN.md`, `npm run bench`). Left: repeat on the data store and upload path once U1–U9 exist, time the API queries on the 10× row-level tables, and set limits from the results | 1–2 | U17, AC-DATA-23, NFR-DATA-02; scorecard 4.2 |
| X3 | Read-only sync from the client's database and a daily scheduled run | 4–5 | U7, U11; REQ-DATA-03/15 |
| X4 | Before/after measurement: the 8-week pilot with treatment and control warehouses, weekly per-cause KPIs, stop rule at week 4 | 3 build + 8 weeks run | SPEC §9.2, §1.2; L11 |
| X5 | Model retraining on a schedule, with a holdout check that must beat the lane lookup before a new model is used | 3–4 | L10 |
| X6 | Results kept per window, so earlier windows open without a re-run | 2–3 | Q-DATA-03 |
| X7 | Production hosting: larger App Service and Postgres tiers, backups, alerts, load test of the API | 3–4 | L14 |

### Later (quarter): many clients, billions of rows

| Step | What | Effort (est.) | Links |
|---|---|---|---|
| T1 | Multi-tenant: tenant id everywhere, per-tenant rules and reference data, per-tenant sign-in and roles, isolation tests | 10–15 | L9; Section 4; scorecard 4.2 reuse |
| T2 | Canonical schema and a mapping layer per client (onboarding kit) | 5–8 per platform, plus client time | Q-DATA-01 |
| T3 | Warehouse-scale storage: partition by tenant and month; move history to a columnar store (Azure Synapse / Fabric, or Parquet in Data Lake) with the pipeline running per partition | 15–20 | Section 3 "Billions" |
| T4 | Separate job workers from the web API, with a queue, so several analyses and tenants run in parallel | 5–8 | SPEC-data-upload §9 (deferred) |
| T5 | Turn on D10 Ask assistant and E19 address link after their open questions close (Maps credential owner, real-client page review) | 2–4 | L13; SPEC §12 Q-ASK, Q-LINK |

## 6. What we are not planning

Root Route shows what the client's data says and stops there. The roadmap does not add contract verdicts, vendor
modelling or automatic business decisions (CLAUDE.md product rule). Any LLM stays out of ingest and analysis
(SPEC-data-upload §9).

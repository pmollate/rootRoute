# Root Route: known limitations and roadmap to production

Date: 30 Oct 2026 · Status: submission version · Owner: team · Related: `docs/SPEC.md` (§1.2, §3, §9.2, §12),
`docs/SPEC-data-upload.md` (tasks U1–U17)

This is an honest list of what Root Route does not do yet, what breaks as data grows, and the order in which we would
fix it. Effort figures are **rough team estimates in person-days**, not measurements. No run time or memory figure in
this file was measured; where a number is a size, it is calculated from the supplied dataset and says so.

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
| L1 | Cause rules are fixed in code: 08:00 cut-off, 20% route overrun, carrier D on Fridays, and a fixed list of five bad lanes | A new client, a new season or a changed carrier contract needs a code change and a deploy; the bad lanes are not re-learned from new data | `backend/analytics/core/load.py:16-20` |
| L2 | The cut-off check uses the timestamp's hour with no time zone | Halcyon's time zone is unconfirmed; a client in another zone, or data stored in UTC, would mark the wrong orders as after the cut-off | `load.py:25-27`; SPEC §12 `[HALCYON_TIMEZONE]` |
| L3 | Input is CSV files in `Halcyon-Hackathon-Dataset/`; no upload, no store, no sync from the client's database, no validator | The jury or a client cannot run their own data from the UI; bad rows are not rejected with a readable message | `load.py:47-54`; SPEC-data-upload §1, §3 (U1–U17 all `todo`) |
| L4 | The whole CSV is read into pandas memory and the whole history is analysed on every run | Memory and run time grow with total history, not with the window anyone looks at | `load.py:49`; `pipeline.py:22-33` |
| L5 | Each run replaces every result table in one transaction, taking an exclusive lock on all of them first | Safe at today's size; at larger sizes readers wait longer while the write holds the lock | `backend/analytics/core/db.py:36-44` |
| L6 | On Azure the API app runs Node only; Python runs only inside GitHub Actions CD | No analysis can be started on demand on the deployed app; new results need a push to `main` | `infra/setup.sh:58` (`NODE:24-lts`); `cd.yml:143-155` |
| L7 | Date logic is fixed to this dataset: backtest split 1 Aug 2026, an "Aug–Sep" segment, and "48,340 deliveries · Apr–Sep 2026" in the shell | Any other date range gives a wrong split or a wrong label | `analytics/carriers/backtest.py:9`; `analytics/core/diagnosis.py:34`; `frontend/components/dashboard/DashboardShell.tsx:69-70,100` |
| L8 | The supplied data is synthetic and built so the five causes explain every late delivery | Real data will have late deliveries with no known cause, duplicates, late-arriving updates and missing fields; today nothing alerts on "late, cause unknown" | SPEC §12 ("a delivery with no flag is never late"); CLAUDE.md key numbers |
| L9 | Single tenant: Halcyon only, no tenant id on any table or route | A second client cannot share the deployment without seeing Halcyon's data | `backend/db/migrations/` (no tenant column) |
| L10 | The LightGBM carrier risk model was trained once (Apr–Jul train, Aug–Sep test) and is not retrained | Carrier performance drifts; the model will age silently | `backend/carrier-optimization-engine/model_report.md`; SPEC-data-upload §9 |
| L11 | Replay is a what-if on past data; there is no before/after measurement once fixes go live | We cannot yet show that a fix moved on-time in production | SPEC §9.2 (pilot design, not built) |
| L12 | The API keeps Python-computed tables in memory "while the server runs" | After a new analysis the API must be restarted (or the cache cleared) to show it | `backend/api/src/core/cache.ts:3` |
| L13 | Ask assistant (D10) and one-time address link (E19) are built after submission and off by default | They are not part of the submitted, tested behaviour; E19 refuses to start until A17 lands | `backend/api/src/core/config.ts:34,39,49`; SPEC §3 "After submission" |
| L14 | Hosting is the smallest tier: one B1 App Service plan for both apps, Postgres Burstable B1ms with 32 GB storage | Fine for a demo; not sized or load-tested for production traffic or history | `infra/setup.sh:37,56` |
| L15 | Adoption rates, carrier spare capacity and the second pick run are team assumptions | The programme estimate (85.9% as built) depends on them | SPEC §12 assumptions; §1.2 |

## 3. What breaks at 10× and beyond

Sizes are **estimates** scaled from the supplied `deliveries.csv` (48,340 rows, about 7.7 MB on disk). **No timed run
at 10× exists yet.** The planned test is SPEC-data-upload AC-DATA-23 (task U17): a seeded 10× synthetic store, a
full-window run, with time per step and peak memory recorded in `docs/TEST-EVIDENCE.md`. Until then the "breaks
first" column is our reading of the code, not a measurement.

| Scale | Size (estimate) | What breaks first (from the code) | Fix |
|---|---|---|---|
| 1× (today) | 48,340 deliveries, ~7.7 MB CSV | Nothing known; runs in CD on every push | — |
| 10× | ~483,000 deliveries, ~77 MB CSV | (1) Whole-file pandas load and whole-history analysis on every run (L4). (2) Full table replace with `to_sql` in 1,000-row chunks under an exclusive lock (L5): dashboard readers wait for the write. (3) No upload path at all for a file this size (L3); `UPLOAD_MAX_ROWS` is planned at 500,000. (4) Run only possible in CD (L6). | Store + windowed read on an indexed `order_received_ts` (U1, U2, NFR-DATA-05); analyse a chosen window (U8); background job with progress (U9); Python next to the API (U15); timed 1× and 10× runs (U17) |
| 100× | ~4.8 M deliveries, ~770 MB CSV | Single-process pandas on one machine; one-transaction replace of every result table; CSV upload through an HTTP body; B1 App Service and B1ms Postgres (L14) | Incremental processing: only re-flag new or changed deliveries and update aggregates by day; write result tables by swapping a new version in instead of rewriting; sync from the client's database instead of uploads (U7); bigger Postgres tier with table partitioning by month; job worker separate from the web API |
| Billions | Many clients × years of history | Postgres as the analysis store; any design that re-reads history; per-client copies of code rules | Columnar warehouse storage partitioned by tenant and date (for example Azure Synapse / Fabric warehouse, or Parquet in Data Lake with Spark or DuckDB per partition); flags computed once at ingest and kept; dashboard reads pre-aggregated tables only; rules and lanes as per-tenant configuration |

What does **not** grow with volume: the API reads small aggregate tables, and the cause rules are per-row and
independent, so they split cleanly by date and by tenant.

## 4. Reuse for another client or another logistics company

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
| X2 | Timed 1× and 10× runs with time per step and peak memory in `docs/TEST-EVIDENCE.md`; set limits from the results | 2–3 | U17, AC-DATA-23, NFR-DATA-02; scorecard 4.2 |
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

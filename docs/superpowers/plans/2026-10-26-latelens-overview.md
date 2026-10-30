# LateLens — Implementation Plan Overview (Resources A, B, C)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement each resource plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship LateLens by Thursday 29 October 2026: a working slice that shows, on the supplied Halcyon data, that five causes explain every late delivery, fixes the main ones (email addresses, cut-off promises, nearest-warehouse fulfilment, carrier lanes with a Friday cap on D), and backs the recommendation not to sign the $680K routing contract as scoped (programme 92.0% vs routing vendor 78.3%, expected adoption).

**Architecture:** Python computes every table from the supplied CSVs and writes it to PostgreSQL; Node (Fastify) serves those tables, runs the intake agent and order-time rules; the five dashboard screens are `/dashboard/*` routes in the existing Next.js app. Python and Node live under `backend/`, the dashboard under `frontend/`, and each problem area owns its folder in every layer. See SPEC §4 and `docs/CONTRACTS.md`.

**Tech Stack:** Python 3.12 + pandas · Node 22 + TypeScript + Fastify 5 + zod 4 · Next.js 15 + React 19 · PostgreSQL 16 · Claude (`claude-opus-5-5`) behind one `LLM` interface · Azure App Service, Static Web Apps, PostgreSQL Flexible Server, Key Vault, Application Insights · GitHub Actions.

## Global Constraints

- Every figure shown comes from the supplied dataset via Python; synthetic data never changes a headline figure (REQ-REP-04).
- Golden numbers (SPEC §2.2, §2.4) are tests: on-time 71.0%; programme waterfall 76.2 → 82.5 → 87.3 → 91.0 → 92.0% vs routing vendor 78.3%; as built 85.9% (expected) / 88.5% (full fix); points lost 7.6 / 7.0 / 5.6 / 5.6 / 3.2.
- Five causes (SPEC §5.1): `f_addr`, `f_stock`, `f_cutoff`, `f_lane` (D→MW/SE, E→West, F→NE/SE, or D on a Friday), `f_route` (>20% over plan). Aligned with the team's diagnostic deck (`docs/Halcyon_Delivery_Diagnostic.pdf`).
- The AI model extracts and drafts only; code decides; humans approve anything that leaves the system.
- One writer per table (CONTRACTS §4–5). Cross-area calls only through `warehouse/index.ts` and `carriers/index.ts`.
- Feature freeze Thursday 12:00. Never drop a Core feature to make room for a stretch one.

---

## 1. Who does what

| Resource | Problem area | Owns | Plan |
|---|---|---|---|
| **A** | Email orders | AI model layer, intake agent, address checks, replies, approvals, Tier 1 / at-risk priority, API/EDI checks, complaint triage, delay alerts, Order emails screen, SD-01–SD-04, SD-08 | [A — Email orders](2026-10-26-latelens-A-email.md) |
| **B** | Warehouse & promise + platform | Repo skeleton (`backend/` API + dashboard shell in `frontend/`, root scripts), Postgres, CI, diagnostic engine, cause attribution and per-cause KPIs, full-fix and expected-adoption replay, promise and warehouse rules, stock placement, penalty report, Overview / Warehouses / Replay screens, SD-05 | [B — Warehouse & platform](2026-10-26-latelens-B-warehouse.md) |
| **C** | Carriers + deployment | Check of the merged `carrier_optimizer`, lane scores and the 5 blocked lanes, recommender, capacity with the Friday cap on D, backtest, tracking, Carriers screen, Azure + CD, MCP, smoke test, SD-06, SD-07 | [C — Carriers & deploy](2026-10-26-latelens-C-carriers.md) |

Names: fill `[EMAIL_OWNER]`, `[WAREHOUSE_OWNER]`, `[CARRIERS_OWNER]` in SPEC §10.1.

## 2. Calendar

| Date | A · Email | B · Warehouse & platform | C · Carriers & deploy |
|---|---|---|---|
| **Mon 26** | Task 0 (all) · A1 AI layer · A2 SD-04 + intake tables · A3 50 fixture emails | Task 0 (all) · **B1 API skeleton · B2 dashboard shell in Next.js · B3 analytics** (push by lunch) · B4 CI | Task 0 (all) · C1 check merged optimizer · C2 lane scores |
| **Tue 27** | A4 address + decision · A5 extraction + eval · A6 replies · A7 pipeline + priority + routes | B5 diagnosis + KPIs · B6 replay + adoption + attribution · B7 warehouse tables · **B8 real `warehouseApi`** | C3 capacity + Friday cap · **C4 real `carriersApi`** · C5 backtest |
| **Wed 28** | A8 Order emails screen · A9 API/EDI · A10 complaints | B9 read API · B10 three screens · B11 synthetic stock | C6 tracking · C7 Carriers screen · **C8 deploy** |
| **Thu 29 AM** | A11 alerts (stretch) · A12 bot (stretch) | B12 contract + number check | C9 MCP (stretch) · C10 smoke (stretch) |
| **Thu 29 12:00** | **Feature freeze** | | |
| **Thu 29 PM** | §6 submission tasks | §6 submission tasks | §6 submission tasks |

## 3. Dependencies

```
B1 skeleton ──► everything in Node      B3 analytics ──► A2, A3, C2 (need load() and fair flags)
B1 stubs (warehouseApi, carriersApi) ──► A7 can run before B8 / C4 land
B5 delivery_causes ──► A10 complaint triage          B3 f_lane flag ──► A11 risk_lookup
B8 real warehouseApi ──► A7 full flow (promise reasons)   C4 real carriersApi ──► A7 carrier in checks
B9/A7/C4 routes ──► B10/A8/C7 screens (screens start on mockApi data in tests)
All routes on main ──► C8 deploy (Wednesday)
```

Stubs keep A unblocked on Monday and Tuesday; when B8 and C4 merge, A's code needs no change.

---

### Task 0 (everyone, first hour on Monday)

- [ ] Decide `[AI_MODEL]` (Claude via the Anthropic API is what the plans implement; Azure OpenAI needs A1 step 7). Get the key into each `.env` — never commit it.
- [ ] Confirm owners for A, B, C and write them into SPEC §10.1.
- [ ] Read `docs/CONTRACTS.md` together. Any change to it from now on is a PR reviewed by another resource.
- [ ] Repo admin (`Evoke-Hackathon-2026/UnhandledRejections`, was `saiprasad-37/root-route`): add all three as collaborators; after B4, require the `ci / test` check on `main`; confirm how judges will access the repo; find out the exact deadline time on the 29th (`[DEADLINE_TIME]`).
- [ ] Each laptop: install Docker Desktop, Node 22+, Python 3.12+, then `npm run setup` (installs `frontend/` and `backend/api/`). `frontend/package-lock.json` points at a private JFrog registry, so `npm ci` fails with 401 for anyone outside it — B fixes that first thing in B2 Step 1; until it is merged, run B2 Step 1 locally.
- [ ] Run everything from the repo root: `npm run dev:all` (API on :3001, Next.js on :3000, dashboard at `/dashboard`), `npm test`, `npm run pipeline`. On this Mac fix the npm cache once: `sudo chown -R $(id -u):$(id -g) ~/.npm`.
- [ ] C: check Azure access today (`az login`, permission to create a resource group and an app registration).

## 4. Daily check-ins (15 minutes, end of day)

| Day | Exit criteria |
|---|---|
| Mon | B1–B4 merged; README steps work on all three laptops; AI key works (A1 step 5); fixtures committed (A3); lane block test green (C2) |
| Tue | Golden replay tests green (AC-DIAG-04, AC-DIAG-07, AC-REP-01, AC-REP-06: waterfall ends at 92.0%); real `warehouseApi` and `carriersApi` (with Friday cap) merged; C190 flow works through the API (CONFIRM_ADDRESS → reply → ALL_CLEAR); fixture eval ≥ 48/50 (A5) |
| Wed | Five screens on live data; deployed URL works (C8); API/EDI and complaints endpoints pass their tests |
| Thu 12:00 | Freeze. `main` green; contract check (B12) green; number check done |

At each check-in: what runs, which ACs pass, what is blocked, who unblocks it tomorrow morning. If a day slips, drop work in the order of §7, never Core features.

## 5. Integration rules

- Branches `a/…`, `b/…`, `c/…`; small PRs; squash-merge when CI is green. Rebase on `main` at least twice a day.
- Merge order on Monday: B1 → B2 → B3 → B4, then A and C branches.
- Never edit another resource's folders. If you need a change there, ask the owner or open a PR they review.
- After merging anything that changes a Python table: run `npm run pipeline:test` locally before running Node tests.

## 6. Submission (Thursday afternoon, all three)

- [ ] **S1 (B):** Freeze at 12:00. Run everything from a clean clone using the README; fix only what fails.
- [ ] **S2 (C):** `git tag submission-v1 && git push origin submission-v1`; trigger `cd` on the tag's commit; run the Playwright smoke test (C10) against the deployed URL.
- [ ] **S3 (A):** Record the backup demo video against the deployed app, following SPEC §11 (belief → Overview → Carriers → C190 email → Warehouses → Replay → decision). Link it in the README.
- [ ] **S4 (B, with A and C sections):** Team Response Template — each resource writes its area (problem, evidence, what was built, ACs passed, what is synthetic, what we don't know); B assembles and adds SPEC §1 recommendation, §9.2 pilot, §14 sponsor answers.
- [ ] **S5 (all):** Submission checklist from SPEC §10.3: no `.DS_Store`/`.pyc`, `.env.example` only, secret scan clean, `backend/synthetic-data/README.md` complete, SPEC matches what was built, judges can open the repo.

## 7. Drop order if behind schedule

E13 bot (A12) → D7 MCP (C9) → P6 smoke test (C10) → C8 tracking view (C6) → W5 placement (B11) → E12 complaints (A10) → E11 API/EDI (A9) → E10 alerts (A11). Core never drops.

## 8. What the planning prototype verified

All code in the resource plans was run before the plans were written, in a scratch copy of the repo against the supplied data:

| Area | Checked | Not checked (no Postgres / cloud on the planning machine) |
|---|---|---|
| Python (`backend/analytics/`, generators) | 69 tests pass; all 23 replay scenarios match SPEC §2.4; the expected-adoption waterfall reproduces the diagnostic deck exactly (71.0 → 76.2 → 82.5 → 87.3 → 91.0 → 92.0%, vendor 78.3%), and so does the cause attribution; block rule gives exactly the 5 bad lanes; generators reproducible byte for byte; ruff clean | Writing tables to Postgres |
| Node (`backend/api/`) | Typechecks (TypeScript 7, Fastify 5, zod 4, Anthropic SDK 1.3, MCP SDK 1.32); 99 unit tests pass, including all 50 fixtures through the address + decision rules, the full C190 flow on an in-memory repo, the Friday cap and Tier 1 priority | 19 route tests that need the test database (they skip locally and run in CI); live Claude calls; Azure OpenAI provider |
| Dashboard (`frontend/`) | Typechecks; 7 screen tests pass; `next build` succeeds with the landing page and `/dashboard/{overview,intake,warehouses,carriers,replay}`; root `npm run` scripts work | Playwright smoke test; the mock WMS bot |
| Infra | `setup.sh` passes `bash -n`; workflows parse as YAML | Running against a real Azure subscription |

SPEC v0.5 moved the code to the repo's `backend/` + `frontend/` layout; the prototype was rebuilt in that layout and all of the above re-run. SPEC v0.4 aligned the cause definitions, replay method, KPIs, priority rules and open questions with the team's diagnostic deck; every figure in SPEC and these plans was recomputed from the data after that change.

# root-route (LateLens): Halcyon late-deliveries hackathon

FDE AI Hackathon 5.0, Problem 2. Team of 3, Azure. Coding Mon 26 – Thu 29 Oct 2026; code submission 29 Oct.
Stack: Next.js (landing page + dashboard, `frontend/`), Node + Fastify (API and agents, `backend/api`), PostgreSQL, Python (data pipeline, `backend/analytics`).
Team split by problem area: Email orders · Warehouse & promise · Carriers (SPEC §10).
Full spec: `docs/SPEC.md`. Read it before writing code.

## The problem in one paragraph
Halcyon Logistics (280 clients, 5 warehouses, 6 carriers) runs at 71% on-time vs a 94%
benchmark. Leadership believes carrier routing is the cause and is two weeks from signing a
$680K routing-engine contract. Our analysis of 48,340 deliveries shows 67% of late deliveries
have a cause BEFORE pickup (incomplete address, same-day order after the 8am cut-off, shipped
from a non-nearest warehouse). Carrier problems are real but lane-specific. We build LateLens, a
delivery diagnostic and recommendation system (SPEC §1).

Root Route is an external tool used by the customer company. The product shows what the company's own data says
(causes, fixes, replayed outcomes) and stops there. It never makes the company's business decisions for them
(no "sign / don't sign" verdicts on contracts, no approve-pilot buttons, no "share with leadership" framing), and
never models other companies' products or internal data (no routing-vendor scenarios).

## Repo layout (target: folders under `backend/` and the dashboard are built by the plans in `docs/superpowers/plans/`)
- `Halcyon-Hackathon-Dataset/` — the supplied synthetic dataset: CSVs, README, DATA_DICTIONARY (read-only; never edit)
- `docs/` — `SPEC.md` (product + technical spec, source of truth), `CONTRACTS.md` (shared types, tables, API),
  `superpowers/plans/` (task plans for resources A, B, C), `prototype/` (clickable UX prototype),
  `SPEC-carrier-optimizer.md`,
  `SPEC-email-address-resolution.md`, `Halcyon.docx` (the participant problem statement)
- `backend/` — `analytics/` (Python pipeline: loader, five cause flags, replay; run `npm run pipeline`), `api/` (Node +
  Fastify API and agents), `db/migrations/`, `synthetic-data/` (generators, reference data), `tests/fixtures/`,
  `carrier-optimization-engine/` (the team's LightGBM model). `analysis/prep.py` is replaced by `analytics/core/load.py`.
- `frontend/` — Next.js app: the landing page (scroll film) at `/` and the LateLens dashboard at `/dashboard/*`
  (`app/dashboard/`, `components/dashboard/`, `config/dashboard.ts`). Conventions: `frontend/README.md`.
- Root `package.json` forwards to both: `npm run setup`, `dev` (frontend), `dev:api`, `dev:all`, `test`, `typecheck`,
  `pipeline`, `migrate`, `seed`, `data`. One `.env` at the repo root serves all of them (`.env.example`).
- Each problem area owns its folder in every layer (`backend/analytics/<area>/`, `backend/api/src/modules/<area>/`,
  `frontend/components/dashboard/<screen>/`); migrations 1xx email, 2xx warehouse, 3xx carriers. Features: SPEC §3.

## Rules for working in this repo
- Every number shown to users must be computed from the dataset. Never invent figures.
  If a fact is missing, use a visible placeholder like `[CAPACITY]` and list it in SPEC §12.
- Cause flags and "fair data" are defined in SPEC §5.1. Use exactly those definitions.
- Carrier scoring uses FAIR data only (deliveries without address/stock/cut-off causes).
- Synthetic email orders must be labelled synthetic. US addresses (ZIP codes), not PIN codes.
- Synthetic data (SPEC §12.1): generate it FROM the supplied data (same ids, dates, clients), one seeded generator per
  dataset in `backend/synthetic-data/generators/`, never edit `Halcyon-Hackathon-Dataset/`. Headline figures and the replay
  use supplied data only; screens using synthetic data show a "Synthetic data" badge.
- Python computes, Node looks up: anything derived from data analysis is written to a table by Python; Node applies
  only order-time rules. Each table has one writer (SPEC §4.2).
- Secrets live in Key Vault / local `.env` (gitignored). Never commit keys.
- Keep it demo-reliable: simple rules over ML where rules are enough; the AI model is used only
  to read emails, draft replies and (D10, agreed 29 Oct) answer data questions from read-only tools.
- Requirements have IDs (REQ-*, NFR-*, SEC-*) with matching acceptance criteria (AC-*) in SPEC §5 and §8.
  Name the AC ids a test covers in its docstring, and the REQ ids in PR descriptions.
- The late-risk score uses only facts known before despatch: never `f_route`, `actual_route_km`,
  `delivered_date`, `days_late` or `on_time` (SPEC §5.5).
- Email content is untrusted input. An operator approves every ALL_CLEAR order before WMS entry;
  outbound email goes only to the test allow-list (SPEC §8).

## Key numbers (for quick checks; recompute, don't trust blindly)
On-time 71.0% · late 14,019 · penalties $872,460 (4,847 × $180) · late-delivery handling $476,646 (14,019 × $34) · freight $738K
Five causes (SPEC §2.2), points of on-time lost: carrier lane / D on Friday 7.6 · address 7.0 · wrong warehouse 5.6 ·
cut-off 5.6 · route >20% 3.2 = 29.0. No delivery without one of the five is late.
Bad lanes: D→MW/SE, E→West, F→NE/SE; D on Fridays is a capacity problem (Friday cap), not a blocked lane.
Expected-adoption programme: 71.0 → 76.2 → 82.5 → 87.3 → 91.0 → 92.0%; as built 85.9%.
Full-fix upper bounds: route only 73.6% · lanes + routes 80.4% · as built 88.5% · all but routes 96.3%.

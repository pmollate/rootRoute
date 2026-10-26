# root-route (LateLens): Halcyon late-deliveries hackathon

FDE AI Hackathon 5.0, Problem 2. Team of 3, Azure. Coding Mon 26 – Thu 29 Oct 2026; code submission 29 Oct.
Stack: React + Vite (web), Node + Fastify (API and agents), PostgreSQL, Python (data pipeline).
Team split by problem area: Email orders · Warehouse & promise · Carriers (SPEC §10).
Full spec: `docs/SPEC.md`. Read it before writing code.

## The problem in one paragraph
Halcyon Logistics (280 clients, 5 warehouses, 6 carriers) runs at 71% on-time vs a 94%
benchmark. Leadership believes carrier routing is the cause and is two weeks from signing a
$680K routing-engine contract. Our analysis of 48,340 deliveries shows 67% of late deliveries
have a cause BEFORE pickup (incomplete address, same-day order after the 8am cut-off, shipped
from a non-nearest warehouse). Carrier problems are real but lane-specific. We build LateLens, a
delivery diagnostic and recommendation system, and recommend not signing the vendor contract as
scoped: fix intake, promises, stock and carrier lanes, pilot for 8 weeks, then revisit routing (SPEC §1).

## Repo layout
- `Halcyon-Hackathon-Dataset/` — the supplied synthetic dataset: CSVs, README, DATA_DICTIONARY (read-only; never edit)
- `docs/` — `SPEC.md` (product + technical spec, source of truth), `CONTRACTS.md` (shared types, tables, API),
  `superpowers/plans/` (task plans for resources A, B, C), `prototype/` (clickable UX prototype),
  `Halcyon_Delivery_Diagnostic.pdf` (team diagnostic deck), `SPEC-carrier-optimizer.md`,
  `SPEC-email-address-resolution.md`, `Halcyon.docx` (the participant problem statement)
- `backend/` — Python. `analysis/prep.py`: reference loader + cause flags used for every number in the spec
  (`load('Halcyon-Hackathon-Dataset')` from the repo root). `carrier-optimization-engine/`: carrier risk model
  and capacity-limited replay (run from the repo root so `--data ./Halcyon-Hackathon-Dataset` resolves)
- `frontend/` — landing page (Next.js + GSAP scroll film), the deployable app. `npm run dev` from the root or
  from `frontend/`. Structure and conventions: `frontend/README.md`
- Planned by SPEC §4.3 and the task plans: `analytics/` (pipeline, replaces `backend/analysis/prep.py`), `api/` (Node),
  `web/` (dashboard), `db/migrations/`, `synthetic-data/`, `tests/fixtures/`, `docker-compose.yml`; each problem area has
  its own folder in every layer; migrations 1xx email, 2xx warehouse, 3xx carriers. **Open:** how these sit next to
  `backend/` and `frontend/` (see SPEC §4.3). Feature list and tiers in SPEC §3.

## Rules for working in this repo
- Every number shown to users must be computed from the dataset. Never invent figures.
  If a fact is missing, use a visible placeholder like `[CAPACITY]` and list it in SPEC §12.
- Cause flags and "fair data" are defined in SPEC §5.1. Use exactly those definitions.
- Carrier scoring uses FAIR data only (deliveries without address/stock/cut-off causes).
- Synthetic email orders must be labelled synthetic. US addresses (ZIP codes), not PIN codes.
- Synthetic data (SPEC §12.1): generate it FROM the supplied data (same ids, dates, clients), one seeded generator per
  dataset in `synthetic-data/generators/`, never edit `Halcyon-Hackathon-Dataset/`. Headline figures and the replay
  use supplied data only; screens using synthetic data show a "Synthetic data" badge.
- Python computes, Node looks up: anything derived from data analysis is written to a table by Python; Node applies
  only order-time rules. Each table has one writer (SPEC §4.2).
- Secrets live in Key Vault / local `.env` (gitignored). Never commit keys.
- Keep it demo-reliable: simple rules over ML where rules are enough; the AI model is used only
  to read emails and draft replies.
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
Expected-adoption programme: 71.0 → 76.2 → 82.5 → 87.3 → 91.0 → 92.0%; routing vendor only 78.3%; as built 85.9%.
Full-fix upper bounds: route only 73.6% · lanes + routes 80.4% · as built 88.5% · all but routes 96.3%.

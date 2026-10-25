# root-route (LateLens): Halcyon late-deliveries hackathon

FDE AI Hackathon 5.0, Problem 2. Team of 3, Azure, demo due in 4 days.
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
- `Halcyon.docx` — the participant problem statement
- `analysis/prep.py` — reference loader + cause flags used for every number in the spec
  (`load('Halcyon-Hackathon-Dataset')` from the repo root)
- `docs/SPEC.md` — product + technical spec (source of truth)
- To be created: `functions/` (Python Azure Functions), `web/` (dashboard), `tests/`;
  stretch: `bots/` (Playwright), `mocks/` (mock WMS); phase 2: `infra/` (full Bicep). Scope tiers in SPEC §3.

## Rules for working in this repo
- Every number shown to users must be computed from the dataset. Never invent figures.
  If a fact is missing, use a visible placeholder like `[CAPACITY]` and list it in SPEC §12.
- Cause flags and "fair data" are defined in SPEC §5.1. Use exactly those definitions.
- Carrier scoring uses FAIR data only (deliveries without address/stock/cut-off causes).
- Synthetic email orders must be labelled synthetic. US addresses (ZIP codes), not PIN codes.
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
On-time 71.0% · late 14,019 · penalties $872,460 (4,847 × $180) · late-delivery handling $476,646 (14,019 × $34)
Late rate when present: address 65% · same-day after 8am 61% · non-nearest warehouse 50% · carrier D 40% ·
route overrun >12% 37% · carriers E/F 31% · none of the six causes 0%.
"If fixed" on-time: route overruns only 73.4% · carriers+routes 80.2% · address only 76.8% ·
address+carriers 83.7% · address+cut-off+stock 86.5% · address+cut-off+stock+carriers 95.6%.
Cost avoided over 6 months: route only ≈ $104K · address+cut-off+stock+carriers ≈ $1.15M (SPEC §1.1).

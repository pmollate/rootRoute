# spec-writer · link-geocode-sku-catalog · 2026-10-30

**Asked by:** nvarada (two user decisions, 30 Oct) · **Branch / commit:** `A20-link-azure` @ 7c1e726 (uncommitted)
**Request:** (1) E19: the server geocodes the typed address on Confirm; `pin` optional; mismatch or no point asks for
the second Confirm; no point stores the address without a pin. (2) E20: a synthetic SKU catalogue per client (SD-10) and
"did you mean" suggestions in intake, from that client's catalogue only.

## What it did
- Read CLAUDE.md, SPEC §3, §4.2, §4.4, §5.3, §5.7, §5.17, §6–§9.4, §10.1, §12, §12.1, §14.1, §16 and CONTRACTS.
- Checked the code: `decide.ts` (any non-empty SKU passes); `link.ts` / `linkRules.ts` (pin required; a `checkId`
  bound to pin + ZIP; map look-up cap returns 429); `ConfirmScreen.tsx` (`NO_PIN_START` 39.8283, −98.5795, always posted);
  `read.ts` `mergeExtraction` (a reply's items replace the whole list); `analytics/warehouse/stock.py` (`SKU-<nnn>-<k>`).
- Fixtures: 50 gold JSON files, every item an `HX-###` code (96 distinct), 50 client ids; gold decisions 32 ALL_CLEAR,
  17 CONFIRM_ADDRESS, 1 MISSING_INFO.
- Checked REQ/AC pairing with a script: 33 LINK/SKU/SEC-LINK requirement ids, each with its AC.

## Output
SPEC v0.17 → v0.18 ("Changes in v0.18" note). Sections changed:
- §3: new feature row E20; after-submission note (E20 has no flag; empty `sku_catalog` = off); OS-10, OS-12.
- §4.2 (`sku_catalog`, Node, seed-written); §4.4 agents table (catalogue as an intake tool).
- §5.3: step 5a (SKU check), steps 8, 11, 13; REQ-INT-09 note; new "SKU catalogue check" subsection with matching
  table, question wording, design settings (`SKU_MIN_SIM` 0.60, `SKU_TEXT_MAX` 60, `SKU_MIN_GAP` 0.10 reserved).
- §5.7 Intake row. §5.17: intro (migration 103, was "102"), flow steps 3–6 (no start pin, no working map, outcome
  table), threat model L9, L10, design settings.
- §6, §9.1, §9.4 (EC-24, EC-25; summary 25 cases), §10.1, §12, §12.1, §14.1 (two rows).

New ids: REQ-LINK-12, -13, -14, -15 / AC-LINK-12 to -15; REQ-SKU-01 to -07 / AC-SKU-01 to -07; E20; SD-10 (SD-09 now
registered in §12.1); EC-24, EC-25; Q-LINK-07, Q-SKU-01, Q-SKU-02.
Changed ids: REQ-LINK-02, -03, -04, -05, -11; SEC-LINK-04, -10; AC-LINK-03, -04, -05, -11; AC-SEC-LINK-04, -10;
REQ-INT-09 (wording only).

CONTRACTS: §1.1 `LinkView.map` nullable (matches code); `MapReading` gains `of`, `found`, `differs`, `distanceM` nullable;
§5 range row, migration 103 notes (`lat`/`lon` nullable, `map_reading`, `map_lookups`), new migration 104 `sku_catalog`;
§6 `POST /api/confirm/:token` (`pin?`, 503 `map_unavailable`, `checkId` binding), `GET /api/intake/review`
(`confirmedPin`, `mapReading`), `GET /api/intake/:id` (`checks.items`); §8 folders.

Decisions taken as safe defaults (listed in §12 for confirmation):
- Q-LINK-07: a mismatched address confirmed again with no pin is stored without a pin (the map's point is not kept).
- Q-SKU-01: every unknown item is asked about, never auto-resolved.
- The `checkId` is bound to the whole typed address and the pin (or none), not just pin + ZIP.
- Map unreachable at Confirm → 503 `map_unavailable`, link unused.

## Handed to
- `planner`, plan A (`docs/superpowers/plans/2026-10-26-latelens-A-email.md`):
  - E19 tasks: `linkRules.ts` (`ConfirmBody.pin` optional; mismatch rule), `link.ts` (forward geocode on Confirm,
    counted look-ups, 409 readings, `checkId` bound to typed address, null pin storage, 503), `saveLinkAddress` (today
    returns null when `lat`/`lon` are null, line ~265: must save without a pin), the review (`confirmedPin`,
    "Map reads the address as …", "no map point"), `ConfirmScreen.tsx` (send `pin` only from a working, placed map;
    drop the `checkId` on any field change; "The map reads your address as" / not-found text), recorded map answers
    for AC-LINK-12 to -14. The plan's step text "starts the pin at the map's centre of the ZIP the client types"
    (around line 5439) does not match the code (`NO_PIN_START`, centre of the contiguous US) and must follow §5.17 step 3.
  - E20 tasks: `sd10_catalog.py` (reads SD-02 gold and `stock_daily` codes; seeded names and units), migration
    `104_sku_catalog.sql`, seed, `sku.ts` (matching), `decide.ts` and the reply template / required text, `GET
    /api/intake/:id` `checks.items`, Intake screen panel with the badge, tests AC-SKU-01 to -07,
    `backend/synthetic-data/README.md` SD-10 section.
- `qa-evidence`: EC-24 and EC-25 are "not built" until those tasks land.
- Email owner: Q-LINK-07, Q-SKU-01, Q-SKU-02.

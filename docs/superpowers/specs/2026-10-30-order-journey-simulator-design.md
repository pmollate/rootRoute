# Design: external WMS / carrier simulator for the order journey (D9)

Date: 30 Oct 2026 · Status: approved design, not built · Changes `docs/SPEC-order-workflow.md` §4.2, §5, §6, §7

## 1. Problem

A new email order runs through stages 1–9 of the order journey and stops. `send_to_wms`
(`backend/api/src/modules/intake/actions.ts`) only sets the status to `ENTERED`. Stages 10–13 (picked, handed to the
carrier, in transit, delivered) are always `not_reached` for `email:<id>` journeys. SPEC-order-workflow §4.2 planned an
in-process `simulateForward` that would write future-dated events, but it was never built: there is no `order_events`
table, no `journey_timing` table and no hook.

## 2. Decision

Replace the in-process simulation with a **separate simulator app that plays Halcyon's WMS and carriers**, driven by
hand. LateLens hands the order over through an outbound call, and the simulator reports each later step through an
inbound events API. A person clicks each step in the simulator, so a demo controls when an order moves and whether it
is late.

Approaches considered:

| Approach | Verdict |
|---|---|
| A. Outbound webhook + inbound events API; LateLens alone writes `order_events` | **Chosen.** Keeps one writer per table (SPEC §4.2), and is the shape a real WMS or carrier feed would take |
| B. Simulator writes to Postgres directly | Rejected: two writers for one table, and no API is shown working |
| C. Keep `simulateForward` (automatic, timings from `journey_timing`) plus dev buttons in LateLens | Rejected: no separate system, no handoff to demonstrate |

Decisions taken with the user (30 Oct): manual steps, not a clock; LateLens pushes the order to the simulator; the
simulator lives in this repo at `tools/wms-simulator/`; if the simulator is down, `send_to_wms` is refused and the
order stays `APPROVED`; one token for each direction.

Later on 30 Oct: when an admin switches on **auto-advance**, approval runs steps 9–13 itself and this simulator is not
used for those orders (`2026-10-30-order-journey-auto-advance-design.md`). With the switch off, this design applies.

## 3. Flow

```
Supervisor approves (E18)          Operator clicks "Send to WMS"
        │                                     │
        ▼                                     ▼
 intake_emails APPROVED ──▶ applyAction('send_to_wms')
                               │ 1. POST {WMS_URL}/orders  ─────────────▶  Simulator (tools/wms-simulator)
                               │    ◀──────────── 201 { wmsOrderId }        stores the order (JSON file)
                               │ 2. recordOrderEvent(wms_entered)           page: one row per order,
                               │ 3. status ENTERED                          "next step" button,
                               ▼                                            "deliver late by N days"
                         order_events  ◀── POST /api/orders/:ref/events ◀───┘ (picked … delivered)
                               │
                               ▼
                 GET /api/journey/email:<id>  → stages 9–13 filled, "Synthetic data" badge
```

## 4. Contract 1: LateLens → simulator (fills `[WMS_CONTRACT]`, SPEC §12)

`POST {WMS_URL}/orders`, header `Authorization: Bearer <WMS_TOKEN>`, JSON body:

```json
{
  "orderRef": "email:42",
  "clientId": "C190",
  "warehouseId": "W2",
  "carrier": "B",
  "commitment": "next_day",
  "promiseDate": "2026-10-31",
  "destination": { "city": "Columbus", "state": "OH", "zip": "43215" },
  "items": [{ "sku": "SKU-1042", "qty": 12 }]
}
```

- Values come from the order's latest extraction and its `checks` (warehouse, carrier after any supervisor override,
  promise).
- The body carries no names, phone numbers or email addresses (SEC-JRN-01). The street line is not sent.
- Responses: `201 { "wmsOrderId": "WMS-000042" }` for a new order. `200` with the same `wmsOrderId` when the same
  `orderRef` is sent again (idempotent). Any other status counts as a failure.
- LateLens times out after 5 s.

## 5. Changes to `send_to_wms`

The order of the steps:

1. The existing checks: status `APPROVED` or `SENT`, and decision `ALL_CLEAR` (otherwise 409, as today).
2. If `WMS_URL` is unset: behave as today (status `ENTERED`, audit row) and write no event. This keeps the deployed
   Azure app working, since it cannot reach a simulator on a laptop.
3. Otherwise call the simulator (§4). On a timeout, a network error or a non-2xx answer, return
   `503 { error: "WMS not reachable" }`. The status stays as it was, and nothing is written.
4. Call the Carriers module's `recordOrderEvent({ orderRef: "email:<id>", event: "wms_entered", ts: now,
   detail: { wmsOrderId } })`. If the row already exists (the operator retried after a lost response), keep it.
5. Set the status to `ENTERED` and write the `send_to_wms` audit row with `wmsOrderId` in its payload.

Intake reaches `recordOrderEvent` the same way it reaches `logOverride` today: it is passed in through `ActionOptions`,
so intake never writes `order_events` itself.

## 6. Contract 2: simulator → LateLens: `POST /api/orders/:ref/events`

- Auth: header `Authorization: Bearer <WMS_EVENTS_TOKEN>`. In `PERMISSIONS` it is `'public'` with its own token, as
  `POST /api/mcp` is. `401` without a valid token; `503` when `WMS_EVENTS_TOKEN` is unset.
- `:ref` is `email:<id>`; anything else is `400`.
- Body: `{ "event": "picked" | "picked_up" | "in_transit" | "out_for_delivery" | "delivered", "ts"?: "YYYY-MM-DD HH:mm" }`.
  `ts` defaults to the server's local now (the simulator always sends it). It may be set in the future (to make a delivery late) but never earlier than the
  previous event's `ts`.
- Order: `wms_entered` → `picked` → `picked_up` → `in_transit` → `out_for_delivery` → `delivered`. Each event needs
  the one before it. No step is skipped.

| Case | Response |
|---|---|
| Next event in order, valid `ts` | `201 { "event", "ts" }` |
| Same event again with the same `ts` | `200 { "event", "ts" }` (nothing written) |
| Same event again with a different `ts` | `409 { "error": "already recorded" }` |
| Event out of order, or `ts` before the previous event | `409 { "error": "<event> needs <previous> first" }` / `"ts before <previous>"` |
| Order has no `wms_entered` event | `409 { "error": "order is not in the WMS" }` |
| Unknown email id | `404 { "error": "not found" }` |
| Bad body | `400 { "error": "invalid" }` |

Each accepted call logs `{ emailId, event }` (NFR-03).

## 7. Data and ownership

- **`order_events`**, migration `backend/db/migrations/301_order_events.sql` (the name SPEC-order-workflow §7 already
  gives): `id serial`, `order_ref text`, `event text` (the six values above, checked), `ts timestamp` (local time,
  no zone, like every other timestamp in the API; it travels as `YYYY-MM-DD HH:mm`),
  `detail jsonb`, `synthetic boolean NOT NULL DEFAULT true`, `created_at timestamptz DEFAULT now()`, unique
  (`order_ref`, `event`).
- **Writer:** the Carriers journey module only, through one function `recordOrderEvent()` in
  `backend/api/src/modules/carriers/` (exported from `index.ts`). The ordering and repeat rules of §6 live in that
  function, so they hold for both callers.
- **Dropped:** `journey_timing` and REQ-JRN-10. Timings now come from the person driving the simulator, not from data.
  No headline figure reads `order_events` (SPEC §12.1).

## 8. Journey changes (`buildEmailJourney`, `journey.ts`)

`EmailFacts` gains `events: { event, ts, detail }[]`, read from `order_events` in `queries.ts`.

| Stage | Built from |
|---|---|
| 9 Entered in WMS | `wms_entered` → `done`, "Entered in the simulated WMS as `<wmsOrderId>`". Without the event, the current rule (audit row → `done`, approved → `current`) still applies, so orders entered with `WMS_URL` unset still show |
| 10 Picked | `picked` |
| 11 Handed to carrier | `picked_up`, actor = the order's carrier |
| 12 In transit | `in_transit`, then `out_for_delivery` (shown in the detail) |
| 13 Delivered | `delivered`: `done` on or before the promise date; `failed` "Delivered N days late" after it. No `delivered` by the end of the promise date → `at_risk` (REQ-JRN-06) |
| 14 Delay notice | unchanged, `not_reached` (REQ-JRN-12 stays a stretch goal) |

- The first stage without an event, after stage 9, is `current`, and later ones are `not_reached`.
- Stages 9–13 have source `synthetic`, and the page keeps its note that they are simulated (REQ-JRN-08).
- `GET /api/journey/:ref` has no `asOf` parameter yet, so "by the end of the promise date" is judged against the
  server's current local time. An event with a future `ts` shows as recorded. Adding `asOf` stays REQ-JRN-06 work.
- The page's note "Stages 10 to 13 show once the simulated warehouse and carrier events are built" becomes "Stages 9 to
  13 come from the simulated WMS and carriers: synthetic data".

## 9. Simulator app (`tools/wms-simulator/`)

- Plain Node (`node:http`, built-in `fetch`, no dependencies, so no `npm install`), one static HTML page, no build
  step. `npm run dev:sim` at the root starts it on port 4100 with `node --env-file=.env`.
- Reads `WMS_TOKEN` (to check incoming orders), `WMS_EVENTS_TOKEN` and `LATELENS_API_URL` (default
  `http://localhost:3001`) from the root `.env`.
- `POST /orders`: stores the order in `tools/wms-simulator/data/orders.json` (gitignored), assigns
  `WMS-<6-digit email id>`, and answers as in §4.
- The page lists the orders with their current step. Each row has a **Next step** button and, for `delivered`, a
  **Deliver late by N days** field (it sends `ts` = promise date + N days). It shows LateLens's error text when a call
  is refused.
- The page header says "Simulated WMS and carriers: synthetic data".
- The simulator is local only. No Azure deployment is part of this design.

## 10. Configuration

New `.env` keys, added to `.env.example` and `backend/api/src/core/config.ts` with the `MCP_TOKEN` pattern (empty
means unset, at least 16 characters when set):

| Key | Used by | Meaning |
|---|---|---|
| `WMS_URL` | API | Simulator base URL, e.g. `http://localhost:4100`. Unset → `send_to_wms` behaves as today |
| `WMS_TOKEN` | API, simulator | Bearer token LateLens sends to the simulator |
| `WMS_EVENTS_TOKEN` | API, simulator | Bearer token the simulator sends to `POST /api/orders/:ref/events` |

## 11. Spec and contract updates (with the code)

- `docs/SPEC-order-workflow.md`:
  - §4.2: replace the timing table with this design (manual, external simulator).
  - REQ-JRN-05 → "When `send_to_wms` succeeds with `WMS_URL` set, the API MUST hand the order to the WMS (§4) and
    record `wms_entered`; it MUST refuse with 503 and leave the status unchanged when the WMS does not accept it."
  - New REQ-JRN-13: the events API of §6, with its ordering and repeat rules.
  - New SEC-JRN-04: the events API needs `WMS_EVENTS_TOKEN`; the outbound body carries no personal details.
  - REQ-JRN-10 and AC-JRN-10 dropped (`journey_timing` not needed).
  - AC-JRN-05 rewritten (§12 below); AC-JRN-06 kept.
  - §7 and §8: update the diagram, the hook and the tier table.
- `docs/CONTRACTS.md`: add `POST /api/orders/:ref/events`, the `order_events` table (writer C), and the WMS
  interface of §4 under `[WMS_CONTRACT]`; add the `wmsOrderId` note to `POST /api/intake/:id/action`.
- `docs/SPEC.md` §12: close `[WMS_CONTRACT]`, pointing at CONTRACTS.md.

## 12. Testing (acceptance criteria)

| ID | Criterion | Test |
|---|---|---|
| AC-JRN-05 (rewritten) | Given an approved ALL_CLEAR order and a fake WMS answering 201, when `send_to_wms` runs, then status is `ENTERED` and `order_events` has one `wms_entered` row with the `wmsOrderId`. Run twice: still one row. Given the fake WMS times out or answers 500, then 503, status unchanged, no row. Given `WMS_URL` unset, then `ENTERED` and no row | API unit, fake WMS |
| AC-JRN-13 | Given an entered order, when the five events are posted in order, then each gets 201; posting `picked_up` before `picked` gets 409; reposting `picked` with the same `ts` gets 200 and no new row; with a different `ts`, 409; a `ts` earlier than the previous event, 409; an order not in the WMS, 409; `email:99999`, 404 | route test |
| AC-SEC-JRN-04 | Given no token or a wrong token, then 401 and no row; with `WMS_EVENTS_TOKEN` unset, then 503. The body sent to the fake WMS for fixture C190 holds no name, phone or email address | route test, API unit |
| AC-JRN-14 | Given events up to `in_transit`, then stages 9–12 are `done`, 13 `current`; given `delivered` two days after the promise date, then stage 13 is `failed` with "2 days late"; given no `delivered` and `asOf` after the end of the promise date, then `at_risk` | `journey.ts` unit |
| — | Permissions table has `POST /api/orders/:ref/events` (the existing permissions test fails otherwise) | existing test |

Manual demo check: approve an order → Send to WMS → it appears in the simulator → click through to delivered → the
journey page shows stages 9–13 with the "Synthetic data" badge.

## 13. Out of scope

Stage 14 delay notice (REQ-JRN-12), deploying the simulator to Azure, a real WMS or carrier API, background retries
of a failed handoff, and `POST /api/orders` / `POST /api/orders/edi` (E11, still not built). Automatic steps are now available behind the auto-advance switch: 2026-10-30-order-journey-auto-advance-design.md.

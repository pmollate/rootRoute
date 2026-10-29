# SPEC — Order to delivery workflow ("Order journey", D9)

**Project:** LateLens (root-route) · **Version:** 0.2 · **Status:** core parts built (Task C11) · **Date:** 28 Oct 2026
**Parent spec:** `docs/SPEC.md` v0.8 (source of truth; this file adds feature D9 and does not change any existing REQ).
**Owner:** Carriers (Task C11) · **Reads from:** Email (§5.3), Warehouse (§5.4), Carriers (§5.2, §5.13).

**Conventions** as in SPEC: **MUST** / **SHOULD** / **MAY** per RFC 2119; every requirement has an id (`REQ-JRN-NN`),
its acceptance criterion has the same number (`AC-JRN-NN`); every **MUST** has an AC. Every number shown comes from the
supplied dataset or from tables Python computed from it; synthetic stages carry the "Synthetic data" badge (SPEC §12.1).

---

## 1. Context and problem

LateLens checks each order at intake: address, promise date, warehouse and carrier (SPEC §5.3, §5.4, §5.2). Each screen
shows one part (Intake, Warehouses, Carriers, Replay), but **no screen follows one order from the client's email to the
door**. Intake stops at "entered in the WMS"; after that an order only appears inside totals.

Halcyon's business answers (SPEC §14.1) make the end-to-end view the missing piece of the story:
- Order times in the data are keying times, not arrival times (Q-005), so part of the cut-off lateness is keying delay.
- Clients pick the commitment; the promise is order date +1 / +2 / +4 days (Q-001).
- Clients get no proactive update today and learn of a delay the next day (Q-004).
- The WMS has an API we simulate (Q-002).

67% of late deliveries start **before** pickup (SPEC §2.2). A single timeline per order shows where that happens and
which LateLens check stops it, which is the argument against signing the routing contract as scoped.

## 2. Goal and success measure

One screen, `/dashboard/journey/<ref>`, that shows any order as a timeline of stages, each with time, actor, data
source and the LateLens check that applies:
- **New orders** (from intake): the real stages up to WMS entry, then simulated warehouse and carrier stages.
- **Past deliveries** (from the dataset): what happened at Halcyon, stage by stage, with the cause flags and what
  LateLens would have done at the stage where the delivery went wrong.

**Success:** in the demo, C190's email (SPEC §11) can be followed from email to delivered or at risk on one page.
For any late delivery in the dataset, the page names the stage where it went wrong and the check that would have caught it.

## 3. Stakeholders

| Who | Uses the journey to |
|---|---|
| Order desk operator (Email) | see where an order is waiting and what the client was told |
| Supervisor (Email, E18) | check the warehouse and carrier before approving |
| Warehouse lead (Warehouse) | see orders missing the cut-off or shipped from a non-nearest warehouse |
| Carrier desk (Carriers) | see at-risk orders by carrier and lane |
| Customer success (E12) | answer a client's complaint with the order's actual history |
| Leadership / judges | see one order prove the "causes before pickup" finding |

## 4. The workflow

### 4.1 Stages

A journey is an ordered list of stages. Each stage has a **status** (`done` | `current` | `waiting` | `at_risk` |
`failed` | `skipped` | `not_reached`), a **time**, an **actor** and a **source** (`real` | `synthetic` | `rule`).

| # | Stage | Actor | Source for a new order | Source for a past delivery | LateLens check | Today at Halcyon (SPEC §2.5, §14.1) |
|---|---|---|---|---|---|---|
| 1 | Order received | Client | `intake_emails.received_at` (arrival time, E1) | `order_received_ts` (keying time, Q-005), `order_channel` | Arrival time used for the cut-off | Email keyed in by hand; keying time recorded |
| 2 | Order read | AI + code | `intake_extractions.extraction` (E3) | `email_format_id` (email orders only) | Validated JSON; PII removed first | Read by a person |
| 3 | Address checked | Code + Azure Maps | `checks.address` (E4, REQ-INT-09) | `address_status` | `CONFIRM_ADDRESS` before the order moves | Found out at delivery |
| 4 | Promise set | Code (Warehouse rule) | `checks.promise` (W1) | `commitment_type`, `promised_date`, `pick_list_date` | Cut-off rule: same day after 08:00 becomes next day, with the reason told to the client | Promise given without the cut-off; missed silently |
| 5 | Warehouse chosen | Code (Warehouse rule) | `checks.warehouse` (W2, W3) | `nearest_warehouse_id`, `fulfilment_warehouse_id`, `nearest_warehouse_had_stock` | Nearest with stock; partner fallback | Non-nearest warehouse used although the nearest had stock |
| 6 | Carrier chosen | Code (Carriers rule) | `recommendations` + `override_log` (C3, C6) | `carrier_id`, `destination_region`, weekday | Blocked lanes never offered; Friday cap on D | Preferred carrier regardless of lane |
| 7 | Approved | Supervisor | `audit_log` approve / reject (E18) | none | Nothing reaches the WMS without approval (SEC-04) | n/a |
| 8 | Client told | Operator / auto | `outbound_messages` (E6, E8, E17) | none | Reply states the promise, missing fields or address problem | No confirmation of the promise |
| 9 | Entered in WMS | WMS (simulated) | `order_events` `wms_entered` + WMS order number | `order_id` | Assumed interface, SPEC §12 `[WMS_CONTRACT]` | Keyed in by hand |
| 10 | Picked | Warehouse (simulated) | `order_events` `picked` | `pick_list_date` | — | — |
| 11 | Handed to carrier | Carrier (simulated) | `order_events` `picked_up` | `shipped_ts`; `carrier_events` `picked_up` (SD-07) | — | — |
| 12 | In transit / out for delivery | Carrier (simulated) | `order_events` | `carrier_events` (SD-07) | Tracking feeds unified (C8) | Carrier portals checked by hand |
| 13 | Delivered or at risk | Carrier / code | `order_events` `delivered`, or at risk (REQ-TRK-02 rule) | `delivered_date`, `days_late`, `on_time` | At risk at end of the promise date with no delivery | Client finds out the next day (Q-004) |
| 14 | Delay notice (stretch, E10) | Code drafts, operator approves | `alerts` | none | Client only, reviewed by a person, allow-list (Q-004, SEC-03) | None |

Branches shown on the timeline, not as extra stages:
- `CONFIRM_ADDRESS` / `MISSING_INFO` → stage 7 is `skipped` and stage 8 is the question to the client; when the client answers (REQ-INT-07),
  stages 2–6 repeat and the timeline shows both rounds.
- Rejected at stage 7 → stages 8–14 are `not_reached`, and the reason is shown.
- Unknown sender (E16) → stage 2 is `skipped`, and the journey ends at stage 1.
- WAITING (map or model not reachable) → the stage is `waiting`, with the next poll time.

### 4.2 Simulating stages 9–13 for new orders (synthetic)

Halcyon's WMS and carriers aren't connected (Q-002; carrier APIs are pitch only, SPEC §3), so after approval and
`send_to_wms` the API writes simulated events to `order_events`, all `synthetic = true`. Every timing comes from a
lookup Python computes from `deliveries.csv` (SPEC §4.2: Python computes, Node looks up):

| Event | Rule |
|---|---|
| `wms_entered` | At `send_to_wms`; WMS order number `WMS-<email id>` (assumed interface, SPEC §12) |
| `picked` | On the promise rule's pick date (W1): the same day for same-day orders before the cut-off, otherwise the next working day |
| `picked_up` | The pick date plus the median order-to-shipped hours for that warehouse and commitment (`journey_timing`) |
| `in_transit`, `out_for_delivery` | As in SD-07 (C6): the same offsets from `picked_up` and `delivered` |
| `delivered` | On time with probability = the lane's fair on-time rate (`lane_scores.on_time`). Late by the lane's median days late (`lane_scores.lane_median_late`). Seeded by email id, so a rerun gives the same journey |

Events carry future timestamps. The page shows them according to an **"as of" time** (default: now; the demo can move
it forward), as `/api/tracking?asOf=` already does. This avoids a background clock and keeps the demo repeatable.

### 4.3 Past deliveries

For `delivery:<id>` the journey reads `deliveries_clean`, `delivery_causes` and `carrier_events`. The stage where the
delivery went wrong is marked `failed`, from the cause flags (SPEC §5.1):

| Cause flag | Stage marked `failed` | "With LateLens" note: the existing rule, run on this delivery's facts |
|---|---|---|
| `f_addr` | 3 Address checked | Intake would have asked the client for the address (`CONFIRM_ADDRESS`) |
| `f_cutoff` | 4 Promise set | `checkPromise` result: next day, with the reason told to the client |
| `f_stock` (non-nearest warehouse) | 5 Warehouse chosen | `pickWarehouse` result: the nearest warehouse with stock |
| `f_lane` (incl. D on Friday) | 6 Carrier chosen | `recommendCarrier` result: carrier and reason |
| `f_route` (stage Delivery) | 12 In transit | Not checked: route detours are left to the routing pilot (SPEC §1.1) |

The "With LateLens" note shows the rule's output, never a promise that the delivery would have been on time. Replay
(SPEC §5.8) remains the only place that states on-time rates.

## 5. Requirements

### 5.1 Functional

| ID | Requirement |
|---|---|
| REQ-JRN-01 | `GET /api/journey/:ref` **MUST** return the stages of §4.1 in order for `ref` = `email:<id>` or `delivery:<id>`, each with status, time, actor, source and the check that applies; an unknown ref **MUST** return 404. |
| REQ-JRN-02 | For an intake email, stages 1–8 **MUST** be built only from existing intake, carriers and audit tables (`intake_emails`, `intake_extractions`, `outbound_messages`, `audit_log`, `recommendations`, `override_log`); the journey **MUST NOT** write to them. |
| REQ-JRN-03 | Each client round of a `CONFIRM_ADDRESS` or `MISSING_INFO` email **MUST** appear on the timeline, with the question sent and the client's answer. |
| REQ-JRN-04 | A rejected order **MUST** show the rejection reason and user at stage 7, and stages 8–14 as `not_reached`. |
| REQ-JRN-05 | When `send_to_wms` succeeds, the API **MUST** write the simulated events of §4.2 to `order_events` once per order (a repeated call writes nothing), with `synthetic = true`, using only timings from `journey_timing` and `lane_scores`. |
| REQ-JRN-06 | With an `asOf` time, the journey **MUST** show only events at or before it. An order with no `delivered` event by the end of its promise date **MUST** show stage 13 as `at_risk`, using the same rule as REQ-TRK-02. |
| REQ-JRN-07 | For a past delivery, the journey **MUST** mark as `failed` each stage named by its cause flags (§4.3), and **MUST** show the output of the existing rule for that stage (`checkPromise`, `pickWarehouse`, `recommendCarrier`, address decision). |
| REQ-JRN-08 | Every stage with source `synthetic` **MUST** show the "Synthetic data" badge, and the page **MUST** say that stages 9–13 of new orders are simulated. |
| REQ-JRN-09 | `/dashboard/journey/<ref>` **MUST** show the timeline, and the Intake detail **MUST** link to it. The Carriers tracking at-risk list **SHOULD** link to it. |
| REQ-JRN-10 | `journey_timing` (warehouse, commitment, median order-to-shipped hours, n) **MUST** be computed by Python from `deliveries.csv` and written by the pipeline; Node only reads it. |
| REQ-JRN-11 | The journey **SHOULD** show, for a new order, the time from email arrival to approval and to WMS entry. |
| REQ-JRN-12 | (Stretch, with E10.) An `at_risk` order **MAY** get a drafted delay notice addressed to the client only, sent only after an operator approves it and only to the allow-list. |

### 5.2 Non-functional and security

| ID | Requirement |
|---|---|
| NFR-JRN-01 | `GET /api/journey/:ref` **SHOULD** respond within 500 ms at p95 on the demo database. |
| SEC-JRN-01 | The journey **MUST NOT** return names, phone numbers or email addresses of people. It shows client id, items, and city, state and ZIP; the full email stays on the Intake screen. |
| SEC-JRN-02 | *(Replaced by REQ-AUTH-04 in `docs/SPEC-auth.md` once P7 ships: reads then need a signed-in user.)* The journey endpoint **MUST** be read-only. Like the other dashboard reads (`GET /api/intake`, `/api/carriers`) it needs no API key, which is why SEC-JRN-01 keeps people's details out of it. |
| SEC-JRN-03 | Journey requests **MUST** log the ref (`emailId` or `deliveryId`), so an order's journey views are traceable in Application Insights (NFR-03). |

## 6. Acceptance criteria

| ID | Acceptance criterion |
|---|---|
| AC-JRN-01 | Given an ALL_CLEAR email that was approved, confirmed to the client and sent to the WMS, when requested, then 14 stages come back in §4.1 order with stages 1–9 `done`. Given `email:7` (approved, no reply yet), then stage 8 is `current`. Given `email:99999`, then 404. |
| AC-JRN-02 | Given any intake email, when its journey is built, then the row counts of the six intake and carriers tables are unchanged. |
| AC-JRN-03 | Given C190's `CONFIRM_ADDRESS` email followed by the client's answer (AC-INT-07), when requested, then the timeline shows two rounds of stages 2–6: the first ends in `CONFIRM_ADDRESS`, the second in `ALL_CLEAR`. |
| AC-JRN-04 | Given an order rejected with reason "wrong SKU", when requested, then stage 7 is `failed` with that reason and user, and stages 8–14 are `not_reached`. |
| AC-JRN-05 | Given an approved ALL_CLEAR order, when `send_to_wms` runs twice, then `order_events` holds exactly one set of events for it, all `synthetic = true`. When rerun on a fresh database, the same timestamps come back. |
| AC-JRN-06 | Given a simulated order promised for D whose `delivered` event is after D: with `asOf` before `picked_up`, stages 11–13 are `not_reached`; with `asOf` at the end of D, stage 13 is `at_risk`. |
| AC-JRN-07 | Given a past delivery with `f_cutoff` only, when requested, then only stage 4 is `failed`, and its note gives `checkPromise`'s next-day result with the reason. Given one with `f_lane` on a blocked lane, then stage 6 is `failed`, and the note names the recommended carrier and reason. |
| AC-JRN-08 | Given any journey with synthetic stages, when the page renders, then each of those stages shows the "Synthetic data" badge (Playwright, C10). |
| AC-JRN-09 | Given the Intake detail of email 7, when "Order journey" is clicked, then `/dashboard/journey/email:7` opens and shows the timeline. |
| AC-JRN-10 | Given the pipeline has run, when `journey_timing` is queried, then each (warehouse, commitment) row has n > 0 and the medians match a pandas recomputation from `deliveries.csv`. |
| AC-JRN-12 | (Stretch.) Given an `at_risk` order, when the notice is drafted, then it is addressed to the client's allow-listed address, stays unsent until an operator approves it, and a non-allow-listed address is refused. |
| AC-NFR-JRN-01 | Given the demo database, when 50 journeys are requested, then p95 < 500 ms. |
| AC-SEC-JRN-01 | Given fixture C190 (with a contact name and phone), when its journey is returned, then the JSON has no name, phone or email address. |
| AC-SEC-JRN-02 | Given any journey request, then no row changes in `recommendations`, `audit_log` or `override_log`. |
| AC-SEC-JRN-03 | Given a journey request for `email:7`, when Application Insights (`AppServiceConsoleLogs`) is queried, then a line with `"emailId":7` appears. |

## 7. Technical design

```
Intake (A) ──────────────┐
  intake_emails          │
  intake_extractions     │
  outbound_messages      ├──▶ GET /api/journey/:ref ──▶ /dashboard/journey/<ref>
  audit_log              │        (Node, read-only)          timeline + badges + "as of"
Carriers (C) ────────────┤
  recommendations        │
  override_log           │
  carrier_events (SD-07) │
  order_events  ◀── written once at send_to_wms (Node, synthetic)
Python pipeline ─────────┤
  deliveries_clean       │
  delivery_causes        │
  lane_scores            │
  journey_timing (new)   ┘
```

- **Module (as built):** in the Carriers area, which owns D9: `backend/api/src/modules/carriers/journey.ts` (pure stage
  builders, tested without a database), reads in `queries.ts`, the route in `routes.ts`. Being inside Carriers lets the
  past-delivery note use `laneRows` + `recommendFromLane` directly, which log nothing; the public `recommendCarrier`
  writes a `recommendations` row and would break REQ-JRN-02.
- **Table `order_events`** (migration `301_order_events.sql`, writer: Node journey module): `id`, `order_ref`, `event`
  (`wms_entered` | `picked` | `picked_up` | `in_transit` | `out_for_delivery` | `delivered`), `ts`, `detail jsonb`,
  `synthetic boolean`, unique (`order_ref`, `event`).
- **Table `journey_timing`** (writer: Python, `backend/analytics/carriers/journey.py`): `warehouse`, `commitment`,
  `median_hours_to_ship`, `n`.
- **Hook into WMS entry:** `applyAction(… 'send_to_wms')` calls `journey.simulateForward(orderRef)` after setting
  ENTERED. This is the one change in A's module; it needs A's review.
- **Contracts:** the response shape goes in `docs/CONTRACTS.md` as `Journey { ref, kind: 'order' | 'delivery',
  stages: Stage[] }`, `Stage { n, key, label, status, ts, actor, source, check, note, synthetic }`.
- **Screen:** `frontend/app/dashboard/journey/[ref]/page.tsx` with `frontend/components/dashboard/journey/`. It is a
  vertical timeline using the existing theme tokens, an "as of" date control, and a link back to Intake or Carriers.

## 8. Tiers and plan (deadline Thu 29 Oct)

| Part | Tier | Estimate | Depends on |
|---|---|---|---|
| Past-delivery journey (REQ-JRN-01, -07, SEC) | Core | **Built (C11)** | B5 causes, C6 tracking |
| New-order journey, stages 1–9 (REQ-JRN-01–04) | Core | **Built (C11)**; the Intake link (REQ-JRN-09) waits for A's open changes | A8 intake |
| Simulated stages 10–13 (REQ-JRN-05, -06, -10) | Synthetic | 2 h, not built | A's review of the `send_to_wms` hook |
| Delay notice (REQ-JRN-12) | Stretch | — | E10 |

Drop order if behind: delay notice → simulated stages → new-order journey. The past-delivery journey stays: it is the
per-order proof of SPEC §2.2.

## 9. Out of scope

- A real WMS or carrier API: both stay simulated (Q-002; carrier portals are pitch only).
- Notices to the client's end customer: Halcyon is the client's only contact (Q-004).
- Changing any order from the journey page: it is read-only; actions stay on Intake (SEC-04).
- Route optimisation for `f_route` deliveries (routing pilot, SPEC §1.1).
- User accounts and roles per stage (P7, `docs/SPEC-auth.md`, built after submission); the actor is shown as recorded in `audit_log` (name or role: Q-AUTH-05).

## 10. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Simulated delivery stages read as real tracking | Badge on every synthetic stage and a page note (REQ-JRN-08); simulated data never feeds a headline figure (SPEC §12.1). |
| A "With LateLens" note reads as a guaranteed on-time result | The note shows the rule's output only; on-time rates appear only on Replay (§4.3). |
| Touching A's `send_to_wms` the day before submission | The hook is one call after ENTERED and fails safe: an error is logged and the order stays ENTERED. A reviews it before merge. |
| Scope too large for one day | Tiered as in §8; the past-delivery journey alone meets the success measure for the "before pickup" argument. |

## 11. Open items

- Owner: Carriers (Task C11).
- `[WMS_CONTRACT]`: the WMS order number format follows the assumed interface once A adds it to CONTRACTS.md (SPEC §12).
- Add D9 to SPEC §3 and the demo script (§11) once the team agrees: after "ALL_CLEAR", open the order's journey and move "as of" to the delivery day.

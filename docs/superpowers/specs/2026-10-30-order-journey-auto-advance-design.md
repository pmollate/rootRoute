# Design: auto-advance approved orders through the WMS and carriers (D9 follow-up)

Status: agreed with Priyank, 30 Oct 2026. Builds on `2026-10-30-order-journey-simulator-design.md` (the simulator design).

## 1. Problem

A new email order stops after approval. Steps 9–13 (entered in WMS, picked, handed to carrier, in transit, delivered)
move only when a warehouse supervisor clicks "Send to WMS" and then someone clicks each step on in the local simulator
(`tools/wms-simulator`), which listens on 127.0.0.1 and is not deployed. On the Azure app no new order ever gets past
step 9 or 10, so the journey cannot be shown end to end in a demo.

## 2. Decision

An admin switch on the Settings page, **Auto-advance approved orders**, off by default. When it is on, approving an
ALL_CLEAR order also enters it in the WMS and records steps 10–13 straight away, each with a realistic synthetic
timestamp and a `visible_at` a few seconds after the one before, so the journey fills in on screen over about 25 seconds.
Every delivery is on time when the promise date allows it.

This reverses, for orders approved while the switch is on, the simulator design's decision "manual steps, not a clock"
(simulator design §2). With the switch off, everything works as that design says.

| Option | Verdict |
|---|---|
| A. Write all events at approval, each with a `visible_at` | **Chosen.** No timers: an App Service restart or a second instance cannot leave an order half done or record a step twice |
| B. Timers in the API process post each step a few seconds apart | Rejected: a restart or deploy mid-run strands the order, the same stall this fixes |
| C. Deploy the simulator to Azure with a scheduler | Rejected: a second app to host, secure and schedule, for a demo switch |

Decisions taken with the user (30 Oct): demo clock (seconds apart on screen, realistic timestamps); always on time;
one app-wide switch that only admins change.

## 3. What stays manual

- **Step 7, approval**, stays a person's click (order desk or admin). CLAUDE.md: an operator approves every ALL_CLEAR
  order before WMS entry. Auto-advance starts only after that approval.
- **Step 8, the reply to the client**, stays a person's click: it is outbound email (SPEC §8, allow-list).
- **Step 14, delay notice**, is not built (REQ-JRN-12) and is out of scope.

## 4. The setting

- Table `app_settings (key text PRIMARY KEY, value jsonb NOT NULL, updated_by text NOT NULL, updated_at timestamptz NOT
  NULL DEFAULT now())`, migration `backend/db/migrations/302_app_settings.sql` (owner C, with `order_events`; 0xx is B's). One row:
  `auto_advance` = `true` / `false`. No row means off.
- One writer: a new API module `backend/api/src/modules/settings/` (repo, routes). Python never reads or writes it.
- `GET /api/settings` → `{ autoAdvance: boolean }`, every signed-in role (the Settings page shows it to all).
- `POST /api/settings/auto-advance` (POST: the web proxy `app/api/[...path]` forwards only GET and POST) with `{ enabled: boolean }`, **admin only**. Each change writes an `audit_log` row
  (`action` `set_auto_advance`, `ref` `setting:auto_advance`, payload `{ enabled }`), actor from the session (REQ-AUTH-07).
- Both routes go in `core/permissions.ts` and the frontend role map (`lib/auth/roles.ts`).

## 5. On approval

In `applyAction` (`modules/intake/actions.ts`), after an `approve` succeeds on an ALL_CLEAR order and the setting is on:

1. Check the order has a promise, warehouse and carrier (`wmsOrder` returns non-null). If not, stop here: the order
   stays `APPROVED` and is handled by hand, as today.
2. Build the six events (§6) and record them through the existing order-event writer (`modules/carriers`
   `recordOrderEvent`), in order. The writer keeps its order and repeat rules; "already recorded" counts as success.
3. Set the status to `ENTERED` and write an audit row `send_to_wms` with actor `system:auto-advance` and payload
   `{ wmsOrderId, auto: true }`. `wmsOrderId` is `WMS-` plus the email id padded to six digits, as the simulator makes it.
4. Return `{ status: 'ENTERED' }`.

If recording an event fails, the approval still stands (it was saved first): the response is
`{ status: 'APPROVED', warning: '<why>' }`, and the order can be sent to the WMS by hand. No partial status change.

The external WMS (`WMS_URL`) is **not** called for auto-advanced orders: the API stands in for the WMS and carriers. With
`WMS_URL` set and the switch on, auto-advance wins; the local simulator never receives those orders.

`send_to_wms` on an order already `ENTERED` returns `200 { status: 'ENTERED' }` and does nothing. This lets the
"Approve & send" button's chain (`approve → send_reply → send_to_wms`) finish cleanly when the approval already entered
the order. The reply still goes out from `ENTERED` (the API allows it, and PR #86 shows "Send reply" for an order in
the WMS whose reply has not gone out).

## 6. Event times (synthetic, on time)

All times are local, `YYYY-MM-DD HH:mm`, as the existing `order_events.ts`. `A` = approval time, `R` = the email's
received time, `P` = the promise date.

| Event | `ts` | `visible_at` |
|---|---|---|
| `wms_entered` | `A` | approval |
| `picked` | pick-list day at 10:00: the date of `R`, or the next day if `R` is after 08:00 | approval + 5 s |
| `picked_up` | the picked day at 15:00 | + 10 s |
| `in_transit` | the picked day at 16:00 | + 15 s |
| `out_for_delivery` | `P` at 08:00 | + 20 s |
| `delivered` | `P` at 12:00 | + 25 s |

Each `ts` is moved forward to the previous event's `ts` when it would be earlier (an approval after the pick-list day
puts every later step at or after `A`; a `delivered` before `in_transit` becomes `in_transit` + 1 hour). If that pushes
`delivered` past the end of `P`, the journey shows the order late (REQ-JRN-06 rules, unchanged). The data is not
bent to look on time. `out_for_delivery` is written because the shared order rule (`checkEvent`) requires it before
`delivered`; it is never earlier than `in_transit`, and `delivered` is at least an hour after it.

`detail` on `wms_entered` is `{ wmsOrderId, auto: true }`; the other events carry `{ auto: true }`.

## 7. Showing events over time

- Migration `backend/db/migrations/303_order_events_visible_at.sql`:
  `ALTER TABLE order_events ADD COLUMN visible_at timestamptz NOT NULL DEFAULT now()`. Existing rows and events from
  the simulator get `now()`, so they show at once as before.
- `insertOrderEvent` and `recordOrderEvent` take an optional `visibleAt`. `orderEventRows` (`modules/carriers/queries.ts`)
  gets a `{ visibleOnly }` option that adds `AND visible_at <= now()`. The journey (`emailFacts` in `queries.ts`, the only other reader) reads with
  `visibleOnly: true`, so steps that have not shown yet are left out. The writer's order and repeat check
  (`recordOrderEvent` → `checkEvent`) must keep reading **every** row; otherwise auto-advance could not record `picked`
  after a `wms_entered` that is not visible yet, and a simulator repeat could slip past a hidden row.
- The comment on `FEED_EVENTS` changes to "`wms_entered` is written only by send_to_wms and by auto-advance".
- The journey page already refetches when an order is reselected. It also refetches every 5 seconds while the shown
  order is a new order with status `ENTERED` and no `delivered` step, and stops when delivered or after 60 seconds.

## 8. Journey wording

- Step 9 actor for an auto-advanced order: "Auto-advance (simulated)"; detail "Entered in the simulated WMS as
  `<wmsOrderId>` automatically." Steps 10–13 keep the simulator's wording; their source stays `synthetic` and the page
  keeps its synthetic-data note (REQ-JRN-08).

## 9. Settings page

A new "Order journey" card on `/dashboard/settings`, a small client component (the page is a server page):

- A switch "Auto-advance approved orders through the WMS and carriers", with the line "Synthetic: the API stands in
  for the WMS and carriers. Approval and the reply to the client stay manual."
- Admins can change it; every other role sees the state read-only with "Only an admin can change this."
- A failed save shows the error and puts the switch back.

## 10. Requirements (to add to `docs/SPEC-order-workflow.md`, with the code)

| ID | Requirement |
|---|---|
| REQ-JRN-14 | An admin **MAY** switch on auto-advance. While it is on, approving an ALL_CLEAR order **MUST** enter it in the WMS and record steps 10–13 as synthetic events; approval and the reply **MUST** stay manual. |
| REQ-JRN-15 | Auto-advanced steps **MUST** become visible a few seconds apart and **MUST NOT** carry a timestamp earlier than the step before. Delivery **SHOULD** be on the promise date; when it cannot be, the order **MUST** show as late. |
| SEC-SET-01 | Only an admin **MUST** be able to change the auto-advance setting, and every change **MUST** be written to the audit log with its actor. |

## 11. Testing (acceptance criteria)

| AC | Given / when / then | Where |
|---|---|---|
| AC-JRN-15 | Given the switch on and an ALL_CLEAR order with promise, warehouse and carrier, when it is approved, then the status is `ENTERED`, six events exist in order with non-decreasing `ts` and `visible_at` 0/5/10/15/20/25 s after approval, and the audit has `send_to_wms` by `system:auto-advance` | `actions` unit (memory repo) |
| AC-JRN-16 | Given the switch off, when an order is approved, then the status is `APPROVED` and no event is written | `actions` unit |
| AC-JRN-17 | Given auto-advanced events and `now` = approval + 7 s, then the journey shows steps 9–10 done, 11 current, 12–13 not reached; at + 26 s, step 13 is done | route test (test DB) |
| AC-JRN-18 | Given an approval after the promise date, then `delivered` is after `in_transit` and step 13 is `failed` "N days late" | `journey` unit |
| AC-JRN-19 | Given an order already `ENTERED`, when `send_to_wms` is posted, then 200 `ENTERED` and nothing new is written | `actions` unit |
| AC-SET-01 | `POST /api/settings/auto-advance` is 403 for every role but admin; for admin it saves and writes one audit row | route test + `permissions.test.ts` |
| AC-SET-02 | The Settings card toggles for admin and is read-only for order desk | `frontend` screen test |

## 12. Documents to update with the code

- Simulator design §2 and §13: "manual steps unless auto-advance is on (this design)".
- `docs/SPEC-order-workflow.md`: REQ-JRN-14, -15 and the ACs above; SPEC §8 or SPEC-auth §4.2: SEC-SET-01 and the two
  routes.
- SPEC §14.1 discovery log: 30 Oct, Priyank asked for steps 9–13 to run automatically with a Settings switch; answer
  this design.
- `docs/CONTRACTS.md`: `app_settings`, `order_events.visible_at`, `GET /api/settings`, `POST /api/settings/auto-advance`.

## 13. Out of scope

Automatic approval or reply; late deliveries on purpose (D000213 and D000559 cover late cases);
deploying the simulator; a real WMS or carrier API; per-user settings; backfilling orders approved before the switch was
turned on (they still need "Send to WMS").

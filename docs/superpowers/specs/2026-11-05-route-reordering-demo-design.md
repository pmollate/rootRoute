# Route reordering demo (C9c, synthetic): design

Date: 5 Nov 2026 · Owner: Carriers · Status: design approved by the user in session, written for review ·
Follows: `docs/superpowers/plans/2026-11-04-route-overruns.md` (C9a), where this was "phase 3".

## 1. Why and what

C9a showed what Halcyon's route data says: 2,880 routes ran more than 20% over plan, at about the same rate in every
slice known before despatch, and the data has no stop locations, stop order or road network (SPEC §5.18). The team wants a
demo of what route reordering does, without implying the data supports a routing engine.

**C9c is one picture of one route.** In Labs, the viewer picks a delivery and sees invented stop positions for it, the
order a reasonable dispatcher would plan, the shorter order a reordering finds, and the delivery's real planned and
actual kilometres. The point it makes honestly is this: reordering can shorten a plan a little, but `f_route` measures
the actual route against the plan, so a shorter plan does not change the overrun.

**Out of this design:** any aggregate "routing would save X%" figure, any use of these numbers in the replay, Overview,
assistant or MCP, any model of the routing vendor's product, real maps or road distances, and multi-vehicle routing.

## 2. Scope decision (team, 5 Nov)

The team lifts OS-03 for this demo only (SPEC v0.21):
- A routing engine or optimiser for Halcyon's real routes stays out (C9b, OS-03).
- C9c is allowed as a synthetic illustration, badged "Synthetic data", that feeds no headline figure, the replay, the
  assistant or MCP.
- The CLAUDE.md product rule is unchanged: C9c is our own illustration on invented points, not a model of another
  company's product.

## 3. Data and computation (Python computes, Node looks up)

**SD-11 generator:** `backend/synthetic-data/generators/sd11_route_stops.py`. It is seeded by the delivery id, so the same
delivery always gives the same stops.
1. Place `stops_on_route` points (6–40 in the data) at random in a disc around the fulfilment warehouse, which is the
   depot at (0, 0). Distances are straight-line.
2. Planned order = a nearest-neighbour tour from the depot and back: the plan a reasonable dispatcher would make. A random
   order is avoided, because optimising it "saves" 40–60%, a figure that comes only from the generator.
3. Scale every point so the planned tour's length equals the delivery's real `planned_route_km`.

**Optimiser:** `backend/analytics/routes/demo.py`. It runs 2-opt on the planned tour (numpy; milliseconds per route) and
writes the optimised order and `optimised_km`. `optimised_km` is never longer than `planned_km`. There is no new
dependency: OR-Tools was considered and not chosen (about 100 MB, slower, and the same tours within a few percent for
6–40 stops).

**Table `route_demo`:** written by the pipeline's `routes` step (owner C, one writer), replaced on every run. One row per
delivery:

| Column | Meaning | Real or synthetic |
|---|---|---|
| `delivery_id`, `n_stops` | the delivery and its `stops_on_route` | real |
| `stops` | JSON array of `[x, y]` km from the warehouse, in stop-number order | synthetic |
| `planned_order`, `optimised_order` | JSON arrays of stop numbers (the depot is implied at both ends) | synthetic |
| `planned_km` | `planned_route_km` | real |
| `optimised_km` | length of the optimised order on the invented points | synthetic |
| `actual_km` | `actual_route_km`, null when blank | real |
| `overran` | `f_route` (§5.1) | real |
| `example` | `overrun` / `on_plan` / `no_distance` on one row each (the lowest delivery id of each kind whose reordering is shorter than the plan; fallback: lowest id), else null: the card's chips | chosen by Python |
| `synthetic` | always true | — |

Size is about 48,340 rows and roughly 25 MB. The step adds an estimated 1–3 minutes to `npm run pipeline`. It runs unless
`ROUTE_DEMO=off`; `analytics/bench.py` sets that for the SD-09 scale runs (×10 data and the second client), so the scale
timings and golden checks stay as they are.

## 4. API (Node, read-only)

In `backend/api/src/modules/carriers/`:
- `GET /api/labs/route-demo` → `{ synthetic: true, examples: [{ deliveryId, kind }] }`.
- `GET /api/labs/route-demo/:deliveryId` → `{ synthetic: true, deliveryId, nStops, stops, plannedOrder, optimisedOrder,
  plannedKm, optimisedKm, actualKm, overran }`.
- Errors:
  - 400 `{ error: "bad_delivery_id" }` when the id is not `D` plus six digits.
  - 404 `{ error: "not_found" }` for an unknown id.
  - 503 when the table is empty or missing, as `GET /api/routes/overruns` does.
- Roles: the Labs roles (`warehouse_supervisor`, `carrier_manager`, `leadership`, `admin`), as `GET /api/compare`. They are
  added to `core/permissions.ts` and SPEC-auth §4.4.
- No assistant or MCP tool reads `route_demo`.

## 5. Labs card (frontend)

`frontend/components/dashboard/replay/RouteDemoCard.tsx`, placed on the Labs screen after the replay cards:
- **Header:** title "One route: planned vs reordered" and the **Synthetic data** badge.
- **Picking a delivery:** an id box (`D000123`) and the three example chips from `GET /api/labs/route-demo`.
- **Drawing:** inline SVG, scaled to fit, working in both themes and at 375 px.
  - The warehouse is a square; stops are dots.
  - The planned order is a muted dashed line; the reordered order is a solid accent line.
  - A two-item legend names the lines. A per-stop tooltip gives the stop number in each order.
- **Figures:**
  - Planned km (real).
  - Reordered km (synthetic, "x% shorter than the plan").
  - Actual km driven (real), with "over plan by y%" when `overran`, or "no actual distance recorded" when null.
- **One fixed sentence:** "Stop positions are invented (SD-11): the saving shows what reordering does on these points, not
  on Halcyon's routes. The overrun compares the actual route with the plan, so a shorter plan does not change it."
- **Errors:**
  - 404 shows "No delivery with that id."
  - Anything else shows the usual fixed "Could not load this section…".
  - No server text is ever shown.
- **Wording:** no verdict and no vendor (OS-01, OS-02).

## 6. Requirements (to become SPEC §5.19)

| ID | Requirement |
|---|---|
| REQ-RDEMO-01 | SD-11 **MUST** place `stops_on_route` points per delivery, seeded by the delivery id, with a nearest-neighbour planned order whose length equals `planned_route_km` (to 0.01 km). |
| REQ-RDEMO-02 | The optimiser **MUST** return an order that visits every stop once and starts and ends at the warehouse, with `optimised_km` ≤ `planned_km`. |
| REQ-RDEMO-03 | The pipeline **MUST** write `route_demo` (columns above, `synthetic` true, one row per delivery, the three examples) unless `ROUTE_DEMO=off`, which the scale runs set. |
| REQ-RDEMO-04 | `GET /api/labs/route-demo[/:deliveryId]` **MUST** serve the table to the Labs roles as in §4, with 400, 404 and 503 as stated. |
| REQ-RDEMO-05 | The Labs card **MUST** show the badge, the drawing, the three figures marked real or synthetic, and the fixed sentence. |
| REQ-RDEMO-06 | No headline figure, replay scenario, Overview or Carriers figure, assistant tool or MCP tool **MAY** read `route_demo`. |

Each REQ gets an AC with the same number. The tests in §7 name them.

## 7. Testing

- **Python** (`backend/analytics/tests/test_route_demo.py`):
  - The same id gives the same stops, and two ids give different stops.
  - Planned length = `planned_route_km` ± 0.01 km for 6, 23 and 40 stops.
  - `optimised_km` ≤ `planned_km` on every row of the supplied data.
  - Both orders are permutations of the stops.
  - One example of each kind exists.
  - `ROUTE_DEMO=off` leaves the table out.
  - `test_pipeline` and `test_scale` table and step lists are updated, and the bench golden checks still pass.
- **API** (`backend/api/test/routes/route-demo.test.ts`):
  - The response shape, and the 400, 404 and 503 cases.
  - The role refusals with `AUTH_REQUIRED=on`.
  - A scan showing that no file in `modules/mcp/` or `modules/assistant/` reads `route_demo` (REQ-RDEMO-06).
- **UI** (`RouteDemoCard.test.tsx`):
  - The badge, the fixed sentence, the three figures and their labels, the example chips, and the 404 message.
  - No `sign`, `vendor` or `approve` text.
- **Preview:** Labs on desktop, at 375 px and in dark theme, with no console errors.

## 8. Risks

| Risk | Mitigation |
|---|---|
| A viewer reads "x% shorter" as a Halcyon finding | Badge, the fixed sentence, "synthetic" on the figure itself, no aggregate anywhere (REQ-RDEMO-06) |
| Pipeline gets slower | Measured in the plan's first task; the scale runs skip the step; if over 3 minutes, vectorise 2-opt further before adding the card |
| Table size in Postgres | About 25 MB, acceptable on the existing Flexible Server; checked after the first run |
| Scope creep toward a routing engine | §1 "out of this design"; OS-03 keeps C9b out |

## 9. Files

- **New:**
  - `backend/synthetic-data/generators/sd11_route_stops.py`
  - `backend/analytics/routes/demo.py`
  - `backend/analytics/tests/test_route_demo.py`
  - `backend/api/src/modules/carriers/routeDemo.ts`
  - `backend/api/test/routes/route-demo.test.ts`
  - `frontend/components/dashboard/replay/RouteDemoCard.tsx`, `RouteDemoCard.test.tsx`
- **Changed:**
  - Python: `backend/analytics/routes/__init__.py`, `backend/analytics/bench.py`
  - API: `backend/api/src/modules/carriers/{queries,routes}.ts`, `backend/api/src/core/permissions.ts`
  - Frontend: `frontend/components/dashboard/replay/ReplayScreen.tsx`
  - Docs: `docs/SPEC.md` (v0.21: §3, OS-03, §5.19, §12.1 SD-11, §14.1), `docs/CONTRACTS.md` (§4, §6), `docs/SPEC-auth.md` (§4.4)

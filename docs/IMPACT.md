# Impact: before vs after, and what is new

What Root Route changes, in Halcyon's own KPIs, and the new ideas behind it, each with a before-vs-after comparison.
Every figure is computed from the supplied dataset (48,340 deliveries, orders 1 Apr – 25 Sep 2026) and asserted by a
test; the method is under each table. These are replayed estimates on past deliveries, not observed results: the
pilot in SPEC §9.2 is how Halcyon would measure them for real.

## 1. Before vs after on Halcyon's KPIs (6 months)

| KPI (Halcyon's own) | Today | With Root Route as built | Full programme |
|---|---|---|---|
| On-time delivery rate | **71.0%** | **85.9%** | **92.0%** |
| Late deliveries | 14,019 | 6,828 (−7,191) | 3,869 (−10,150) |
| Late-delivery handling + SLA penalties | $1,349,106 | ≈ $641K (−$707,950) | ≈ $368K (−$980,764) |
| On-time, email orders | 70.7% | 89.6% | 92.6% |
| On-time, the 9 at-risk accounts ($14.2M a year) | 70.7% | 86.8% | 92.1% |
| Gap to the 94% benchmark | 23.0 points | 8.1 points | 2.0 points |

For comparison, on the same data and the same method, the best case for routing (carrier lanes + route overruns,
every one fixed) is **80.4%** (SPEC §2.4).

**Method.** Each delivery carries five cause flags (SPEC §5.1). The replay switches on a fix and marks a late
delivery on time when the fix removes all of its causes, at an expected adoption rate per fix (address 85%, lanes and
Friday cap 90%, cut-off promise 85%, warehouse fallback 60%, last-mile watch 30%; SPEC §2.4). "As built" is the
fixes this build delivers: email address check, cut-off-aware promise, nearest-warehouse rule, lane rules with a
Friday cap. Cost avoided = $34 handling per late delivery avoided + $180 × late deliveries avoided for clients with a
penalty clause × 0.708 (the share of such penalties actually paid, 4,847 / 6,849). Code:
`backend/analytics/core/scenarios.py`. Test: `backend/analytics/tests/test_scenarios.py` asserts every row to 0.1
point (AC-DIAG-04). On screen: Replay, and its "Today vs with Root Route" card.

## 2. What is new, and the difference it makes

### 2.1 Judge carriers on fair data only

**Idea.** Remove deliveries that were already going to be late before pickup (incomplete address, wrong warehouse,
same-day order after the cut-off) before scoring a carrier, then score each carrier per destination region (lane).

| | Raw on-time (what a carrier scorecard shows today) | Fair data (Root Route) |
|---|---|---|
| Carriers A, B, C (27,157 deliveries) | 75.3% | **95.2%** |
| Carrier F into the Northeast and Southeast | 54.9% | **55.8%** |
| Carrier F into the Midwest and West | 75.4% | **95.5%** |
| Gap between a good lane and a bad lane | 20 points | **40 points** |

**Difference.** Raw data makes every carrier look about 75% on time and blames them for causes before pickup, which
is how carrier routing came to look like the problem. On fair data, good lanes are 95% and five bad lanes stand out at
53–58%, so the fix is five lane rules and a Friday cap, not a new engine. Lane rules trained on Apr–Jul reach 78.2% on
held-out Aug–Sep (backtest, SPEC §5.2). Computed with `backend/analytics/core/load.py` flags; lane scores in
`backend/analytics/carriers/lanes.py`, tested in `backend/analytics/tests/`.

### 2.2 Attribute each late delivery fairly between its causes

**Idea.** Many late deliveries have two causes. Share each one between its causes (Shapley attribution) so the
points lost add up exactly to the gap.

| | Counting deliveries per cause | Shapley attribution (Root Route) |
|---|---|---|
| Sum over the five causes | 16,515 cause hits for 14,019 late deliveries (2,362 have two or more causes): double counted | **29.0 points = exactly 100% − 71.0%** |
| Carrier lane / D on Friday | 4,550 late deliveries, 32% of the late ones | 7.6 points, 26% of the gap |

**Difference.** Each cause gets one number and one owner (SPEC §1.4), so fixes are not double counted. Test:
`test_cause_attribution_sums_to_lateness` (AC-DIAG-07).

### 2.3 AI reads the email, code decides, a person approves

**Idea.** The model only turns a messy email into JSON. Code checks the address and makes the decision; the order
goes to the WMS only after an operator approves it.

| | Today | Root Route |
|---|---|---|
| Incomplete address found | When the delivery fails (27.8% of email orders) | At intake, before the pick list; the client is asked by a drafted reply |
| Decision on the 50 fixture emails | Keyed by hand | ≥ 48 of 50 correct; field accuracy ≥ 90%; incomplete-address recall ≥ 95% (extraction eval, AC-INT-04/05) |
| Time from email to decision | Keyed later; 78% of email orders are stamped after 08:00 | [DECISION_TIME] (AC-NFR-02, `backend/api/test/intake/`) |
| On-time, email orders (replay) | 70.7% | 89.6% as built |

### 2.4 Today vs with Root Route, one delivery at a time

**Idea.** The Order journey replays a single past delivery stage by stage, then shows the same order with Root
Route's decisions switched on (e.g. D000213: address confirmed first, lane moved to a better carrier).

**Difference.** A supervisor sees why one order was late and what would have changed, not only the totals. Tested in
`frontend/e2e/journey.spec.ts` and `frontend/components/dashboard/journey/`.

## 3. Where to see it

| Evidence | Where |
|---|---|
| Before/after on screen | Dashboard → Replay ("Today vs with Root Route"), Overview |
| Golden numbers | `backend/analytics/tests/test_scenarios.py` |
| Test run | [`TEST-EVIDENCE.md`](TEST-EVIDENCE.md) |
| Scale and reuse | [`SCALE-RUN.md`](SCALE-RUN.md) |

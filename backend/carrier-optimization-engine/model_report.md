# Carrier risk model + optimizer: results

Rows: 48,340 raw, 47,870 after cleaning. Train: Apr-Jul 2026 (early stop on Jul). Test: Aug-Sep 2026. Trees: 146.

## Risk model vs lane lookup (test set)

| Metric | ML model | Lane lookup |
|---|---|---|
| AUC (higher better) | 0.841 | 0.582 |
| Brier (lower better) | 0.138 | 0.199 |
| Log loss (lower better) | 0.422 | 0.586 |

## Calibration (test set)

| Predicted bin | Orders | Avg predicted | Actual late |
|---|---|---|---|
| (-0.001, 0.1] | 7,423 | 0.055 | 0.047 |
| (0.1, 0.2] | 236 | 0.135 | 0.064 |
| (0.2, 0.3] | 320 | 0.257 | 0.247 |
| (0.3, 0.4] | 823 | 0.352 | 0.363 |
| (0.4, 0.5] | 1,909 | 0.463 | 0.493 |
| (0.5, 0.6] | 1,742 | 0.538 | 0.526 |
| (0.6, 0.7] | 2,015 | 0.644 | 0.651 |
| (0.7, 0.8] | 620 | 0.728 | 0.740 |

## Top drivers (mean |SHAP| contribution, test set)

| Feature | Importance |
|---|---|
| address_status | 0.516 |
| lead_days | 0.344 |
| lane_late_30d | 0.297 |
| wrong_wh | 0.215 |
| distance_miles | 0.211 |
| order_channel | 0.183 |
| lane_late_7d | 0.141 |
| carrier_load | 0.074 |
| cutoff_miss | 0.065 |
| lane_sev_30d | 0.059 |
| carrier_id | 0.037 |
| lane_n_30d | 0.035 |

## Replay Aug-Sep (expected outcomes, judged independently of the ML model)

| Judge | Scenario | On-time | Cost / shipment | Freight | Orders moved | On bad lane |
|---|---|---|---|---|---|---|
| empirical | Today | 71.2% | $51.49 | $15.24 | 0% | 20.7% |
| empirical | Rules (lookup) optimizer, switch $0 | 77.5% | $43.05 | $14.47 | 82% | 0.0% |
| empirical | ML optimizer, switch $0 | 78.0% | $42.31 | $14.64 | 82% | 0.0% |
| empirical | Rules (lookup) optimizer, switch $5 | 77.7% | $43.40 | $15.01 | 22% | 0.0% |
| empirical | ML optimizer, switch $5 | 78.0% | $42.95 | $15.01 | 30% | 0.0% |
| compound | Today | 69.9% | $53.02 | $15.24 | 0% | 20.7% |
| compound | Rules (lookup) optimizer, switch $0 | 77.6% | $43.01 | $14.47 | 82% | 0.0% |
| compound | ML optimizer, switch $0 | 77.6% | $43.18 | $14.64 | 82% | 0.0% |
| compound | Rules (lookup) optimizer, switch $5 | 77.6% | $43.58 | $15.01 | 22% | 0.0% |
| compound | ML optimizer, switch $5 | 77.6% | $43.65 | $15.01 | 30% | 0.0% |

## How to read this

- The risk model predicts lateness far better than a lane table (AUC above), so it is the right engine for the whole delivery diagnostic, not just carrier choice.
- For carrier choice alone, ML and rules both reach the carrier ceiling (~78% on-time): good lanes are ~0% clean late, so once bad lanes and D overload are avoided there is little left to win.
- ML adds per-order risk, flexibility for new factors, and explanations; rules add a transparent veto.
- Data note: in this synthetic data a late shipment has one cause, so non-clean orders are about equally late on any carrier. The compound judge assumes causes stack (real-world view).
- Assumptions: surge $5/order, switch cost $5, capacity tiers from train percentiles, $180 penalty only for clients with a clause.

## Capacity tiers learned from train (orders/day)

| Carrier | Tier 1 (weekday p95) | Tier 2 (busy-day p95) | Max seen |
|---|---|---|---|
| A | 89 | 89 | 91 |
| B | 81 | 81 | 88 |
| C | 57 | 57 | 59 |
| D | 48 | 175 | 187 |
| E | 46 | 46 | 52 |
| F | 55 | 55 | 63 |

## Example explanation: order D033109 (F -> Southeast, penalty clause N)

| Carrier | P(late) | Carrier-only risk | Expected cost | Blocked | Top reasons |
|---|---|---|---|---|---|
| E | 0.04 | 0.04 | $14.17 | no | address_status (-), order_channel (-), lead_days (-) |
| B | 0.04 | 0.04 | $15.74 | no | address_status (-), order_channel (-), lead_days (-) |
| A | 0.04 | 0.04 | $16.43 | no | address_status (-), order_channel (-), lead_days (-) |
| C | 0.04 | 0.04 | $17.37 | no | address_status (-), order_channel (-), lead_days (-) |
| D | 0.26 | 0.26 | $21.03 | yes | lane_late_30d (+), order_channel (-), lane_late_7d (+) |
| F | 0.33 | 0.33 | $22.52 | yes | lane_late_30d (+), lane_late_7d (+), order_channel (-) |

## Config

```json
{
  "train_end": "2026-08-01",
  "valid_start": "2026-07-01",
  "cutoff_hour": 8,
  "trailing_windows": [
    7,
    30
  ],
  "surge_cost": 5.0,
  "switch_cost": 5.0,
  "block_delta": 0.15,
  "rule_block_rate": 0.3,
  "churn_cost": {
    "Tier 1": 0.0,
    "Tier 2": 0.0,
    "Tier 3": 0.0
  },
  "min_lane_n": 50,
  "big": 10000.0,
  "seed": 42
}
```
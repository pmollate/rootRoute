"""Lane scores and block rules on FAIR data (SPEC §5.2, C1-C2).

Carrier D's Friday shipments are left out of lane scoring: D is reliable in the Northeast and West on other days, and
its Friday failures come from overload (39% of Friday volume), which the Friday capacity cap fixes (SPEC §5.2).
"""
import numpy as np
import pandas as pd

LANE = ["region", "commitment"]
WEIGHTS = {"score_default": (0.60, 0.25, 0.15), "score_sla": (0.75, 0.15, 0.10)}
MIN_N = 30
MAX_LATE = 0.15
MEDIAN_MULTIPLE = 2.0


def lane_metrics(d: pd.DataFrame) -> pd.DataFrame:
    fair = d[d.fair & ~d.f_d_friday]
    g = fair.groupby(["destination_region", "commitment_type", "carrier_id"]).agg(
        n=("late", "size"),
        late=("late", "mean"),
        mean_days_late=("days_late", lambda s: s.clip(lower=0).mean()),
        mean_rate=("carrier_rate_usd", "mean"),
    ).reset_index().rename(columns={"destination_region": "region", "commitment_type": "commitment"})
    g["on_time"] = 1 - g.late
    g["lane_median_late"] = g.groupby(LANE).late.transform("median")
    return g


def block_reason(row: pd.Series) -> str:
    if row.n < MIN_N:
        return f"only {row.n} fair deliveries"
    if row.late > MAX_LATE:
        return f"{row.late:.0%} late on fair data (limit {MAX_LATE:.0%})"
    if row.late > MEDIAN_MULTIPLE * row.lane_median_late:
        return f"{row.late:.0%} late, over {MEDIAN_MULTIPLE:.0f}x the lane median {row.lane_median_late:.0%}"
    return ""


def _minmax(s: pd.Series) -> pd.Series:
    span = s.max() - s.min()
    return (s - s.min()) / span if span > 0 else s * 0.0


def lane_scores(d: pd.DataFrame) -> pd.DataFrame:
    g = lane_metrics(d)
    g["block_reason"] = g.apply(block_reason, axis=1)
    g["blocked"] = g.block_reason.ne("")
    for col in WEIGHTS:
        g[col] = np.nan
    for _, lane in g.groupby(LANE):
        ok = lane[~lane.blocked]
        for col, (w_on, w_days, w_cost) in WEIGHTS.items():
            score = 100 * (w_on * ok.on_time + w_days * (1 - _minmax(ok.mean_days_late)) + w_cost * (1 - _minmax(ok.mean_rate)))
            g.loc[ok.index, col] = score
    cols = ["region", "commitment", "carrier_id", "n", "on_time", "mean_days_late", "mean_rate", "lane_median_late",
            "blocked", "block_reason", "score_default", "score_sla"]
    return g[cols].sort_values(["region", "commitment", "carrier_id"]).reset_index(drop=True)

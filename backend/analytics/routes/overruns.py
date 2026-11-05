"""Route overrun diagnostics (SPEC §5.18, C9a).

Reports what the route data shows about `f_route` (actual route more than 20% over plan, §5.1): how often it happens in
each slice known before despatch, how often an overrun delivery is late, and what the late ones cost. It does not plan
or optimise routes (C9b, OS-03): the data has no stop locations, stop order or road network.
"""
import numpy as np
import pandas as pd

from analytics.core.load import RULES

HANDLING_USD = 34   # late-delivery handling cost per late delivery (SPEC §2.1)
STANDS_OUT = RULES["route_stands_out"]   # {"ratio": 1.5, "min_n": 30}: a team choice, like the lane rule (§5.2)
# Open at both ends, so a new extract with a longer or shorter route never stops the pipeline (the data's range is 6-40).
STOPS_BINS = [-np.inf, 10, 20, 30, np.inf]
STOPS_LABELS = ["up to 10", "11-20", "21-30", "31+"]


def _slices(d: pd.DataFrame) -> dict[str, pd.Series]:
    stops = pd.cut(d.stops_on_route, STOPS_BINS, labels=STOPS_LABELS).cat.add_categories("unknown").fillna("unknown")
    return {
        "all": pd.Series("all", index=d.index),
        "carrier": d.carrier_id,
        "region": d.destination_region,
        "warehouse": d.fulfilment_warehouse_id,
        "stops_band": stops.astype(str),
        "weekday": pd.to_datetime(d.shipped_ts).dt.day_name(),
        "month": pd.to_datetime(d.order_received_ts).dt.strftime("%Y-%m"),
    }


def route_overruns(d: pd.DataFrame, penalties: pd.DataFrame, points_lost: float,
                   rule: dict = STANDS_OUT) -> pd.DataFrame:
    """One row per (slice, value); columns as CONTRACTS §4 `route_overruns`."""
    measured = d.actual_route_km.notna()
    over = d.f_route.astype(bool)   # the §5.1 flag, never recomputed; a blank distance is never an overrun
    late = d.late.astype(bool)
    pen = d.delivery_id.map(penalties.groupby("delivery_id").penalty_usd.sum()).fillna(0)
    base = pd.DataFrame({
        "measured": measured, "over": over, "late": late,
        "late_over": over & late, "late_other": ~over & late, "other": ~over,
        "pen_over": np.where(over & late, pen, 0.0),
    })
    frames = []
    for name, key in _slices(d).items():
        g = base.groupby(key.rename("value"), sort=True).agg(
            n=("over", "size"), n_measured=("measured", "sum"), n_overrun=("over", "sum"),
            late_over=("late_over", "sum"), late_other=("late_other", "sum"), other=("other", "sum"),
            penalty_usd=("pen_over", "sum"),
        ).reset_index()
        g.insert(0, "slice", name)
        frames.append(g)
    t = pd.concat(frames, ignore_index=True)

    t["n_blank"] = t.n - t.n_measured
    t["overrun_rate"] = t.n_overrun / t.n_measured.where(t.n_measured > 0)
    t["late_rate_overrun"] = t.late_over / t.n_overrun.where(t.n_overrun > 0)
    t["late_rate_other"] = t.late_other / t.other.where(t.other > 0)
    t["handling_usd"] = HANDLING_USD * t.late_over
    t["points_lost"] = np.where(t.slice.eq("all"), points_lost, np.nan)

    all_rate = float(t.loc[t.slice.eq("all"), "overrun_rate"].iloc[0])
    big = t.n_measured >= rule["min_n"]
    t["ratio_to_all"] = t.overrun_rate / all_rate if all_rate > 0 else np.nan
    t["stands_out"] = t.slice.ne("all") & big & (t.overrun_rate > rule["ratio"] * all_rate)
    # A slice's range counts only values with at least min_n measured deliveries, as stands_out does.
    by_slice = t.overrun_rate.where(big).groupby(t.slice)
    t["min_rate"] = by_slice.transform("min")
    t["max_rate"] = by_slice.transform("max")
    t["spread_pts"] = (100 * (t.max_rate - t.min_rate)).fillna(0.0)

    cols = ["slice", "value", "n", "n_measured", "n_overrun", "overrun_rate", "late_rate_overrun", "late_rate_other",
            "n_blank", "penalty_usd", "handling_usd", "points_lost", "ratio_to_all", "min_rate", "max_rate", "spread_pts",
            "stands_out"]
    out = t[cols].copy()
    for c in ["n", "n_measured", "n_overrun", "n_blank", "handling_usd"]:
        out[c] = out[c].astype("int64")
    out["stands_out"] = out.stands_out.astype(bool)
    return out

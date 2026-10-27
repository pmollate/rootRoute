"""Carriers pipeline step (owner C)."""
import pandas as pd

from analytics.carriers import backtest, capacity, lanes, tracking
from analytics.core.context import Ctx


def build(ctx: Ctx) -> dict[str, pd.DataFrame]:
    d = ctx.d
    tracking.write_feeds(d)
    return {
        "lane_scores": lanes.lane_scores(d),
        "carrier_capacity": capacity.carrier_capacity(d),
        "carrier_backtest": backtest.backtest(d),
        "carrier_events": tracking.read_feeds(),
    }

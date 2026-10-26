"""Carriers pipeline step (owner C)."""
import pandas as pd

from analytics.carriers import capacity, lanes
from analytics.core.context import Ctx


def build(ctx: Ctx) -> dict[str, pd.DataFrame]:
    d = ctx.d
    return {
        "lane_scores": lanes.lane_scores(d),
        "carrier_capacity": capacity.carrier_capacity(d),
    }

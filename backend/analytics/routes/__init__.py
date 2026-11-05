"""Routes pipeline step (owner C; C9a, SPEC §5.18). Runs after core, which writes `cause_attribution`."""
import os

import pandas as pd

from analytics.core.context import Ctx
from analytics.routes import demo, overruns


def build(ctx: Ctx) -> dict[str, pd.DataFrame]:
    attribution = ctx.tables["cause_attribution"].set_index("cause")
    points = float(attribution.points_lost["f_route"])
    out = {"route_overruns": overruns.route_overruns(ctx.d, ctx.csv("sla_penalties.csv"), points)}
    if os.environ.get("ROUTE_DEMO", "on") != "off":   # C9c (SPEC §5.19); the scale runs set it off
        out["route_demo"] = demo.route_demo(ctx.d)
    return out

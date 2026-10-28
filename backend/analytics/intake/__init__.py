"""Intake pipeline step (owner A)."""
import pandas as pd

from analytics.core.context import Ctx
from analytics.intake.risk import risk_lookup


def build(ctx: Ctx) -> dict[str, pd.DataFrame]:
    complaints = ctx.csv("complaints.csv")
    at_risk = set(ctx.clients.loc[ctx.clients.account_status.eq("threatening_to_leave"), "client_id"])
    return {
        "complaints": complaints.assign(at_risk=complaints.client_id.isin(at_risk)),
        "risk_lookup": risk_lookup(ctx.d),
    }

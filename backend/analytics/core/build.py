"""Core pipeline step (owner B): diagnosis tables and replay."""
import pandas as pd

from analytics.core import diagnosis
from analytics.core.context import Ctx
from analytics.core.load import DATE_COLS
from analytics.core.scenarios import cause_attribution, scenario_breakdown, scenario_results


def build(ctx: Ctx) -> dict[str, pd.DataFrame]:
    penalties = ctx.csv("sla_penalties.csv")
    complaints = ctx.csv("complaints.csv")
    d = diagnosis.add_dq(ctx.d)
    ctx.d = d
    raw_cols = list(pd.read_csv(ctx.data_dir / "deliveries.csv", nrows=0).columns)
    clean = d[raw_cols + ["dq_bad_dates", "dq_dup_order_id"]].copy()
    for col in DATE_COLS:
        clean[col] = clean[col].astype("datetime64[us]")
    return {
        "deliveries_clean": clean,
        "clients": ctx.clients,
        "carriers": ctx.csv("carriers.csv"),
        "warehouses": ctx.csv("warehouses.csv"),
        "delivery_causes": diagnosis.delivery_causes(d),
        "dq_report": diagnosis.dq_report(d, penalties),
        "kpis": diagnosis.kpis(d, ctx.clients, penalties),
        "cause_summary": diagnosis.cause_summary(d),
        "accounts": diagnosis.accounts(d, ctx.clients, complaints),
        "scenario_results": scenario_results(d, penalties),
        "scenario_breakdown": scenario_breakdown(d, penalties),
        "cause_attribution": cause_attribution(d),
        "cause_kpis": diagnosis.cause_kpis(d, complaints),
    }

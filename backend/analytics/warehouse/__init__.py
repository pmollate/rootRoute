"""Warehouse pipeline step (owner B). Synthetic stock is added in Task B11."""
import pandas as pd

from analytics.core.context import Ctx
from analytics.warehouse import tables


def build(ctx: Ctx) -> dict[str, pd.DataFrame]:
    d = ctx.d
    penalties = ctx.csv("sla_penalties.csv")
    return {
        "warehouse_region_distance": tables.region_distance(ctx.csv("warehouse_region_distance_miles.csv")),
        "client_region_nearest": tables.client_region_nearest(d),
        "warehouse_stats": tables.warehouse_stats(d, ctx.csv("warehouses.csv")),
        "penalty_reconciliation": tables.penalty_reconciliation(d, penalties),
    }

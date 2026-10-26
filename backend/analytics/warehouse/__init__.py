"""Warehouse pipeline step (owner B)."""
import pandas as pd

from analytics.core.context import Ctx
from analytics.warehouse import stock, tables


def build(ctx: Ctx) -> dict[str, pd.DataFrame]:
    d = ctx.d
    penalties = ctx.csv("sla_penalties.csv")
    daily = stock.stock_daily(d)
    suggestions = stock.placement_suggestions(d, daily)
    return {
        "warehouse_region_distance": tables.region_distance(ctx.csv("warehouse_region_distance_miles.csv")),
        "client_region_nearest": tables.client_region_nearest(d),
        "warehouse_stats": tables.warehouse_stats(d, ctx.csv("warehouses.csv")),
        "penalty_reconciliation": tables.penalty_reconciliation(d, penalties),
        "stock_daily": daily,
        "placement_suggestions": suggestions,
        "placement_impact": stock.placement_impact(d, suggestions),
    }

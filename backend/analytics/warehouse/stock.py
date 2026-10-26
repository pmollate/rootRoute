"""SD-05 synthetic stock and W5 weekly placement suggestions (SPEC §5.11).

Synthetic: generated from the supplied deliveries so the nearest warehouse is out of stock on exactly the deliveries
flagged nearest_warehouse_had_stock == 'N'. Never used by the replay.
"""
import numpy as np
import pandas as pd

SEED = 42
SKUS_PER_CLIENT = 3


def assign_skus(d: pd.DataFrame) -> pd.Series:
    """Out-of-stock deliveries use the client's first SKU; in-stock deliveries use the others.

    Keeps every (date, nearest warehouse, client, sku) key either all out of stock or all in stock.
    """
    num = d.client_id.str[1:].astype(int)
    rng = np.random.default_rng(SEED)
    other = 2 + rng.integers(0, SKUS_PER_CLIENT - 1, size=len(d))
    idx = np.where(d.f_stock_out, 1, other)
    return pd.Series([f"SKU-{n:03d}-{i}" for n, i in zip(num, idx)], index=d.index)


def stock_daily(d: pd.DataFrame) -> pd.DataFrame:
    """One row per (date, nearest warehouse, client, sku) seen in the deliveries: qty 0 when out of stock."""
    rng = np.random.default_rng(SEED)
    s = pd.DataFrame({
        "date": d.order_received_ts.dt.strftime("%Y-%m-%d"),
        "warehouse_id": d.nearest_warehouse_id,
        "client_id": d.client_id,
        "sku": assign_skus(d),
        "out": d.f_stock_out,
    })
    keys = s.groupby(["date", "warehouse_id", "client_id", "sku"]).out.max().reset_index()
    keys["qty"] = np.where(keys.out, 0, rng.integers(20, 100, size=len(keys)))
    keys["synthetic"] = True
    return keys.drop(columns="out")


def placement_suggestions(d: pd.DataFrame, stock: pd.DataFrame, threshold: float = 0.15) -> pd.DataFrame:
    """Per client and week: move stock towards the warehouses that serve most of the client's demand."""
    demand = d.assign(week=d.order_received_ts.dt.to_period("W").dt.start_time.dt.strftime("%Y-%m-%d"))
    demand = demand.groupby(["week", "client_id", "nearest_warehouse_id"]).size().rename("orders").reset_index()
    st = stock.assign(week=pd.to_datetime(stock.date).dt.to_period("W").dt.start_time.dt.strftime("%Y-%m-%d"))
    st = st.groupby(["week", "client_id", "warehouse_id"]).qty.sum().reset_index()
    merged = demand.rename(columns={"nearest_warehouse_id": "warehouse_id"}).merge(
        st, on=["week", "client_id", "warehouse_id"], how="outer").fillna({"orders": 0, "qty": 0})
    return suggest(merged, threshold)


def suggest(merged: pd.DataFrame, threshold: float = 0.15) -> pd.DataFrame:
    """merged columns: week, client_id, warehouse_id, orders, qty."""
    rows = []
    for (week, client), g in merged.groupby(["week", "client_id"]):
        if g.orders.sum() == 0 or g.qty.sum() == 0:
            continue
        g = g.assign(demand_share=g.orders / g.orders.sum(), stock_share=g.qty / g.qty.sum())
        g = g.assign(gap=g.demand_share - g.stock_share)
        short = g[g.gap > threshold].sort_values("gap", ascending=False)
        surplus = g[g.gap < 0].sort_values("gap")
        if short.empty or surplus.empty:
            continue
        to, frm = short.iloc[0], surplus.iloc[0]
        qty = int(round(min(to.gap, -frm.gap) * g.qty.sum()))
        if qty <= 0:
            continue
        rows.append({"week": week, "client_id": client, "sku": "all", "from_warehouse": frm.warehouse_id,
                     "to_warehouse": to.warehouse_id, "qty": qty,
                     "reason": f"{to.warehouse_id} serves {to.demand_share:.0%} of orders but holds "
                               f"{to.stock_share:.0%} of stock", "synthetic": True})
    return pd.DataFrame(rows, columns=["week", "client_id", "sku", "from_warehouse", "to_warehouse", "qty",
                                       "reason", "synthetic"])


def placement_impact(d: pd.DataFrame, suggestions: pd.DataFrame) -> pd.DataFrame:
    """For each week's suggestions: out-of-stock deliveries in the following week at the (client, to_warehouse)
    pairs the suggestions would have restocked. Synthetic-data metric (AC-STK-03)."""
    week = d.order_received_ts.dt.to_period("W").dt.start_time
    oos = d.loc[d.f_stock_out, ["client_id", "nearest_warehouse_id"]].assign(week=week[d.f_stock_out])
    rows = []
    for wk, g in suggestions.groupby("week"):
        nxt = pd.Timestamp(wk) + pd.Timedelta(days=7)
        pairs = set(zip(g.client_id, g.to_warehouse))
        nxt_oos = oos[oos.week.eq(nxt)]
        avoided = sum((c, w) in pairs for c, w in zip(nxt_oos.client_id, nxt_oos.nearest_warehouse_id))
        rows.append({"week": wk, "suggestions": len(g), "avoided_next_week": int(avoided), "synthetic": True})
    return pd.DataFrame(rows, columns=["week", "suggestions", "avoided_next_week", "synthetic"])

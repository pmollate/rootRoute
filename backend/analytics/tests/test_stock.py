import pandas as pd

from analytics.warehouse import stock


def test_ac_stk_01_stock_matches_flags(d):
    """AC-STK-01: the nearest warehouse is out of stock exactly on the deliveries flagged N."""
    daily = stock.stock_daily(d)
    keys = pd.DataFrame({"date": d.order_received_ts.dt.strftime("%Y-%m-%d"), "warehouse_id": d.nearest_warehouse_id,
                         "client_id": d.client_id, "sku": stock.assign_skus(d)})
    joined = keys.merge(daily, on=["date", "warehouse_id", "client_id", "sku"], how="left", validate="many_to_one")
    assert len(joined) == 48340
    assert ((joined.qty == 0).to_numpy() == d.nearest_warehouse_had_stock.eq("N").to_numpy()).all()
    assert daily.synthetic.all()


def test_ac_stk_02_suggests_move_to_high_demand_warehouse():
    """AC-STK-02: stock moves towards the warehouse that serves most of the client's orders."""
    merged = pd.DataFrame({"week": ["2026-09-07"] * 2, "client_id": ["C001"] * 2, "warehouse_id": ["W4", "W3"],
                           "orders": [70, 30], "qty": [20, 80]})
    out = stock.suggest(merged)
    assert len(out) == 1 and out.iloc[0].to_warehouse == "W4" and out.iloc[0].from_warehouse == "W3"


def test_nfr_05_stock_reproducible(d):
    """AC-NFR-05: the seeded generator gives the same table on every run."""
    pd.testing.assert_frame_equal(stock.stock_daily(d), stock.stock_daily(d))


def test_ac_stk_03_impact_labelled_synthetic(d):
    """AC-STK-03: the placement impact is labelled synthetic and avoids some next-week stock-outs."""
    daily = stock.stock_daily(d)
    impact = stock.placement_impact(d, stock.placement_suggestions(d, daily))
    assert impact.synthetic.all() and (impact.avoided_next_week >= 0).all() and impact.avoided_next_week.sum() > 0

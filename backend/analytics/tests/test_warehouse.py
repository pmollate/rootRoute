import pandas as pd

from analytics.core.load import DATA_DIR
from analytics.warehouse import tables


def test_region_distance_long_form():
    out = tables.region_distance(pd.read_csv(DATA_DIR / "warehouse_region_distance_miles.csv"))
    assert len(out) == 20
    assert int(out.query("warehouse_id == 'W1' and region == 'Midwest'").miles.iloc[0]) == 150


def test_client_region_nearest_one_row_per_pair(d):
    out = tables.client_region_nearest(d)
    assert not out.duplicated(["client_id", "region"]).any()
    assert set(out.query("region == 'Northeast'").warehouse_id) == {"W4"}
    assert set(out.query("region == 'Midwest'").warehouse_id) <= {"W1", "W2"}


def test_warehouse_stats_totals(d):
    s = tables.warehouse_stats(d, pd.read_csv(DATA_DIR / "warehouses.csv"))
    assert len(s) == 5
    assert (int(s.cutoff_misses.sum()), int(s.cutoff_before_11.sum()), int(s.out_of_stock.sum()),
            int(s.skipped_nearest.sum())) == (4826, 2414, 6009, 691)
    assert round(s.nearest_freight_usd.sum() / s.nearest_shipped.sum(), 2) == 13.93
    assert round(s.other_freight_usd.sum() / s.other_shipped.sum(), 2) == 23.58


def test_ac_pen_01_unpaid(d, penalties):
    """AC-PEN-01: late deliveries with a penalty clause but no penalty row are listed."""
    rows = tables.penalty_reconciliation(d, penalties)
    assert len(rows) == 2002
    assert rows.warehouse_id.isin(["W1", "W2", "W3", "W4", "W5"]).all()
    assert rows.days_late.is_monotonic_decreasing

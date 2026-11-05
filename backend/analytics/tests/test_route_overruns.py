"""Route overrun diagnostics (SPEC §5.18, C9a)."""
import numpy as np
import pandas as pd
import pytest

from analytics.core.scenarios import cause_attribution
from analytics.routes import overruns

SLICES = ["all", "carrier", "region", "warehouse", "stops_band", "weekday", "month"]


@pytest.fixture(scope="module")
def points(d):
    return float(cause_attribution(d).set_index("cause").points_lost["f_route"])


@pytest.fixture(scope="module")
def table(d, penalties, points):
    return overruns.route_overruns(d, penalties, points)


def _all(t: pd.DataFrame) -> pd.Series:
    return t[t.slice.eq("all")].iloc[0]


def _fixture(rates: dict[str, tuple[int, float]], blanks: int = 0) -> pd.DataFrame:
    """Synthetic deliveries: carrier -> (measured deliveries, overrun share); plus `blanks` with no actual km."""
    rows = []
    for carrier, (n, share) in rates.items():
        k = round(n * share)
        for i in range(n):
            rows.append({"carrier_id": carrier, "f_route": i < k, "actual_route_km": 50.0})
    for _ in range(blanks):
        rows.append({"carrier_id": "A", "f_route": False, "actual_route_km": np.nan})
    f = pd.DataFrame(rows)
    f["delivery_id"] = [f"D{i:06d}" for i in range(len(f))]
    f["destination_region"] = "Midwest"
    f["fulfilment_warehouse_id"] = "W1"
    f["stops_on_route"] = 12
    f["shipped_ts"] = pd.Timestamp("2026-04-01 13:00")
    f["order_received_ts"] = pd.Timestamp("2026-04-01 07:00")
    f["late"] = f.f_route
    return f


NO_PENALTIES = pd.DataFrame({"delivery_id": [], "penalty_usd": []})


def test_ac_route_01_counts(d, table):
    """AC-ROUTE-01: all-row counts; every slice sums to the whole; overruns are exactly f_route."""
    a = _all(table)
    assert (a.n, a.n_measured, a.n_overrun) == (48_340, 47_001, 2_880)
    assert list(table.slice.unique()) == SLICES
    sums = table.groupby("slice")[["n", "n_overrun"]].sum()
    assert (sums.n == 48_340).all() and (sums.n_overrun == 2_880).all()
    assert int(d.f_route.sum()) == a.n_overrun
    assert a.overrun_rate == pytest.approx(2_880 / 47_001)


def test_ac_route_02_cost(d, penalties, table, points):
    """AC-ROUTE-02: late rates, handling ($34 x late overruns), penalties and points lost on the all row."""
    a = _all(table)
    late_over = d[d.f_route & d.late]
    assert a.late_rate_overrun > a.late_rate_other
    assert a.late_rate_overrun == pytest.approx(d[d.f_route].late.mean())
    assert a.handling_usd == 34 * len(late_over)
    assert a.penalty_usd == penalties[penalties.delivery_id.isin(late_over.delivery_id)].penalty_usd.sum()
    assert a.points_lost == pytest.approx(points)
    assert table[table.slice.ne("all")].points_lost.isna().all()


def test_ac_route_03_blanks(table):
    """AC-ROUTE-03: deliveries with no actual route distance are counted, never flagged, never dropped."""
    a = _all(table)
    assert a.n_blank == 1_339 and a.n_measured + a.n_blank == a.n
    f = _fixture({"A": (40, 0.1)}, blanks=1)
    fa = _all(overruns.route_overruns(f, NO_PENALTIES, 0.0))
    assert (fa.n, fa.n_blank, fa.n_measured, fa.n_overrun) == (41, 1, 40, 4)


def test_ac_route_04_stands_out(table):
    """AC-ROUTE-04: nothing stands out in the supplied data; a high carrier does, unless it is under min_n."""
    assert not table.stands_out.any()
    carrier = table[table.slice.eq("carrier")]
    assert (carrier.spread_pts == carrier.spread_pts.iloc[0]).all() and carrier.spread_pts.iloc[0] > 0

    f = _fixture({"A": (100, 0.20), "B": (100, 0.05), "C": (100, 0.05), "D": (100, 0.05)})
    t = overruns.route_overruns(f, NO_PENALTIES, 0.0)
    out = t[t.stands_out]
    assert list(zip(out.slice, out.value)) == [("carrier", "A")]
    assert t[t.slice.eq("carrier")].spread_pts.iloc[0] == pytest.approx(15.0)

    small = _fixture({"A": (20, 0.20), "B": (100, 0.05), "C": (100, 0.05), "D": (100, 0.05)})
    ts = overruns.route_overruns(small, NO_PENALTIES, 0.0)
    assert not ts.stands_out.any()
    # The range leaves out values under min_n too, so a small value never stretches it.
    c = ts[ts.slice.eq("carrier")]
    assert (c.min_rate.iloc[0], c.max_rate.iloc[0]) == pytest.approx((0.05, 0.05))
    assert c.set_index("value").ratio_to_all["A"] == pytest.approx(0.20 / (19 / 320))


def test_stops_outside_the_data_range_do_not_stop_the_pipeline():
    """Review R5-5: a route with 3 or 55 stops lands in an open-ended band; every slice still sums to n."""
    f = _fixture({"A": (40, 0.1)})
    f.loc[0, "stops_on_route"], f.loc[1, "stops_on_route"] = 3, 55
    t = overruns.route_overruns(f, NO_PENALTIES, 0.0)
    bands = t[t.slice.eq("stops_band")].set_index("value").n
    assert bands["up to 10"] == 1 and bands["31+"] == 1 and bands.sum() == 40


def test_slice_values(table):
    """§5.18 slices: stops bands, weekday of shipping, order month."""
    by = table.groupby("slice").value.apply(set)
    assert by["stops_band"] == {"up to 10", "11-20", "21-30", "31+"}
    assert by["weekday"] <= {"Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"}
    assert by["month"] == {"2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"}
    assert by["carrier"] == set("ABCDEF")

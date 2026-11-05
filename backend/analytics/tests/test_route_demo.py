"""Route reordering demo (C9c, SPEC §5.19): SD-11 stops, 2-opt reordering, the route_demo table."""
import importlib.util
import json
import os
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from analytics.routes import demo

GEN = Path(__file__).resolve().parents[2] / "synthetic-data" / "generators" / "sd11_route_stops.py"


def _load_sd11():
    spec = importlib.util.spec_from_file_location("sd11_route_stops", GEN)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


sd11 = _load_sd11()


def test_ac_rdemo_01_seeded_and_scaled():
    """AC-RDEMO-01: same id, same stops; the planned tour measures planned_route_km."""
    a, order_a = sd11.stops_for("D000001", 10, 71.7)
    b, order_b = sd11.stops_for("D000001", 10, 71.7)
    assert a.shape == (10, 2) and np.array_equal(a, b) and order_a == order_b
    assert sd11.tour_km(a, order_a) == pytest.approx(71.7, abs=0.01)
    other, _ = sd11.stops_for("D000002", 10, 71.7)
    assert not np.array_equal(a, other)


@pytest.mark.parametrize("n", [6, 23, 40])
def test_ac_rdemo_01_any_stop_count(n):
    """AC-RDEMO-01: 6, 23 and 40 stops (the data's range is 6-40)."""
    pts, order = sd11.stops_for("D012345", n, 88.4)
    assert sorted(order) == list(range(n))
    assert sd11.tour_km(pts, order) == pytest.approx(88.4, abs=0.01)


def test_planned_order_is_nearest_neighbour():
    """Spec §3: a dispatcher-style plan, never a random order (which would inflate the saving)."""
    pts, order = sd11.stops_for("D000777", 15, 50.0)
    assert order == sd11.nearest_neighbour(pts)


def test_refuses_a_non_positive_plan():
    with pytest.raises(ValueError):
        sd11.stops_for("D000001", 10, 0.0)


def test_two_opt_never_lengthens_and_keeps_every_stop():
    """AC-RDEMO-02 on one route: a permutation, no longer than the plan."""
    pts, planned = sd11.stops_for("D000042", 25, 60.0)
    best = demo.two_opt(pts, planned)
    assert sorted(best) == list(range(25))
    assert sd11.tour_km(pts, best) <= sd11.tour_km(pts, planned) + 1e-9


@pytest.fixture(scope="module")
def table(d):
    return demo.route_demo(d)


def test_ac_rdemo_02_every_row(table):
    """AC-RDEMO-02: every row of the supplied data."""
    for r in table.itertuples():
        for col in ("planned_order", "optimised_order"):
            assert sorted(json.loads(getattr(r, col))) == list(range(r.n_stops)), (r.delivery_id, col)
    assert (table.optimised_km <= table.planned_km).all()


def test_ac_rdemo_03_rows_examples_and_real_columns(d, table):
    """AC-RDEMO-03: one row per delivery, synthetic, three examples; the real columns are the data's."""
    assert len(table) == 48_340 and table.synthetic.all()
    assert table.example.value_counts().to_dict() == {"overrun": 1, "on_plan": 1, "no_distance": 1}
    real = d.set_index("delivery_id")
    t = table.set_index("delivery_id")
    assert (t.planned_km == real.planned_route_km.loc[t.index]).all()
    assert (t.overran == real.f_route.loc[t.index]).all()
    ex = t[t.example.notna()]
    assert bool(ex.loc[ex.example.eq("overrun").idxmax(), "overran"])
    assert pd.isna(ex.loc[ex.example.eq("no_distance").idxmax(), "actual_km"])
    assert (ex.optimised_km < ex.planned_km).all()


def test_ac_rdemo_03_off_switch(monkeypatch, d):
    """AC-RDEMO-03: ROUTE_DEMO=off leaves the table out (the scale runs)."""
    from analytics.core.context import Ctx
    from analytics.core.load import DATA_DIR
    from analytics.core.scenarios import cause_attribution
    from analytics import routes
    monkeypatch.setenv("ROUTE_DEMO", "off")
    ctx = Ctx(d=d, clients=None, data_dir=DATA_DIR, tables={"cause_attribution": cause_attribution(d)})
    assert "route_demo" not in routes.build(ctx)

"""Scale run (SPEC-data-upload AC-DATA-23, NFR-DATA-02): a seeded N× synthetic copy and a second-client variant run
through the same pipeline steps, with time and peak memory recorded per step. Small scale (2×) to stay fast."""
import json

import pandas as pd
import pytest

from analytics import bench, scaledata
from analytics.core.load import DATA_DIR

STEP_NAMES = ["load", "core", "warehouse", "carriers", "intake"]


@pytest.fixture(scope="module")
def x2(tmp_path_factory):
    out = tmp_path_factory.mktemp("x2")
    scaledata.write_replica(DATA_DIR, out, factor=2)
    return out


@pytest.fixture(scope="module")
def second(tmp_path_factory):
    out = tmp_path_factory.mktemp("second")
    scaledata.write_second_client(DATA_DIR, out)
    return out


@pytest.fixture(scope="module")
def run_x2(x2, tmp_path_factory):
    return bench.run_dataset(x2, tmp_path_factory.mktemp("x2_tracking"))


def test_ac_data_23_replica_is_seeded_labelled_and_unique(x2, tmp_path):
    """AC-DATA-23: the N× store is generated from the supplied data, seeded (same bytes twice) and labelled synthetic."""
    d = pd.read_csv(x2 / "deliveries.csv")
    src = pd.read_csv(DATA_DIR / "deliveries.csv")
    assert len(d) == 2 * len(src)
    assert d.delivery_id.is_unique
    assert list(d.columns) == list(src.columns)
    assert len(pd.read_csv(x2 / "sla_penalties.csv")) == 2 * len(pd.read_csv(DATA_DIR / "sla_penalties.csv"))
    manifest = json.loads((x2 / "manifest.json").read_text())
    assert manifest["synthetic"] is True and manifest["factor"] == 2 and manifest["seed"] == scaledata.SEED
    again = tmp_path / "again"
    scaledata.write_replica(DATA_DIR, again, factor=2)
    assert (again / "deliveries.csv").read_bytes() == (x2 / "deliveries.csv").read_bytes()


def test_ac_data_23_nfr_data_02_steps_timed_with_peak_memory(run_x2):
    """AC-DATA-23 / NFR-DATA-02: every step has a wall time and a peak-memory figure."""
    steps = run_x2["steps"]
    assert [s["step"] for s in steps] == STEP_NAMES
    assert all(s["seconds"] >= 0 and s["peak_rss_mb"] > 0 for s in steps)
    assert run_x2["input"]["deliveries_rows"] == 2 * 48340
    assert run_x2["tables"]["deliveries_clean"] == 2 * 48340


def test_ac_data_23_replica_keeps_the_golden_rates(run_x2):
    """AC-DATA-23 with AC-DIAG-01 / SPEC §2.4: a 2× replica gives the same rates and doubled counts."""
    h = run_x2["headline"]
    assert round(h["on_time_pct"], 1) == 71.0
    assert h["late"] == 2 * 14019
    assert h["penalties_usd"] == 2 * 872460
    assert h["handling_usd"] == 2 * 476646
    assert round(h["as_built_pct"], 1) == 88.5 and round(h["as_built_adopted_pct"], 1) == 85.9
    # Same tolerance as the 1x attribution test (test_scenarios): the deck rounds route's 3.15 points to 3.2.
    assert h["points_lost"] == pytest.approx(bench.GOLDEN_POINTS, abs=bench.POINTS_TOLERANCE)


def test_ac_data_23_second_client_runs_with_a_profile_only(second, tmp_path):
    """AC-DATA-23 reuse: renamed clients, carriers, warehouses and shifted dates give Halcyon's numbers once the
    client profile names that client's carriers and dates; no analysis code changes."""
    d = pd.read_csv(second / "deliveries.csv")
    assert not d.client_id.str.startswith("C").any() and not d.carrier_id.isin(list("ABCDEF")).any()
    assert pd.to_datetime(d.order_received_ts).dt.year.eq(scaledata.SECOND_YEAR).all()
    r = bench.run_dataset(second, tmp_path)
    h = r["headline"]
    assert round(h["on_time_pct"], 1) == 71.0 and h["late"] == 14019
    assert round(h["as_built_pct"], 1) == 88.5
    assert h["points_lost"] == pytest.approx(bench.GOLDEN_POINTS, abs=bench.POINTS_TOLERANCE)
    assert h["backtest_test_n"] > 0


def test_bench_write_refuses_the_app_databases(monkeypatch):
    """The timed write replaces whole tables, so it only targets a throwaway database (SPEC §4.2 one writer)."""
    monkeypatch.setenv("DATABASE_URL", "postgres://u:p@db.example:5432/prod_app")
    assert not bench.throwaway("postgres://u:p@localhost:5432/latelens")
    assert not bench.throwaway("postgres://u:p@localhost:5432/latelens_test?sslmode=disable")
    assert not bench.throwaway("postgres://u:p@db.example:5432/prod_app")
    assert bench.throwaway("postgres://u:p@localhost:5432/latelens_bench")


def test_profile_overrides_are_restored(second, tmp_path):
    """The client profile is applied for one run only; Halcyon's rules are back afterwards."""
    from analytics.core import load
    before = (set(load.BAD_LANES), load.FRIDAY_CAP_CARRIER)
    profile = json.loads((second / "client_profile.json").read_text())
    with bench.client_profile(profile):
        assert load.FRIDAY_CAP_CARRIER != "D"
    assert (set(load.BAD_LANES), load.FRIDAY_CAP_CARRIER) == before

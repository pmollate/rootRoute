import pytest

from analytics.core.scenarios import scenario_results

# SPEC §2.4 golden values for the "all" segment: (on-time %, late avoided, cost avoided USD)
GOLDEN = {
    "today": (71.0, 0, 0),
    "route_only": (73.6, 1279, 113347),
    "carrier_only": (77.4, 3091, 282161),
    "lanes_routes": (80.4, 4523, 409897),
    "address_only": (77.1, 2967, 322413),
    "address_lanes": (84.2, 6381, 639700),
    "addr_cut_stock": (87.8, 8112, 801412),
    "all_but_route": (96.3, 12239, 1184850),
    "second_pick": (73.4, 1176, 105117),
    "area_email": (75.3, 2092, 244119),
    "area_warehouse": (76.3, 2554, 232211),
    "area_carriers": (77.4, 3091, 282161),
    "as_built": (88.5, 8447, 832879),
    "as_built_adopted": (85.9, 7191, 707950),
    "as_built_api_edi": (90.6, 9485, 924292),
    "as_built_oos": (94.0, 11136, 1087383),
    "as_built_phase2": (96.3, 12239, 1184850),
    "adopt_address": (76.2, 2522, 274051),
    "adopt_lanes": (82.5, 5551, 554867),
    "adopt_cutoff": (87.3, 7876, 767984),
    "adopt_warehouse": (91.0, 9649, 934781),
    "adopt_all": (92.0, 10150, 980764),
}
SEGMENT_GOLDEN = {
    ("as_built", "email"): 93.3, ("as_built", "at_risk"): 89.7, ("address_only", "email"): 84.4,
    ("lanes_routes", "at_risk"): 78.8, ("adopt_all", "email"): 92.6, ("as_built_adopted", "at_risk"): 86.8,
}


@pytest.fixture(scope="module")
def results(d, penalties):
    return scenario_results(d, penalties).set_index(["scenario", "segment"])


@pytest.mark.parametrize("key", GOLDEN)
def test_ac_diag_04_and_ac_rep_01_golden(results, key):
    on_time, late_avoided, usd = GOLDEN[key]
    row = results.loc[(key, "all")]
    assert round(100 * row.on_time, 1) == on_time
    assert row.late_avoided == pytest.approx(late_avoided, abs=1)
    assert row.cost_avoided == pytest.approx(usd, abs=1)


@pytest.mark.parametrize("key,segment", SEGMENT_GOLDEN)
def test_ac_rep_01_segments(results, key, segment):
    assert round(100 * results.loc[(key, segment)].on_time, 1) == SEGMENT_GOLDEN[(key, segment)]


def test_ac_rep_02_as_built_cost(results):
    row = results.loc[("as_built", "all")]
    assert round(row.late_avoided) == 8447 and row.cost_avoided == pytest.approx(832879, abs=1)


def test_ac_pro_05_second_pick(d, results):
    assert int(d.f_cut_early.sum()) == 2414
    assert round(100 * results.loc[("second_pick", "all")].on_time, 1) == 73.4


def test_ac_rep_04_no_synthetic_inputs():
    import analytics.core.scenarios as mod
    assert "synthetic" not in open(mod.__file__).read().replace("supplied dataset only", "")


def test_ac_rep_05_adoption_matches_full_fix_at_100_percent(d):
    from analytics.core.ifixed import adopted, if_fixed
    from analytics.core.load import FLAGS
    fix = ["f_addr", "f_cutoff", "f_stock", "f_lane"]
    assert (adopted(d, {f: 1.0 for f in fix}, FLAGS) - if_fixed(d, fix, FLAGS)).abs().max() < 1e-12


def test_ac_rep_06_programme_waterfall(results):
    steps = ["today", "adopt_address", "adopt_lanes", "adopt_cutoff", "adopt_warehouse", "adopt_all"]
    assert [round(100 * results.loc[(k, "all")].on_time, 1) for k in steps] == [71.0, 76.2, 82.5, 87.3, 91.0, 92.0]


def test_cause_attribution_sums_to_lateness(d):
    """AC-DIAG-07: points lost per cause add up to the lateness and match 7.6 / 7.0 / 5.6 / 5.6 / 3.2."""
    from analytics.core.scenarios import cause_attribution
    a = cause_attribution(d).set_index("cause").points_lost
    assert a.sum() == pytest.approx(d.late.mean(), abs=1e-9)
    # Points lost per cause, as in the diagnostic deck (7.6, 7.0, 5.6, 5.6, 3.2)
    pdf = {"f_lane": 7.6, "f_addr": 7.0, "f_stock": 5.6, "f_cutoff": 5.6, "f_route": 3.2}
    assert {f: 100 * a[f] for f in pdf} == pytest.approx(pdf, abs=0.06)


@pytest.fixture(scope="module")
def breakdown(d, penalties):
    from analytics.core.scenarios import scenario_breakdown
    return scenario_breakdown(d, penalties)


def test_ac_rep_07_breakdown_rows(breakdown):
    """AC-REP-07: every scenario x dimension, one row per value present in the data."""
    from analytics.core.scenarios import COMPARE_SCENARIOS
    sizes = breakdown.groupby(["scenario", "dimension"]).size().unstack()
    assert set(sizes.index) == set(COMPARE_SCENARIOS)
    for scenario in COMPARE_SCENARIOS:
        assert sizes.loc[scenario].to_dict() == {
            "all": 1, "carrier": 6, "client": 280, "lane": 24, "month": 6, "region": 4, "warehouse": 5}


@pytest.mark.parametrize("dimension", ["all", "warehouse", "lane", "carrier", "region", "month", "client"])
def test_ac_rep_08_rows_add_up(breakdown, results, dimension):
    """AC-REP-08 / REQ-REP-08: the rows of each dimension add up to the scenario's `all` figures."""
    from analytics.core.scenarios import COMPARE_SCENARIOS
    for scenario in COMPARE_SCENARIOS:
        rows = breakdown[(breakdown.scenario == scenario) & (breakdown.dimension == dimension)]
        ref = results.loc[(scenario, "all")]
        assert rows.deliveries.sum() == 48_340
        assert (rows.late_today - rows.late_with).sum() == pytest.approx(ref.late_avoided, abs=0.1)
        assert rows.cost_avoided.sum() == pytest.approx(ref.cost_avoided, abs=1)


def test_ac_rep_08_golden(breakdown):
    """AC-REP-08: 71.0 -> 85.9 overall, W1 70.4 -> 85.1, D->Midwest 53.4 -> 87.5; cost avoided $707,950."""
    b = breakdown[breakdown.scenario == "as_built_adopted"].set_index(["dimension", "key"])
    for key, today, with_ in [(("all", "all"), 71.0, 85.9), (("warehouse", "W1"), 70.4, 85.1),
                              (("lane", "D→Midwest"), 53.4, 87.5)]:
        assert round(100 * b.loc[key].on_time_today, 1) == today
        assert round(100 * b.loc[key].on_time_with, 1) == with_
    assert b.loc[("all", "all")].cost_avoided == pytest.approx(707_950, abs=1)

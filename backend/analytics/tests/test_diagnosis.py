import pytest

from analytics.core import diagnosis
from analytics.core.diagnosis import add_dq


@pytest.fixture(scope="module")
def dq(d):
    return add_dq(d)


def test_ac_diag_02_flags_without_dropping(dq):
    assert len(dq) == 48340
    assert int(dq.dq_bad_dates.sum()) == 450
    assert int(dq.dq_dup_order_id.sum()) == 42
    assert dq.loc[dq.dq_dup_order_id, "order_id"].nunique() == 21


def test_ac_diag_03_report(dq, penalties):
    report = dict(diagnosis.dq_report(dq, penalties).values)
    assert report == {"delivered_before_shipped": 450, "order_id_reused_across_clients": 21,
                      "missing_actual_route_km": 1339, "late_with_clause_but_no_penalty": 2002}


def test_ac_diag_05_stages(dq):
    causes = diagnosis.delivery_causes(dq).set_index("delivery_id")
    row = causes.loc["D000002"]
    assert bool(row.late) and "Fulfilment" in row.stages.split(",")


def test_kpis(dq, clients, penalties):
    k = dict(diagnosis.kpis(dq, clients, penalties).values)
    assert k["on_time"] == pytest.approx(0.710, abs=0.0005)
    assert k["late"] == 14019 and k["penalties_usd"] == 872460 and k["handling_cost_usd"] == 476646
    assert k["at_risk_accounts"] == 9 and k["at_risk_revenue_usd"] == 14_200_000
    assert k["pre_pickup_share"] == pytest.approx(0.673, abs=0.0005)


def test_cause_summary_all_segment(dq):
    s = diagnosis.cause_summary(dq)
    s = s[s.segment.eq("all")].set_index("flag")
    assert int(s.loc["f_addr", "n"]) == 5994 and s.loc["f_addr", "late_rate"] == pytest.approx(0.646, abs=0.001)
    assert s.loc["none", "late_rate"] == 0.0


def test_cause_kpis(dq):
    import pandas as pd

    from analytics.core.load import DATA_DIR
    k = diagnosis.cause_kpis(dq, pd.read_csv(DATA_DIR / "complaints.csv")).set_index("kpi").baseline
    assert k["Orders with an incomplete address at the pick list"] == pytest.approx(0.124, abs=0.001)
    assert k["Shipments on a bad lane or on carrier D on a Friday"] == pytest.approx(0.207, abs=0.001)
    assert k["'Not told about the delay' complaints per quarter"] == 12


def test_accounts(dq, clients):
    import pandas as pd

    from analytics.core.load import DATA_DIR
    a = diagnosis.accounts(dq, clients, pd.read_csv(DATA_DIR / "complaints.csv"))
    assert len(a) == 9 and int(a.annual_revenue_usd.sum()) == 14_200_000 and int(a.complaints.sum()) == 24

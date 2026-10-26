import pandas as pd
import pytest

from analytics.carriers import lanes


@pytest.fixture(scope="module")
def scores(d):
    return lanes.lane_scores(d)


def test_ac_car_01_fair_only(d, scores):
    assert int(scores.n.sum()) == int((d.fair & ~d.f_d_friday).sum())


def test_ac_car_02_exact_blocks(scores):
    blocked = {(r.carrier_id, r.region) for r in scores[scores.blocked].itertuples()}
    assert blocked == {("D", "Midwest"), ("D", "Southeast"), ("E", "West"), ("F", "Northeast"), ("F", "Southeast")}
    per_lane = scores[scores.blocked].groupby(["carrier_id", "region"]).commitment.nunique()
    assert (per_lane == 3).all()


def test_northeast_next_day_lane(scores):
    lane = scores.query("region == 'Northeast' and commitment == 'next_day'").set_index("carrier_id")
    assert round(lane.loc["E", "on_time"], 2) == 0.97 and round(lane.loc["F", "on_time"], 2) == 0.55
    assert lane.loc["E", "mean_rate"] - lane.loc["F", "mean_rate"] == pytest.approx(1.62, abs=0.005)
    assert lane.score_default.idxmax() == "E"
    assert pd.isna(lane.loc["F", "score_default"]) and not lane.loc["D", "blocked"]

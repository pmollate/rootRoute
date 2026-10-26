from analytics.carriers import capacity


def test_capacity_positive_and_synthetic(d):
    cap = capacity.carrier_capacity(d)
    assert len(cap) == 24 and (cap.daily_limit > 0).all() and cap.synthetic.all()


def test_ac_car_08_friday_cap_holds_d_at_its_weekday_level(d):
    cap = capacity.carrier_capacity(d).set_index(["carrier_id", "region"])
    fri = d[d.order_received_ts.dt.day_of_week.eq(4) & d.carrier_id.eq("D")]
    friday_peak = fri.groupby([fri.shipped_ts.dt.date, "destination_region"]).size().groupby("destination_region").max()
    for region, peak in friday_peak.items():
        assert cap.loc[("D", region), "friday_limit"] < peak

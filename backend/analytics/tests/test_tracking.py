from analytics.carriers import tracking


def test_ac_trk_01_roundtrip(d, tmp_path):
    sample = d.sample(600, random_state=1)
    tracking.write_feeds(sample, tmp_path)
    ev = tracking.read_feeds(tmp_path)
    assert set(ev.source) == {"api", "portal", "batch"}
    counts = ev.groupby("delivery_id").event.nunique()
    assert len(counts) == 600 and (counts == 4).all()
    picked = ev[ev.event.eq("picked_up")].set_index("delivery_id").ts
    assert (picked.sort_index() == sample.set_index("delivery_id").shipped_ts.sort_index()).all()

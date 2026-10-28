from analytics.intake import risk


def test_risk_lookup(d):
    """AC-RISK-01: late rate by pre-despatch facts only."""
    rl = risk.risk_lookup(d).set_index(risk.KEY)
    assert rl.loc[(False, False, False, False), "late_rate"] < 0.1
    assert rl.loc[(True, False, False, False), "late_rate"] > 0.5
    assert rl.loc[(False, False, False, True), "late_rate"] > 0.4
    assert (rl.late_rate.between(0, 1)).all()

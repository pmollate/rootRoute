from analytics.carriers import backtest


def test_ac_car_05_backtest(d):
    bt = backtest.backtest(d).set_index("choice")
    assert set(bt.index) == {"actual", "recommended"}
    assert bt.loc["recommended", "on_time"] > bt.loc["actual", "on_time"]

"""The data window (REQ-DATA-12, REQ-DATA-14): every date-dependent result is relative to the deliveries analysed."""
import pandas as pd
import pytest

from analytics.carriers import backtest
from analytics.core import diagnosis, window


def _orders(*stamps: str) -> pd.DataFrame:
    return pd.DataFrame({"order_received_ts": pd.to_datetime(list(stamps)),
                         "fulfilment_warehouse_id": ["W1", "W2", "W1"][:len(stamps)],
                         "carrier_id": ["A", "A", "B"][:len(stamps)]})


def test_ac_data_01_recent_window_on_supplied_data_is_aug_sep(d):
    """AC-DATA-01 / REQ-DATA-14: on the full supplied window the last two calendar months start on 1 Aug 2026."""
    assert window.recent_start(d) == pd.Timestamp("2026-08-01")


def test_req_data_14_recent_window_follows_the_data():
    """REQ-DATA-14: the last two calendar months of any window, across a year end."""
    w = _orders("2026-11-03 09:00", "2027-01-15 10:00", "2027-02-02 08:00")
    assert window.recent_start(w) == pd.Timestamp("2027-01-01")
    assert window.recent_start(w, months=3) == pd.Timestamp("2026-12-01")


def test_ac_data_21_window_info_from_the_data(d):
    """AC-DATA-21: the data line (window, deliveries, sites, carriers) is computed from the deliveries."""
    info = window.window_info(d)
    assert info == {"window_from": pd.Timestamp("2026-04-01"), "window_to": pd.Timestamp("2026-09-25"),
                    "recent_from": pd.Timestamp("2026-08-01"), "deliveries": 48340, "warehouses": 5, "carriers": 6}
    small = window.window_info(_orders("2026-11-03 09:00", "2027-01-15 10:00", "2027-02-02 08:00"))
    assert (small["deliveries"], small["warehouses"], small["carriers"]) == (3, 2, 2)
    assert small["window_to"] == pd.Timestamp("2027-02-02")


def test_ac_data_01_aug_sep_segment_unchanged(d):
    """AC-DATA-01: the recent segment (key `aug_sep`) selects exactly the Aug-Sep orders of the supplied data."""
    seg = diagnosis.segments(d)["aug_sep"]
    assert seg.equals(d.order_received_ts.dt.month.ge(8))


def test_ac_data_01_backtest_unchanged_on_supplied_data(d):
    """AC-DATA-01 / AC-CAR-05: train Apr-Jul, test Aug-Sep gives today's numbers (SPEC §5.2: 71.3% -> 78.2%)."""
    bt = backtest.backtest(d).set_index("choice")
    assert int(bt.loc["actual", "n"]) == 15041
    assert bt.loc["actual", "on_time"] == pytest.approx(0.7131174788910312, abs=1e-12)
    assert bt.loc["recommended", "on_time"] == pytest.approx(0.7819619799312206, abs=1e-12)
    assert bt.loc["actual", "mean_rate"] == pytest.approx(15.233537663719169, abs=1e-9)
    assert bt.loc["recommended", "mean_rate"] == pytest.approx(13.03157914016047, abs=1e-9)


def test_req_data_14_backtest_split_moves_with_the_window(d):
    """REQ-DATA-14: shift every date by a year and the backtest tests the same orders."""
    shifted = d.copy()
    shifted["order_received_ts"] = shifted.order_received_ts + pd.DateOffset(years=1)
    bt = backtest.backtest(shifted).set_index("choice")
    assert int(bt.loc["actual", "n"]) == 15041

"""The data window: which deliveries were analysed (REQ-DATA-12) and the recent period inside it (REQ-DATA-14).

Nothing here names a date. The recent period is the last `RECENT_MONTHS` calendar months of the window, by
`order_received_ts`: the backtest tests on it (rules learned on the months before) and the replay's `aug_sep`
segment is it. On the supplied data (orders 1 Apr to 25 Sep 2026) that is 1 Aug to 25 Sep, as before.
"""
import pandas as pd

RECENT_MONTHS = 2  # REQ-DATA-14: "the last two calendar months of the window"


def recent_start(d: pd.DataFrame, months: int = RECENT_MONTHS) -> pd.Timestamp:
    """First day of the calendar month `months - 1` months before the month of the last order."""
    last = d.order_received_ts.max()
    return (last.to_period("M") - (months - 1)).to_timestamp()


def window_info(d: pd.DataFrame) -> dict:
    """The data line: first and last order day, recent period start, and what the deliveries cover."""
    return {
        "window_from": d.order_received_ts.min().normalize(),
        "window_to": d.order_received_ts.max().normalize(),
        "recent_from": recent_start(d),
        "deliveries": len(d),
        "warehouses": d.fulfilment_warehouse_id.nunique(),
        "carriers": d.carrier_id.nunique(),
    }

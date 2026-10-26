"""SD-06 synthetic carrier capacity contracts (SPEC §12.1), from observed daily volume on days other than Friday.

friday_limit caps every carrier at its normal daily level, so Friday overflow goes to the next carrier (SPEC §5.2).
"""
import numpy as np
import pandas as pd

HEADROOM = 1.10


def carrier_capacity(d: pd.DataFrame) -> pd.DataFrame:
    weekdays = d[d.order_received_ts.dt.day_of_week.ne(4)]
    daily = weekdays.groupby([weekdays.shipped_ts.dt.date, "carrier_id", "destination_region"]).size().rename("n").reset_index()
    p95 = daily.groupby(["carrier_id", "destination_region"]).n.quantile(0.95).reset_index()
    p95["daily_limit"] = np.ceil(p95.n * HEADROOM).astype(int)
    p95["friday_limit"] = p95.daily_limit
    p95["synthetic"] = True
    return p95.rename(columns={"destination_region": "region"})[["carrier_id", "region", "daily_limit", "friday_limit", "synthetic"]]

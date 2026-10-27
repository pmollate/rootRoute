"""C7 backtest: lane rules trained on Apr-Jul, tested on Aug-Sep (SPEC §5.2).

Friday orders never go to carrier D in the recommended plan (the Friday cap moves D's overflow to the next carrier).
"""
import pandas as pd

from analytics.carriers.lanes import lane_scores

SPLIT = pd.Timestamp("2026-08-01")
KEY = ["destination_region", "commitment_type", "carrier_id", "f_addr", "f_stock", "f_cutoff"]
LANE = ["destination_region", "commitment_type"]


def _best(lanes: pd.DataFrame) -> pd.DataFrame:
    ok = lanes[~lanes.blocked].sort_values("score_default", ascending=False).drop_duplicates(["region", "commitment"])
    return ok.rename(columns={"region": "destination_region", "commitment": "commitment_type", "carrier_id": "rec"})[
        [*LANE, "rec", "mean_rate"]]


def backtest(d: pd.DataFrame) -> pd.DataFrame:
    train, test = d[d.order_received_ts < SPLIT], d[d.order_received_ts >= SPLIT]
    lanes = lane_scores(train)
    any_day = _best(lanes)
    friday = _best(lanes[lanes.carrier_id.ne("D")])
    is_fri = test.order_received_ts.dt.day_of_week.eq(4)
    t = pd.concat([test[~is_fri].merge(any_day, on=LANE, how="left"), test[is_fri].merge(friday, on=LANE, how="left")],
                  ignore_index=True)
    # Estimate each order's late chance on the recommended carrier from train orders of the same lane, carrier and
    # pre-pickup causes; Friday D overload is not in that estimate because the plan never puts D on a Friday.
    lookup = train[~train.f_d_friday].groupby(KEY).late.mean()
    lane_mean = train[~train.f_d_friday].groupby([*LANE, "carrier_id"]).late.mean()
    rec = t[KEY].assign(carrier_id=t.rec)
    est = pd.Series(lookup.reindex(pd.MultiIndex.from_frame(rec[KEY])).to_numpy(), index=t.index)
    fallback = lane_mean.reindex(pd.MultiIndex.from_frame(rec[[*LANE, "carrier_id"]])).to_numpy()
    est = est.fillna(pd.Series(fallback, index=t.index))
    return pd.DataFrame([
        {"choice": "actual", "n": len(t), "on_time": 1 - t.late.mean(), "mean_rate": t.carrier_rate_usd.mean()},
        {"choice": "recommended", "n": len(t), "on_time": 1 - est.mean(), "mean_rate": t.mean_rate.mean()},
    ])

"""Warehouse & promise tables (owner B): W4, W6, W7 and lookups used by Node."""
import pandas as pd

from analytics.core.diagnosis import unpaid_penalties


def region_distance(distance_wide: pd.DataFrame) -> pd.DataFrame:
    return distance_wide.melt(id_vars="warehouse_id", var_name="region", value_name="miles")


def client_region_nearest(d: pd.DataFrame) -> pd.DataFrame:
    counts = d.groupby(["client_id", "destination_region", "nearest_warehouse_id"]).size().rename("n").reset_index()
    top = counts.sort_values(["client_id", "destination_region", "n", "nearest_warehouse_id"],
                             ascending=[True, True, False, True])
    top = top.drop_duplicates(["client_id", "destination_region"])
    return top.rename(columns={"destination_region": "region", "nearest_warehouse_id": "warehouse_id"})[
        ["client_id", "region", "warehouse_id"]].reset_index(drop=True)


def warehouse_stats(d: pd.DataFrame, warehouses: pd.DataFrame) -> pd.DataFrame:
    def rate(s: pd.DataFrame) -> float:
        return float(s.late.mean()) if len(s) else 0.0

    rows = []
    for wid, s in d.groupby("nearest_warehouse_id"):
        home = s.fulfilment_warehouse_id == s.nearest_warehouse_id
        rows.append({
            "warehouse_id": wid,
            "orders": len(s),
            "cutoff_misses": int(s.f_cutoff.sum()),
            "cutoff_late_rate": rate(s[s.f_cutoff]),
            "cutoff_before_11": int(s.f_cut_early.sum()),
            "out_of_stock": int(s.f_stock_out.sum()),
            "out_of_stock_late_rate": rate(s[s.f_stock_out]),
            "skipped_nearest": int(s.f_skip_nearest.sum()),
            "skipped_nearest_late_rate": rate(s[s.f_skip_nearest]),
            # Freight sums, so Node can average across sites: shipped from the nearest site vs any other.
            "nearest_shipped": int(home.sum()),
            "nearest_freight_usd": float(s.carrier_rate_usd[home].sum()),
            "other_shipped": int((~home).sum()),
            "other_freight_usd": float(s.carrier_rate_usd[~home].sum()),
        })
    out = pd.DataFrame(rows).merge(warehouses[["warehouse_id", "warehouse_name"]], on="warehouse_id")
    return out[["warehouse_id", "warehouse_name", *[c for c in out.columns if c not in ("warehouse_id", "warehouse_name")]]]


def penalty_reconciliation(d: pd.DataFrame, penalties: pd.DataFrame) -> pd.DataFrame:
    rows = unpaid_penalties(d, penalties)
    out = rows[["delivery_id", "client_id", "account_tier", "fulfilment_warehouse_id", "days_late", "promised_date"]].copy()
    out = out.rename(columns={"fulfilment_warehouse_id": "warehouse_id"})
    out["promised_date"] = out.promised_date.dt.strftime("%Y-%m-%d")
    return out.sort_values(["days_late", "account_tier"], ascending=[False, True]).reset_index(drop=True)

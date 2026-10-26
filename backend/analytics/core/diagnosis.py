"""Data quality, stages and summary tables (SPEC §5.1, D1-D3, D6)."""
import pandas as pd

from analytics.core.load import FLAGS

LABELS = {
    "f_addr": "Incomplete address at intake",
    "f_cutoff": "Same-day order after 8am cut-off",
    "f_stock": "Shipped from a non-nearest warehouse",
    "f_stock_out": "Nearest warehouse out of stock",
    "f_skip_nearest": "Nearest warehouse skipped despite stock",
    "f_lane": "Bad carrier lane or D on a Friday",
    "f_bad_lane": "Bad carrier lane",
    "f_d_friday": "Carrier D on a Friday",
    "f_route": "Route >20% over plan",
    "none": "None of the five",
}
STAGE = {"f_addr": "Intake", "f_cutoff": "Promise", "f_stock": "Fulfilment", "f_stock_out": "Fulfilment",
         "f_skip_nearest": "Fulfilment", "f_lane": "Carrier", "f_bad_lane": "Carrier", "f_d_friday": "Carrier",
         "f_route": "Delivery", "none": "-"}
STAGE_FLAGS = [("Intake", ["f_addr"]), ("Promise", ["f_cutoff"]), ("Fulfilment", ["f_stock"]),
               ("Carrier", ["f_lane"]), ("Delivery", ["f_route"])]
SUMMARY_FLAGS = ["f_addr", "f_cutoff", "f_stock", "f_stock_out", "f_skip_nearest", "f_lane", "f_bad_lane",
                 "f_d_friday", "f_route"]
HANDLING_COST = 34
PENALTY = 180


def segments(d: pd.DataFrame) -> dict[str, pd.Series]:
    return {
        "all": pd.Series(True, index=d.index),
        "email": d.order_channel.eq("Email"),
        "at_risk": d.account_status.eq("threatening_to_leave"),
        "aug_sep": d.order_received_ts.dt.month.ge(8),
    }


def add_dq(d: pd.DataFrame) -> pd.DataFrame:
    d = d.copy()
    d["dq_bad_dates"] = d.delivered_date < d.shipped_ts.dt.normalize()
    clients_per_order = d.groupby("order_id").client_id.nunique()
    d["dq_dup_order_id"] = d.order_id.isin(clients_per_order[clients_per_order > 1].index)
    return d


def stages(d: pd.DataFrame) -> pd.Series:
    cols = [d[flags].any(axis=1).map({True: stage, False: ""}) for stage, flags in STAGE_FLAGS]
    return pd.concat(cols, axis=1).apply(lambda row: ",".join(s for s in row if s), axis=1)


def unpaid_penalties(d: pd.DataFrame, penalties: pd.DataFrame) -> pd.DataFrame:
    eligible = d.late & d.sla_penalty_clause.eq("Y")
    return d[eligible & ~d.delivery_id.isin(penalties.delivery_id)]


def dq_report(d: pd.DataFrame, penalties: pd.DataFrame) -> pd.DataFrame:
    rows = [
        ("delivered_before_shipped", int(d.dq_bad_dates.sum())),
        ("order_id_reused_across_clients", int(d.loc[d.dq_dup_order_id, "order_id"].nunique())),
        ("missing_actual_route_km", int(d.actual_route_km.isna().sum())),
        ("late_with_clause_but_no_penalty", len(unpaid_penalties(d, penalties))),
    ]
    return pd.DataFrame(rows, columns=["issue", "count"])


def kpis(d: pd.DataFrame, clients: pd.DataFrame, penalties: pd.DataFrame) -> pd.DataFrame:
    at_risk = clients[clients.account_status.eq("threatening_to_leave")]
    late = d[d.late]
    rows = {
        "on_time": 1 - d.late.mean(),
        "benchmark": 0.94,
        "deliveries": len(d),
        "late": len(late),
        "penalties_usd": penalties.penalty_usd.sum(),
        "handling_cost_usd": d.redelivery_cost_usd.sum(),
        "at_risk_accounts": len(at_risk),
        "at_risk_revenue_usd": at_risk.annual_revenue_usd.sum(),
        "pre_pickup_share": (late.f_addr | late.f_stock | late.f_cutoff).mean(),
    }
    return pd.DataFrame({"key": list(rows), "value": [float(v) for v in rows.values()]})


def cause_summary(d: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for seg, mask in segments(d).items():
        if seg == "aug_sep":
            continue
        s = d[mask]
        for flag in SUMMARY_FLAGS:
            hit = s[s[flag]]
            rows.append((seg, flag, LABELS[flag], STAGE[flag], len(hit), hit.late.mean() if len(hit) else 0.0))
        none = s[~s[FLAGS].any(axis=1)]
        rows.append((seg, "none", LABELS["none"], STAGE["none"], len(none), none.late.mean() if len(none) else 0.0))
    return pd.DataFrame(rows, columns=["segment", "flag", "label", "stage", "n", "late_rate"])


def accounts(d: pd.DataFrame, clients: pd.DataFrame, complaints: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for _, c in clients[clients.account_status.eq("threatening_to_leave")].iterrows():
        s = d[d.client_id.eq(c.client_id)]
        late = s[s.late]
        counts = {f: int(late[f].sum()) for f in FLAGS}
        main = max(counts, key=counts.get) if len(late) else "none"
        rows.append({
            "client_id": c.client_id, "client_name": c.client_name, "account_tier": c.account_tier,
            "annual_revenue_usd": int(c.annual_revenue_usd), "primary_order_channel": c.primary_order_channel,
            "deliveries": len(s), "on_time": 1 - s.late.mean(), "main_cause": LABELS[main],
            "complaints": int(complaints.client_id.eq(c.client_id).sum()),
        })
    return pd.DataFrame(rows).sort_values("annual_revenue_usd", ascending=False).reset_index(drop=True)


def delivery_causes(d: pd.DataFrame) -> pd.DataFrame:
    cols = ["delivery_id", "client_id", "order_channel", "commitment_type", "destination_region", "carrier_id",
            "late", "f_addr", "f_cutoff", "f_stock", "f_stock_out", "f_skip_nearest", "f_lane", "f_bad_lane",
            "f_d_friday", "f_route", "fair"]
    out = d[cols].copy()
    out["stages"] = stages(d)
    return out


def cause_kpis(d: pd.DataFrame, complaints: pd.DataFrame) -> pd.DataFrame:
    """One measurable KPI per cause, with today's baseline from the data and the target (SPEC §1.4)."""
    route_known = d.actual_route_km.notna()
    rows = [
        ("f_addr", "Incomplete address", "Orders with an incomplete address at the pick list",
         d.f_addr.mean(), "<2%", "Customer success"),
        ("f_lane", "Carrier lane / Friday overload", "Shipments on a bad lane or on carrier D on a Friday",
         d.f_lane.mean(), "0%", "Transport planning"),
        ("f_stock", "Wrong warehouse", "Orders where the nearest warehouse is out of stock",
         d.f_stock_out.mean(), "<8%", "Inventory planning"),
        ("f_stock", "Wrong warehouse", "Orders shipped from a far warehouse although the nearest had stock",
         float(d.f_skip_nearest.sum()), "0", "Warehouse supervisors"),
        ("f_cutoff", "Cutoff promise", "Late rate of same-day orders received after 08:00",
         d[d.f_cutoff].late.mean(), "<26% (the before-cutoff rate)", "Sales ops / warehouse"),
        ("f_route", "Route detour", "Routes more than 20% over plan",
         d.loc[route_known, "f_route"].mean(), "<3%", "Carrier management"),
        ("none", "Not told about delay", "'Not told about the delay' complaints per quarter",
         float(complaints.category.eq("Not told about the delay").sum()), "0", "Account owners"),
    ]
    return pd.DataFrame(rows, columns=["cause", "label", "kpi", "baseline", "target", "owner"])

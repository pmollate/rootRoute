"""Replay scenarios (SPEC §2.4, §5.8). Uses the supplied dataset only (REQ-REP-04)."""
from dataclasses import dataclass, field

import pandas as pd

from analytics.core.diagnosis import segments
from analytics.core.ifixed import adopted, cost_avoided, if_fixed, paid_ratio, shapley
from analytics.core.load import AREA_FLAGS, FLAGS, PICK_FLAGS, RULES

# Share of each cause a fix removes in practice (SPEC §2.4, §12 assumptions; set in analytics/rules.json).
# Full-fix scenarios use 1.0.
ADOPTION = RULES["adoption"]
AS_BUILT = ["f_addr_email", "f_cutoff", "f_skip_nearest", "f_lane"]
AS_BUILT_ADOPTION = RULES["as_built_adoption"]


@dataclass(frozen=True)
class Scenario:
    key: str
    label: str
    grp: str
    flags: list[str]
    fix: list[str] = field(default_factory=list)
    rates: dict[str, float] = field(default_factory=dict)   # set -> adoption-adjusted


def _waterfall() -> list[Scenario]:
    steps = [("adopt_address", "+ address check ({})", "f_addr"),
             ("adopt_lanes", "+ lane rules and Friday cap ({})", "f_lane"),
             ("adopt_cutoff", "+ cutoff-aware promise ({})", "f_cutoff"),
             ("adopt_warehouse", "+ warehouse fallback ({})", "f_stock"),
             ("adopt_all", "+ last-mile watch ({}): full programme", "f_route")]
    out, rates = [], {}
    for key, label, flag in steps:
        rates = {**rates, flag: ADOPTION[flag]}
        out.append(Scenario(key, label.format(f"{ADOPTION[flag]:.0%}"), "adoption", FLAGS, rates=dict(rates)))
    return out


SCENARIOS = [
    Scenario("today", "Today", "reference", FLAGS),
    Scenario("route_only", "Route overruns only", "reference", FLAGS, ["f_route"]),
    Scenario("carrier_only", "Carrier lanes only", "reference", FLAGS, ["f_lane"]),
    Scenario("lanes_routes", "Carrier lanes + routes", "reference", FLAGS, ["f_lane", "f_route"]),
    Scenario("address_only", "Address only", "reference", FLAGS, ["f_addr"]),
    Scenario("address_lanes", "Address + lanes", "reference", FLAGS, ["f_addr", "f_lane"]),
    Scenario("addr_cut_stock", "Address + cut-off + stock", "reference", FLAGS, ["f_addr", "f_cutoff", "f_stock"]),
    Scenario("all_but_route", "Address + cut-off + stock + lanes", "reference", FLAGS, ["f_addr", "f_cutoff", "f_stock", "f_lane"]),
    Scenario("second_pick", "Second pick run at 11:00", "area", PICK_FLAGS, ["f_cut_early"]),
    Scenario("area_email", "Email area: email addresses", "area", AREA_FLAGS, ["f_addr_email"]),
    Scenario("area_warehouse", "Warehouse area: cut-off + skipped nearest", "area", AREA_FLAGS, ["f_cutoff", "f_skip_nearest"]),
    Scenario("area_carriers", "Carriers area: 5 bad lanes + Friday cap on D", "area", FLAGS, ["f_lane"]),
    Scenario("as_built", "LateLens as built (full fix)", "as_built", AREA_FLAGS, AS_BUILT),
    Scenario("as_built_adopted", "LateLens as built (expected adoption)", "as_built", AREA_FLAGS, rates=AS_BUILT_ADOPTION),
    Scenario("as_built_api_edi", "As built + API/EDI address checks", "phase2", AREA_FLAGS, [*AS_BUILT, "f_addr_other"]),
    Scenario("as_built_oos", "As built + out-of-stock fixed", "phase2", AREA_FLAGS, [*AS_BUILT, "f_stock_out"]),
    Scenario("as_built_phase2", "As built + both", "phase2", AREA_FLAGS, [*AS_BUILT, "f_addr_other", "f_stock_out"]),
    *_waterfall(),
]


def estimate(d: pd.DataFrame, s: Scenario) -> pd.Series:
    return adopted(d, s.rates, s.flags) if s.rates else if_fixed(d, s.fix, s.flags)


def scenario_results(d: pd.DataFrame, penalties: pd.DataFrame) -> pd.DataFrame:
    ratio = paid_ratio(d, penalties)
    segs = segments(d)
    rows = []
    for s in SCENARIOS:
        est = estimate(d, s)
        for seg, mask in segs.items():
            late_avoided, usd = cost_avoided(d[mask], est[mask], ratio)
            rows.append({"scenario": s.key, "label": s.label, "grp": s.grp, "segment": seg,
                         "on_time": 1 - float(est[mask].mean()), "late_avoided": late_avoided, "cost_avoided": usd})
    return pd.DataFrame(rows)


# Today vs with LateLens (SPEC §5.8, D11): the replay's per-delivery estimates summed the way each screen groups its data.
COMPARE_SCENARIOS = ["as_built_adopted", "as_built", "adopt_all"]


def _dimension_keys(d: pd.DataFrame) -> dict[str, pd.Series]:
    return {
        "all": pd.Series("all", index=d.index),
        "warehouse": d.fulfilment_warehouse_id,
        "lane": d.carrier_id + "→" + d.destination_region,
        "carrier": d.carrier_id,
        "region": d.destination_region,
        "month": d.order_received_ts.dt.strftime("%Y-%m"),
        "client": d.client_id,
    }


def scenario_breakdown(d: pd.DataFrame, penalties: pd.DataFrame) -> pd.DataFrame:
    """Today and with each compare scenario, by dimension (REQ-REP-07, -08). Supplied data only (REQ-REP-04)."""
    ratio = paid_ratio(d, penalties)
    by_key = {s.key: s for s in SCENARIOS}
    keys = _dimension_keys(d)
    rows = []
    for name in COMPARE_SCENARIOS:
        s = by_key[name]
        est = estimate(d, s)
        for dim, key in keys.items():
            for k, idx in d.groupby(key).groups.items():
                _, usd = cost_avoided(d.loc[idx], est[idx], ratio)
                late = d.late[idx]
                rows.append({"scenario": name, "label": s.label, "dimension": dim, "key": str(k),
                             "deliveries": len(idx), "on_time_today": 1 - float(late.mean()),
                             "on_time_with": 1 - float(est[idx].mean()), "late_today": int(late.sum()),
                             "late_with": float(est[idx].sum()), "cost_avoided": usd})
    return pd.DataFrame(rows)


CAUSE_LABEL = {"f_addr": "Incomplete address", "f_stock": "Wrong warehouse (stock-out)", "f_cutoff": "Same-day promise after cutoff",
               "f_lane": "Carrier lane / Friday overload", "f_route": "Last-mile route detour"}
CAUSE_STAGE = {"f_addr": "Intake", "f_stock": "Fulfilment", "f_cutoff": "Promise", "f_lane": "Carrier", "f_route": "Delivery"}


def cause_attribution(d: pd.DataFrame) -> pd.DataFrame:
    pts = shapley(d, FLAGS)
    rows = [{"cause": f, "label": CAUSE_LABEL[f], "stage": CAUSE_STAGE[f], "deliveries": int(d[f].sum()),
             "points_lost": v, "share_of_lateness": v / sum(pts.values())} for f, v in pts.items()]
    return pd.DataFrame(rows).sort_values("points_lost", ascending=False).reset_index(drop=True)

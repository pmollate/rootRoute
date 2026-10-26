"""
Halcyon | Phase 1 | ML Carrier Recommender  (predict -> optimize -> evaluate)
==============================================================================

WHAT THIS FILE DOES
  1. RISK MODEL  : LightGBM predicts P(late) for any (order, candidate carrier, carrier load).
  2. COST MODEL  : expected cost = carrier rate + P(late) x this order's late cost (+ surge).
  3. OPTIMIZER   : once per day (08:00 pick-list cutoff) assigns ALL orders to carriers with a
                   linear program (network LP -> whole-number optimum), using piecewise load tiers
                   so the model's load sensitivity (e.g. carrier D overloaded on Fridays) is priced in.
  4. GUARDRAILS  : "ML ranks, rules veto". A (carrier, lane, load tier) is blocked if the rules table says
                   its clean late rate > 30%, or if the model's carrier-only (intrinsic) risk is > 15 pts
                   worse than the best carrier on that lane today.
  5. EVALUATION  : time split (train Apr-Jul, test Aug-Sep), AUC / Brier / calibration, and a replay
                   comparing Today vs rules optimizer vs ML optimizer, scored by two independent judges
                   (empirical = data-faithful, compound = conservative real-world).

FACTOR GROUPS IMPLEMENTED (see FEATURES below)
  G1 Carrier performance on the lane : carrier, lane, weekday, trailing 7/30-day clean late rate,
                                       trailing severity (avg days late), trailing lane volume
  G2 Capacity / load                 : carrier's daily load, load vs its normal capacity
  G3 The order                       : origin warehouse, distance, commitment, lead days, order hour,
                                       missed cutoff, address status, channel, wrong warehouse, stock
  G4 Customer value                  : tier, penalty clause, annual revenue (+ optional churn cost)
  G6 Full cost                       : distance-based rate per carrier, redelivery, SLA penalty, surge

FACTOR GROUPS NOT YET IMPLEMENTED -> search this file for "TODO(" to find the exact hook points.
  G5 External conditions   TODO(G5-weather), TODO(G5-traffic), TODO(G5-calendar)
  G7 Carrier quality       TODO(G7-claims), TODO(G7-feed)
  G8 Portfolio / contracts TODO(G8-contracts), TODO(G8-diversity)
  Learning loop            TODO(LOOP-explore), TODO(LOOP-retrain)
  Guardrails / ops         TODO(GUARD-override), TODO(GUARD-drift), TODO(TENDER)

RULE FOR ANY NEW FEATURE: it must be known at decision time (08:00 on ship day).
  Never use post-dispatch fields (actual_route_km, delivered_date, days_late, stops_on_route of the
  executed route) as inputs: they leak the answer. Never train on "which carrier was chosen".

RUN
  pip install lightgbm pandas numpy scipy scikit-learn --break-system-packages
  python carrier_recommender_ml.py --data ./Halcyon-Hackathon-Dataset --out ./outputs
"""

from __future__ import annotations
import argparse, json, os, warnings
import numpy as np
import pandas as pd
import lightgbm as lgb
from scipy.optimize import linprog
from scipy.sparse import coo_matrix
from sklearn.metrics import roc_auc_score, brier_score_loss, log_loss

warnings.filterwarnings("ignore", category=UserWarning)
warnings.filterwarnings("ignore", message=".*eval_set.*")

# ----------------------------------------------------------------------------------------------
# CONFIG  (every business assumption lives here; change values, not code)
# ----------------------------------------------------------------------------------------------
CFG = dict(
    train_end="2026-08-01",        # train < this date, test >= this date (time split, no leakage)
    valid_start="2026-07-01",      # last month of train used for early stopping
    cutoff_hour=8,                 # pick-list cutoff (warehouses.csv: 08:00)
    trailing_windows=(7, 30),      # G1 trailing lane stats, in days, using outcomes known before the day
    surge_cost=5.0,                # G6 $ per order above a carrier's busy-day capacity (ASSUMPTION)
    switch_cost=5.0,               # $ friction for moving an order off its current carrier (dial)
    block_delta=0.15,              # guardrail: block a carrier whose lane-level intrinsic risk is >15 pts
                                   #   above the best carrier for that lane today (ML veto)
    rule_block_rate=0.30,          # guardrail: rules veto, clean late rate on (carrier, lane, overloaded)
    churn_cost={"Tier 1": 0.0, "Tier 2": 0.0, "Tier 3": 0.0},  # G4 optional $ per late order by tier
    min_lane_n=50,                 # lookup baseline: minimum clean shipments to trust a lane
    big=10_000.0,                  # cost for blocked arcs (keeps LP feasible)
    seed=42,
)

CARRIERS = list("ABCDEF")

CAT_FEATURES = ["carrier_id", "destination_region", "fulfilment_warehouse_id", "commitment_type",
                "address_status", "order_channel", "account_tier", "sla_penalty_clause"]
NUM_FEATURES = [
    # G1 lane performance
    # NOTE: weekday / is_friday are deliberately NOT model inputs. In this data D's Friday failures
    # coincide with D's Friday overload, so weekday and load are collinear. Keeping only load forces the
    # model to learn the actionable cause (load), which the optimizer can change. Re-add weekday once
    # other weekday effects exist (e.g. weekend linehaul) and data has loads spread across weekdays.
    "lane_late_7d", "lane_late_30d", "lane_sev_30d", "lane_n_30d",
    # G2 capacity / load
    "carrier_load", "load_ratio",
    # G3 order
    "distance_miles", "lead_days", "order_hour", "cutoff_miss", "wrong_wh", "nearest_had_stock",
    # G4 customer
    "log_revenue",
    # TODO(G5-weather): add "route_weather_severity" (0-3) from Azure Maps Weather Along Route
    #   (forecast for ship day along origin->destination waypoints). Must be the FORECAST available
    #   at 08:00, not observed weather. Add to train data by joining historical forecasts per day/lane.
    # TODO(G5-traffic): add "route_congestion_idx" from Azure Maps Traffic / route matrix
    #   (expected travel time vs free-flow), plus "road_closure_flag" on the lane.
    # TODO(G5-calendar): add "is_holiday", "days_to_holiday", "peak_season" flags.
    # TODO(G7-feed): add carrier "feed_type" (API / batch / portal from carriers.csv) and
    #   "feed_latency_hrs"; slow feeds hide problems longer.
    # TODO(TENDER): add "tender_accept_rate_30d" and "tender_lead_days" once tender data exists.
]
FEATURES = CAT_FEATURES + NUM_FEATURES


# ----------------------------------------------------------------------------------------------
# 1. DATA: load + clean
# ----------------------------------------------------------------------------------------------
def load_data(data_dir: str) -> tuple[pd.DataFrame, dict]:
    d = pd.read_csv(os.path.join(data_dir, "deliveries.csv"))
    clients = pd.read_csv(os.path.join(data_dir, "clients.csv"))
    pens = pd.read_csv(os.path.join(data_dir, "sla_penalties.csv"))

    for col in ["order_received_ts", "shipped_ts"]:
        d[col] = pd.to_datetime(d[col])
    for col in ["promised_date", "delivered_date"]:
        d[col] = pd.to_datetime(d[col])

    n0 = len(d)
    d = d[d.delivered_date >= d.shipped_ts.dt.normalize()]          # drop impossible dates
    d = d.sort_values("delivery_id").drop_duplicates("order_id")     # drop duplicate orders
    info = dict(rows_raw=n0, rows_clean=len(d))

    d = d.merge(clients[["client_id", "account_tier", "sla_penalty_clause", "annual_revenue_usd"]],
                on="client_id", how="left")
    d["late"] = (d.on_time == "N").astype(int)
    d["day"] = d.shipped_ts.dt.normalize()
    d["weekday"] = d.day.dt.dayofweek
    d["is_friday"] = (d.weekday == 4).astype(int)
    d["order_hour"] = d.order_received_ts.dt.hour
    d["lead_days"] = (d.promised_date - d.day).dt.days
    d["cutoff_miss"] = ((d.commitment_type == "same_day") & (d.order_hour >= CFG["cutoff_hour"])).astype(int)
    d["wrong_wh"] = (d.fulfilment_warehouse_id != d.nearest_warehouse_id).astype(int)
    d["nearest_had_stock"] = (d.nearest_warehouse_had_stock == "Y").astype(int)
    d["log_revenue"] = np.log1p(d.annual_revenue_usd)
    # "clean" = no non-carrier cause present -> isolates the carrier's own effect (used for G1 stats)
    detour = d.actual_route_km > d.planned_route_km * 1.2            # post-dispatch: used ONLY to
    d["clean"] = ((d.address_status == "complete") & (d.wrong_wh == 0) &   # label clean history,
                  (d.cutoff_miss == 0) & ~detour).astype(int)               # never as a model input
    d["detour"] = detour.astype(int)

    # G6 cost facts learned from data
    info["redelivery_per_late"] = float(d.loc[d.late == 1, "redelivery_cost_usd"].mean())
    info["penalty_per_breach"] = float(pens.penalty_usd.mode().iloc[0])
    return d.reset_index(drop=True), info


# ----------------------------------------------------------------------------------------------
# 2. FEATURES
# ----------------------------------------------------------------------------------------------
class LaneHistory:
    """G1: trailing clean-late stats per (carrier, region, day), using only shipments DELIVERED
    before that day (i.e. outcomes actually known at 08:00). Works for any candidate carrier."""

    def __init__(self, d: pd.DataFrame):
        c = d[d.clean == 1]
        g = c.groupby(["carrier_id", "destination_region", "delivered_date"]).agg(
            n=("late", "size"), lates=("late", "sum"), sev=("days_late", "sum"))
        days = pd.date_range(d.day.min() - pd.Timedelta(days=1), d.delivered_date.max() + pd.Timedelta(days=1))
        idx = pd.MultiIndex.from_product([CARRIERS, sorted(d.destination_region.unique()), days],
                                         names=["carrier_id", "destination_region", "date"])
        g.index = g.index.set_names(["carrier_id", "destination_region", "date"])
        g = g.reindex(idx, fill_value=0)
        out = {}
        for w in CFG["trailing_windows"]:
            roll = (g.groupby(level=[0, 1]).rolling(w, min_periods=1).sum()
                    .droplevel([0, 1]).groupby(level=[0, 1]).shift(1))       # shift: exclude same day
            out[f"lane_late_{w}d"] = roll.lates / roll.n.replace(0, np.nan)
            if w == max(CFG["trailing_windows"]):
                out[f"lane_sev_{w}d"] = roll.sev / roll.lates.replace(0, np.nan)
                out[f"lane_n_{w}d"] = roll.n
        self.table = pd.DataFrame(out)

    def lookup(self, carriers, regions, days) -> pd.DataFrame:
        key = pd.MultiIndex.from_arrays([carriers, regions, days],
                                        names=["carrier_id", "destination_region", "date"])
        return self.table.reindex(key).reset_index(drop=True)


class Capacity:
    """G2: per-carrier load tiers learned from train.
       tier 1 = normal weekday capacity (Mon-Thu p95)    -> risk evaluated at that load
       tier 2 = busy-day capacity (all-days p95)          -> risk evaluated at that load
       tier 3 = surge above busy-day capacity (+surge $)  -> risk evaluated at 1.2 x observed max"""

    def __init__(self, train: pd.DataFrame):
        daily = train.groupby(["carrier_id", "day"]).size().rename("n").reset_index()
        daily["wd"] = daily.day.dt.dayofweek
        self.t1 = daily[daily.wd < 4].groupby("carrier_id").n.quantile(0.95).to_dict()
        self.t2 = daily.groupby("carrier_id").n.quantile(0.95).to_dict()
        self.mx = daily.groupby("carrier_id").n.max().to_dict()
        for c in CARRIERS:                                  # integer capacities keep the LP integral
            self.t1[c] = int(np.floor(self.t1[c]))
            self.t2[c] = int(max(np.floor(self.t2[c]), self.t1[c]))

    def tiers(self, car):
        """[(capacity_of_tier or None, load_used_for_risk, extra_cost)]"""
        t1, t2 = self.t1[car], self.t2[car]
        tiers = [(t1, t1, 0.0)]
        if t2 > t1:
            tiers.append((t2 - t1, t2, 0.0))
        tiers.append((None, 1.2 * self.mx[car], CFG["surge_cost"]))
        return tiers


def add_load_and_history(df: pd.DataFrame, hist: LaneHistory, cap: Capacity) -> pd.DataFrame:
    df = df.copy()
    df["carrier_load"] = df.groupby(["carrier_id", "day"]).delivery_id.transform("size")
    df["load_ratio"] = df.carrier_load / df.carrier_id.map(cap.t1)
    h = hist.lookup(df.carrier_id.values, df.destination_region.values, df.day.values)
    for col in h.columns:
        df[col] = h[col].values
    return df


def to_model_frame(df: pd.DataFrame) -> pd.DataFrame:
    X = df[FEATURES].copy()
    for c in CAT_FEATURES:
        X[c] = pd.Categorical(X[c], categories=CATEGORIES[c])
    return X


CATEGORIES: dict = {}


# ----------------------------------------------------------------------------------------------
# 3. RISK MODEL
# ----------------------------------------------------------------------------------------------
def train_risk_model(train: pd.DataFrame):
    tr = train[train.day < CFG["valid_start"]]
    va = train[train.day >= CFG["valid_start"]]
    params = dict(objective="binary", learning_rate=0.03, num_leaves=31, min_child_samples=80,
                  subsample=0.8, subsample_freq=1, colsample_bytree=0.8, reg_lambda=1.0,
                  n_estimators=3000, random_state=CFG["seed"], verbose=-1,
                  # domain rule: more load on a carrier can never LOWER its late risk
                  monotone_constraints=[1 if f in ("carrier_load", "load_ratio") else 0 for f in FEATURES],
                  monotone_constraints_method="advanced")
    m = lgb.LGBMClassifier(**params)
    m.fit(to_model_frame(tr), tr.late, eval_set=[(to_model_frame(va), va.late)],
          callbacks=[lgb.early_stopping(100, verbose=False)])
    best = m.best_iteration_ or 300
    params["n_estimators"] = best                                   # refit on all of train
    model = lgb.LGBMClassifier(**params).fit(to_model_frame(train), train.late)
    # TODO(LOOP-retrain): retrain weekly (Azure Function timer / ML job) on a rolling 6-12 month
    #   window; promote the new model only if test AUC and calibration are not worse (champion/challenger).
    return model, best


def lookup_baseline(train: pd.DataFrame):
    """Old way: one late rate per (carrier, region, friday). Used for comparison only."""
    return train.groupby(["carrier_id", "destination_region", "is_friday"]).late.mean()


def evaluate_model(model, test: pd.DataFrame, train: pd.DataFrame) -> dict:
    p = model.predict_proba(to_model_frame(test))[:, 1]
    lk = lookup_baseline(train)
    p_lk = lk.reindex(pd.MultiIndex.from_frame(test[["carrier_id", "destination_region", "is_friday"]])).fillna(train.late.mean()).values
    bins = pd.cut(p, [0, .1, .2, .3, .4, .5, .6, .7, .8, 1.0], include_lowest=True)
    calib = (pd.DataFrame({"bin": bins, "pred": p, "actual": test.late.values})
             .groupby("bin", observed=True).agg(n=("actual", "size"), predicted=("pred", "mean"),
                                                actual=("actual", "mean")).round(3))
    # SHAP-style contributions (built into LightGBM): mean |contribution| per feature
    contrib = model.predict(to_model_frame(test), pred_contrib=True)
    shap_imp = pd.Series(np.abs(contrib[:, :-1]).mean(0), index=FEATURES).sort_values(ascending=False)
    return dict(
        auc_model=roc_auc_score(test.late, p), auc_lookup=roc_auc_score(test.late, p_lk),
        brier_model=brier_score_loss(test.late, p), brier_lookup=brier_score_loss(test.late, p_lk),
        logloss_model=log_loss(test.late, p), logloss_lookup=log_loss(test.late, p_lk),
        calibration=calib, shap_importance=shap_imp)


# ----------------------------------------------------------------------------------------------
# 4. COST MODEL  (G4 + G6)
# ----------------------------------------------------------------------------------------------
class CostModel:
    def __init__(self, train: pd.DataFrame, info: dict):
        # G6 rate: carrier_rate_usd is linear in distance per carrier (corr = 1.0 in data)
        self.rate = {}
        for c, g in train.groupby("carrier_id"):
            b, a = np.polyfit(g.distance_miles, g.carrier_rate_usd, 1)
            self.rate[c] = (a, b)
        self.redeliv = info["redelivery_per_late"]
        self.penalty = info["penalty_per_breach"]
        # TODO(G7-claims): add expected damage/claims cost = claim_rate[carrier, lane] x avg_claim_$
        # TODO(G6-accessorials): add liftgate / residential / fuel surcharge per carrier once available.

    def carrier_rate(self, car, distance):
        a, b = self.rate[car]
        return a + b * np.asarray(distance)

    def late_cost(self, df: pd.DataFrame) -> np.ndarray:
        """$ lost if THIS order is late: redelivery + contractual penalty + optional churn cost (G4)."""
        churn = df.account_tier.map(CFG["churn_cost"]).fillna(0).values
        return self.redeliv + self.penalty * (df.sla_penalty_clause.values == "Y") + churn


# ----------------------------------------------------------------------------------------------
# 5. CANDIDATE SCORING: every order x every carrier x every load tier
# ----------------------------------------------------------------------------------------------
def score_candidates(day_orders: pd.DataFrame, model, hist: LaneHistory, cap: Capacity,
                     rules: "Rules | None" = None) -> pd.DataFrame:
    rows = []
    for car in CARRIERS:
        for t, (tcap, load, extra) in enumerate(cap.tiers(car)):
            c = day_orders.copy()
            c["orig_carrier"] = c.carrier_id
            c["carrier_id"] = car
            c["carrier_load"] = load
            c["load_ratio"] = load / cap.t1[car]
            c["tier"], c["tier_extra"] = t, extra
            rows.append(c)
    cand = pd.concat(rows, ignore_index=True)
    h = hist.lookup(cand.carrier_id.values, cand.destination_region.values, cand.day.values)
    for col in h.columns:
        cand[col] = h[col].values
    cand["p_late"] = model.predict_proba(to_model_frame(cand))[:, 1]
    # carrier-intrinsic risk: same order with every non-carrier cause removed. Answers "is this carrier
    # bad on this lane at this load even for a perfect order?" -> used by the block guardrail, so a
    # bad lane is never used just because the order is already likely to be late for other reasons.
    clean = cand.copy()
    clean["address_status"], clean["wrong_wh"], clean["cutoff_miss"], clean["nearest_had_stock"] = "complete", 0, 0, 1
    cand["p_intrinsic"] = model.predict_proba(to_model_frame(clean))[:, 1]
    cand["rule_block"] = rules.blocked(cand) if rules is not None else False
    return cand


class Rules:
    """Hard rules veto ("ML ranks, rules veto"). A (carrier, lane) is blocked when its clean late rate in
    train is above CFG['rule_block_rate'] at that load state (overloaded = tier load above the carrier's
    highest weekday load in train). Transparent, auditable, and protects against model smoothing."""

    def __init__(self, lane_rate: pd.Series, wk_max: dict, cap: Capacity):
        self.lane, self.wk_max, self.cap = lane_rate, wk_max, cap

    def blocked(self, cand: pd.DataFrame) -> np.ndarray:
        load = np.array([self.cap.tiers(c)[t][1] for c, t in zip(cand.carrier_id, cand.tier)])
        over = (load > cand.carrier_id.map(self.wk_max).values).astype(int)
        return lane_rate(self.lane, cand.carrier_id.values, cand.destination_region.values, over) > CFG["rule_block_rate"]


def explain_order(order: pd.DataFrame, model, hist, cap, cost: CostModel, rules=None, top_k=3) -> pd.DataFrame:
    """For a single order (1-row DataFrame): risk, cost and top reasons per carrier at normal load.
    Use this for the simulator UI and for the 'reason' shown to warehouse staff."""
    cand = score_candidates(order, model, hist, cap, rules)
    cand = cand[cand.tier == 0].reset_index(drop=True)
    contrib = model.predict(to_model_frame(cand), pred_contrib=True)[:, :-1]
    rate = np.array([cost.carrier_rate(c, d) for c, d in zip(cand.carrier_id, cand.distance_miles)]).ravel()
    cand["expected_cost"] = rate + cand.p_late * cost.late_cost(cand)
    cand["blocked"] = cand.rule_block
    cand["top_reasons"] = [", ".join(f"{FEATURES[j]} ({'+' if r[j] > 0 else '-'})"
                                     for j in np.argsort(-np.abs(r))[:top_k]) for r in contrib]
    return cand[["carrier_id", "p_late", "p_intrinsic", "expected_cost", "blocked", "top_reasons"]].sort_values("expected_cost")


# ----------------------------------------------------------------------------------------------
# 6. DAILY OPTIMIZER (network LP)
# ----------------------------------------------------------------------------------------------
def optimize_day(day_orders: pd.DataFrame, cand: pd.DataFrame, cap: Capacity, cost: CostModel,
                 switch_cost: float | None = None, p_col: str = "p_late") -> np.ndarray:
    """Assign each order to exactly one (carrier, tier). Minimise total expected cost.
    Tier capacities make the cost piecewise-linear and convex in load, so an LP solves it exactly."""
    sw = CFG["switch_cost"] if switch_cost is None else switch_cost
    n = len(day_orders)
    order_pos = pd.Series(np.arange(n), index=day_orders.delivery_id.values)
    i = order_pos.loc[cand.delivery_id].values
    late_cost = cost.late_cost(cand)
    rate = np.array([cost.carrier_rate(c, d) for c, d in zip(cand.carrier_id, cand.distance_miles)]).ravel()
    p = cand[p_col].values
    c = rate + p * late_cost + cand.tier_extra.values + sw * (cand.carrier_id.values != cand.orig_carrier.values)

    # guardrail: block a (carrier, tier) whose INTRINSIC risk is much worse than the order's best
    # normal-load option. Uses p_intrinsic so the rule reflects the carrier, not the order's other issues.
    #   Intrinsic risk is averaged per (carrier, lane, tier) for the day so single noisy orders don't
    #   slip through; the rules veto is applied on top.
    pi = cand["p_intrinsic"].values if "p_intrinsic" in cand else p
    lane_key = [cand.carrier_id.values, cand.destination_region.values, cand.tier.values]
    lane_pi = pd.Series(pi).groupby(lane_key).transform("mean").values
    best = (pd.Series(np.where(cand.tier.values == 0, lane_pi, np.nan))
            .groupby(cand.destination_region.values).transform("min").values)
    blocked = ((lane_pi - best) > CFG["block_delta"]) | cand.get("rule_block", pd.Series(False, index=cand.index)).values.astype(bool)
    c = np.where(blocked, c + CFG["big"], c)
    # TODO(G8-contracts): F's preferred-supplier agreement / volume commitments -> add rows
    #   sum(x[carrier=F]) >= committed_daily_volume, or a $ shortfall penalty variable.
    # TODO(G8-diversity): cap any single carrier at <= X% of a lane's daily volume to keep a backup.
    # TODO(GUARD-override): honour pre-locked orders (staff overrides) by fixing their x to 1.

    m = len(cand)
    rows_eq, cols_eq = i, np.arange(m)                                   # each order assigned once
    A_eq = coo_matrix((np.ones(m), (rows_eq, cols_eq)), shape=(n, m)).tocsr()
    ub_rows, ub_cols, b_ub, r = [], [], [], 0
    for car in CARRIERS:
        for t, (tcap, _, _) in enumerate(cap.tiers(car)):
            if tcap is None:
                continue
            idx = np.where((cand.carrier_id.values == car) & (cand.tier.values == t))[0]
            ub_rows += [r] * len(idx); ub_cols += list(idx); b_ub.append(tcap); r += 1
    A_ub = coo_matrix((np.ones(len(ub_rows)), (ub_rows, ub_cols)), shape=(r, m)).tocsr()
    res = linprog(c, A_ub=A_ub, b_ub=b_ub, A_eq=A_eq, b_eq=np.ones(n), bounds=(0, 1), method="highs")
    assert res.status == 0, res.message
    x = res.x.round()
    pick = pd.Series(cand.carrier_id.values[x > 0.5], index=i[x > 0.5]).sort_index()
    assert len(pick) == n and pick.index.is_unique, "LP solution not integral: check integer capacities"
    # TODO(LOOP-explore): send 2-5% of LOW-risk orders to the 2nd-best carrier (epsilon-greedy or
    #   Thompson sampling) so non-chosen carriers keep getting fresh data; log propensities for
    #   unbiased off-policy evaluation later.
    return pick.values


def lookup_candidates(day_orders, train_clean_rate: pd.Series, cap: Capacity, wk_max: dict) -> pd.DataFrame:
    """Same candidate grid, but p_late from the rules lookup: clean late rate by (carrier, lane, overloaded),
    where overloaded = tier load above the carrier's highest weekday load in train (uses the Friday rate).
    This is the strong rules baseline: it knows the D-overload rule but nothing order-specific."""
    rows = []
    for car in CARRIERS:
        for t, (tcap, load, extra) in enumerate(cap.tiers(car)):
            c = day_orders.copy()
            c["orig_carrier"], c["carrier_id"], c["tier"], c["tier_extra"] = c.carrier_id, car, t, extra
            over = int(load > wk_max[car])
            c["p_late"] = lane_rate(train_clean_rate, [car] * len(c), c.destination_region.values, [over] * len(c))
            c["p_intrinsic"] = c["p_late"]
            rows.append(c)
    return pd.concat(rows, ignore_index=True)


# ----------------------------------------------------------------------------------------------
# 7. REPLAY EVALUATION (independent of the ML model, so the model is not graded by itself)
# ----------------------------------------------------------------------------------------------
def lane_rate(lane: pd.Series, cars, regions, over) -> np.ndarray:
    """Clean late rate for (carrier, lane, overloaded). If a carrier was never seen overloaded, fall back
    to its normal-load rate (no evidence of an overload problem), then to 0 for unseen lanes."""
    over = np.asarray(over)
    p = lane.reindex(pd.MultiIndex.from_arrays([cars, regions, over])).values
    p0 = lane.reindex(pd.MultiIndex.from_arrays([cars, regions, np.zeros_like(over)])).values
    return np.nan_to_num(np.where(np.isnan(p), p0, p), nan=0.0)


class ReplayJudge:
    """Scores ANY plan with expected late probabilities built from train data only (never the ML model),
    so the model is not graded by itself. 'overloaded' = carrier's planned load that day is above the
    highest weekday load seen in train (D's Friday failure mode).

    mode="empirical" (default, data-faithful): late rate of the same cause profile on the same
        (carrier, lane, overloaded) in train, backing off to coarser groups when sparse. In this synthetic
        data a late shipment has ONE cause, so non-clean orders are ~equally late on good and bad lanes.
    mode="compound" (conservative real-world view): causes stack independently,
        P = 1 - (1 - P_base[cause profile on good lanes]) x (1 - P_carrier[clean rate on lane]).
    Report both: a plan should look good under each."""

    PROFILE = ["address_status", "wrong_wh", "cutoff_miss", "detour"]

    def __init__(self, train: pd.DataFrame, mode: str = "empirical"):
        self.mode = mode
        daily = train.groupby(["carrier_id", "day"]).size().rename("n").reset_index()
        self.wk_max = daily[daily.day.dt.dayofweek < 4].groupby("carrier_id").n.max().to_dict()
        tr = train.copy()
        tr["over"] = (tr.carrier_load > tr.carrier_id.map(self.wk_max)).astype(int)
        clean = tr[tr.clean == 1]
        lane = clean.groupby(["carrier_id", "destination_region", "over"]).late.agg(["mean", "size"])
        self.lane = lane["mean"].where(lane["size"] >= CFG["min_lane_n"])
        good = tr.join(self.lane.rename("lp"), on=["carrier_id", "destination_region", "over"])
        self.base = good[good.lp <= 0.01].groupby(self.PROFILE).late.mean()
        fine = tr.groupby(["carrier_id", "destination_region", "over"] + self.PROFILE).late.agg(["mean", "size"])
        self.fine = fine["mean"].where(fine["size"] >= 30)
        mid = tr.groupby(["carrier_id", "destination_region", "over", "clean"]).late.agg(["mean", "size"])
        self.mid = mid["mean"].where(mid["size"] >= 30)
        self.prof = tr.groupby(self.PROFILE).late.mean()

    def _frame(self, df, picks):
        tmp = df[["day", "destination_region", "clean"] + self.PROFILE].copy()
        tmp["car"] = picks
        load = tmp.groupby(["car", "day"]).car.transform("size")
        tmp["over"] = (load > tmp.car.map(self.wk_max)).astype(int)
        return tmp

    def p_late(self, df: pd.DataFrame, picks: np.ndarray) -> np.ndarray:
        tmp = self._frame(df, picks)
        p_car = lane_rate(self.lane, tmp.car.values, tmp.destination_region.values, tmp.over.values)
        if self.mode == "compound":
            p_base = self.base.reindex(pd.MultiIndex.from_frame(tmp[self.PROFILE])).fillna(self.base.mean()).values
            return 1 - (1 - p_base) * (1 - p_car)
        p = self.fine.reindex(pd.MultiIndex.from_frame(tmp[["car", "destination_region", "over"] + self.PROFILE])).values
        p_mid = self.mid.reindex(pd.MultiIndex.from_frame(tmp[["car", "destination_region", "over", "clean"]])).values
        p_prof = self.prof.reindex(pd.MultiIndex.from_frame(tmp[self.PROFILE])).values
        p = np.where(np.isnan(p), p_mid, p)
        p = np.where(np.isnan(p), np.where(tmp.clean.values == 1, p_car, p_prof), p)
        return p

    def on_bad_lane(self, df, picks) -> np.ndarray:
        tmp = self._frame(df, picks)
        return lane_rate(self.lane, tmp.car.values, tmp.destination_region.values, tmp.over.values) > CFG["rule_block_rate"]


def replay_score(name, df, picks, judge: ReplayJudge, cost: CostModel, cap: Capacity) -> dict:
    p = judge.p_late(df, picks)
    rate = np.array([cost.carrier_rate(c, d) for c, d in zip(picks, df.distance_miles)]).ravel()
    load = pd.Series(picks).groupby([picks, df.day.values]).transform("size").values
    surge = (load > np.array([cap.t2[c] for c in picks])) * CFG["surge_cost"]   # approx per-order surge
    total = rate + p * cost.late_cost(df) + surge
    return dict(judge=judge.mode, scenario=name, on_time=1 - p.mean(), cost_per_ship=total.mean(),
                freight=rate.mean(), moved=(picks != df.carrier_id.values).mean(),
                on_bad_lane=judge.on_bad_lane(df, picks).mean())


# ----------------------------------------------------------------------------------------------
# 8. MAIN
# ----------------------------------------------------------------------------------------------
def main(data_dir: str, out_dir: str):
    os.makedirs(out_dir, exist_ok=True)
    d, info = load_data(data_dir)
    for col in CAT_FEATURES:
        CATEGORIES[col] = sorted(d[col].dropna().unique())

    train_raw = d[d.day < CFG["train_end"]]
    hist = LaneHistory(d)                      # trailing stats only use outcomes known before each day
    cap = Capacity(train_raw)
    d = add_load_and_history(d, hist, cap)
    train, test = d[d.day < CFG["train_end"]].copy(), d[d.day >= CFG["train_end"]].copy()

    model, best_iter = train_risk_model(train)
    ev = evaluate_model(model, test, train)
    cost = CostModel(train, info)
    judges = [ReplayJudge(train, "empirical"), ReplayJudge(train, "compound")]
    judge = judges[0]
    clean_rate = judge.lane                     # rules baseline: clean late rate by (carrier, lane, overloaded)
    rules = Rules(clean_rate, judge.wk_max, cap)

    # replay Aug-Sep: today vs lookup-optimizer vs ML-optimizer (same LP, same rules)
    test = test.sort_values(["day", "delivery_id"]).reset_index(drop=True)
    plans = {"Today": test.carrier_id.values}
    for sw in [0.0, CFG["switch_cost"]]:
        picks_lk, picks_ml = [], []
        for _, g in test.groupby("day", sort=True):
            g = g.reset_index(drop=True)
            picks_lk.append(optimize_day(g, lookup_candidates(g, clean_rate, cap, judge.wk_max), cap, cost, sw))
            picks_ml.append(optimize_day(g, score_candidates(g, model, hist, cap, rules), cap, cost, sw))
        plans[f"Rules (lookup) optimizer, switch ${sw:.0f}"] = np.concatenate(picks_lk)
        plans[f"ML optimizer, switch ${sw:.0f}"] = np.concatenate(picks_ml)
    res = pd.DataFrame([replay_score(name, test, pk, j, cost, cap) for j in judges for name, pk in plans.items()])

    # explain one example order (penalty client, F -> Southeast if available)
    ex = test[(test.carrier_id == "F") & (test.destination_region == "Southeast")].head(1)
    expl = explain_order(ex, model, hist, cap, cost, rules) if len(ex) else pd.DataFrame()

    model.booster_.save_model(os.path.join(out_dir, "carrier_risk_model.txt"))
    res.to_csv(os.path.join(out_dir, "replay_results.csv"), index=False)
    write_report(os.path.join(out_dir, "model_report.md"), info, best_iter, ev, res, cap, cost, expl, ex)
    print(res.round(4).to_string(index=False))
    print({k: round(v, 4) for k, v in ev.items() if isinstance(v, float)})


def write_report(path, info, best_iter, ev, res, cap, cost, expl, ex):
    f = lambda x: f"{x:.3f}"
    lines = ["# Carrier risk model + optimizer: results", "",
             f"Rows: {info['rows_raw']:,} raw, {info['rows_clean']:,} after cleaning. "
             f"Train: Apr-Jul 2026 (early stop on Jul). Test: Aug-Sep 2026. Trees: {best_iter}.", "",
             "## Risk model vs lane lookup (test set)", "",
             "| Metric | ML model | Lane lookup |", "|---|---|---|",
             f"| AUC (higher better) | {f(ev['auc_model'])} | {f(ev['auc_lookup'])} |",
             f"| Brier (lower better) | {f(ev['brier_model'])} | {f(ev['brier_lookup'])} |",
             f"| Log loss (lower better) | {f(ev['logloss_model'])} | {f(ev['logloss_lookup'])} |", "",
             "## Calibration (test set)", "", "| Predicted bin | Orders | Avg predicted | Actual late |", "|---|---|---|---|"]
    for b, r in ev["calibration"].iterrows():
        lines.append(f"| {b} | {int(r.n):,} | {r.predicted:.3f} | {r.actual:.3f} |")
    lines += ["", "## Top drivers (mean |SHAP| contribution, test set)", "", "| Feature | Importance |", "|---|---|"]
    for k, v in ev["shap_importance"].head(12).items():
        lines.append(f"| {k} | {v:.3f} |")
    lines += ["", "## Replay Aug-Sep (expected outcomes, judged independently of the ML model)", "",
              "| Judge | Scenario | On-time | Cost / shipment | Freight | Orders moved | On bad lane |", "|---|---|---|---|---|---|---|"]
    for r in res.itertuples():
        lines.append(f"| {r.judge} | {r.scenario} | {r.on_time:.1%} | ${r.cost_per_ship:.2f} | ${r.freight:.2f} | {r.moved:.0%} | {r.on_bad_lane:.1%} |")
    lines += ["", "## How to read this", "",
              "- The risk model predicts lateness far better than a lane table (AUC above), so it is the right "
              "engine for the whole delivery diagnostic, not just carrier choice.",
              "- For carrier choice alone, ML and rules both reach the carrier ceiling (~78% on-time): good lanes "
              "are ~0% clean late, so once bad lanes and D overload are avoided there is little left to win.",
              "- ML adds per-order risk, flexibility for new factors, and explanations; rules add a transparent veto.",
              "- Data note: in this synthetic data a late shipment has one cause, so non-clean orders are about "
              "equally late on any carrier. The compound judge assumes causes stack (real-world view).",
              "- Assumptions: surge $5/order, switch cost $5, capacity tiers from train percentiles, $180 penalty "
              "only for clients with a clause."]
    lines += ["", "## Capacity tiers learned from train (orders/day)", "", "| Carrier | Tier 1 (weekday p95) | Tier 2 (busy-day p95) | Max seen |", "|---|---|---|---|"]
    for c in CARRIERS:
        lines.append(f"| {c} | {cap.t1[c]:.0f} | {cap.t2[c]:.0f} | {cap.mx[c]:.0f} |")
    if len(expl):
        o = ex.iloc[0]
        lines += ["", f"## Example explanation: order {o.delivery_id} ({o.carrier_id} -> {o.destination_region}, "
                  f"penalty clause {o.sla_penalty_clause})", "", "| Carrier | P(late) | Carrier-only risk | Expected cost | Blocked | Top reasons |", "|---|---|---|---|---|---|"]
        for r in expl.itertuples():
            lines.append(f"| {r.carrier_id} | {r.p_late:.2f} | {r.p_intrinsic:.2f} | ${r.expected_cost:.2f} | {'yes' if r.blocked else 'no'} | {r.top_reasons} |")
    lines += ["", "## Config", "", "```json", json.dumps({k: v for k, v in CFG.items()}, indent=2), "```"]
    open(path, "w").write("\n".join(lines))


# ----------------------------------------------------------------------------------------------
# FUTURE WORK (short notes for the next agent; each has a TODO hook above)
# ----------------------------------------------------------------------------------------------
# G5 External     : Azure Maps Weather Along Route + Traffic + holiday calendar -> new NUM_FEATURES.
#                   Use forecasts as of 08:00. Backfill history to retrain. Weather affects ~5% of days,
#                   so expect it to matter on specific days, not overall AUC.
# G7 Quality      : claims rate & avg claim $ -> CostModel; feed type/latency -> features;
#                   proactive-alert quality -> scorecard only.
# G8 Portfolio    : contract volume floors (F preferred supplier) and per-lane diversity caps -> extra
#                   LP rows in optimize_day(). Keep >= 2 good carriers per lane.
# TENDER          : tender acceptance rate + tender lead time once carriers return accept/reject events.
# LOOP            : exploration (2-5% of low-risk orders), propensity logging, weekly retrain,
#                   champion/challenger promotion, off-policy evaluation of new policies.
# GUARD           : staff overrides with reason codes (locked in LP), drift alert when a lane's 7-day
#                   clean late rate jumps > 10 pts, kill switch back to lookup optimizer.
# DEPLOY (Azure)  : model file in Blob Storage; Azure Function (timer, 08:00 per warehouse) loads
#                   today's orders from PostgreSQL, calls score_candidates + optimize_day, writes
#                   recommendations table; explain_order behind an HTTP Function for the UI.

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="./Halcyon-Hackathon-Dataset")
    ap.add_argument("--out", default="./outputs")
    a = ap.parse_args()
    main(a.data, a.out)

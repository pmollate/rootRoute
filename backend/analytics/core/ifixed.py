"""'If fixed' estimate (SPEC §5.1), adoption-adjusted replay, cause attribution and cost avoided (SPEC §1.1)."""
from itertools import combinations, product
from math import factorial

import pandas as pd

from analytics.core.diagnosis import HANDLING_COST, PENALTY


def if_fixed(d: pd.DataFrame, fix: list[str], flags: list[str]) -> pd.Series:
    """Per-delivery late probability after fixing every flag in `fix`.

    Rows with any fixed flag take the mean late rate of rows that have none of the fixed flags and the same values
    of the remaining flags. Raises if some combination has no baseline.
    """
    est = d.late.astype(float).copy()
    if not fix:
        return est
    rest = [f for f in flags if f not in fix]
    has = d[fix].any(axis=1)
    if not rest:
        est[has] = d.loc[~has, "late"].mean()
        return est
    base = d.loc[~has].groupby(rest).late.mean()
    keys = d.loc[has, rest[0]] if len(rest) == 1 else pd.MultiIndex.from_frame(d.loc[has, rest])
    est[has] = base.reindex(keys).to_numpy()
    if est.isna().any():
        raise ValueError(f"no baseline for some rows when fixing {fix} over {flags}")
    return est


def paid_ratio(d: pd.DataFrame, penalties: pd.DataFrame) -> float:
    eligible = d.late & d.sla_penalty_clause.eq("Y")
    return len(penalties) / int(eligible.sum())


def cost_avoided(d: pd.DataFrame, est: pd.Series, ratio: float) -> tuple[float, float]:
    """Return (late deliveries avoided, USD avoided) over the rows of d."""
    delta = d.late.astype(float) - est
    clause = d.sla_penalty_clause.eq("Y")
    late_avoided = float(delta.sum())
    usd = late_avoided * HANDLING_COST + float((delta * clause).sum()) * PENALTY * ratio
    return late_avoided, usd


def _late_rate(d: pd.DataFrame, flags: list[str], key: tuple, lookup: dict) -> float:
    """Late rate of deliveries with exactly these causes; if none exist, of deliveries with at least these causes
    (a conservative stand-in used only for rare combinations)."""
    if key in lookup:
        return lookup[key]
    has = [f for f, v in zip(flags, key) if v]
    mask = d[has].all(axis=1) if has else pd.Series(True, index=d.index)
    rate = float(d.loc[mask, "late"].mean())
    lookup[key] = rate
    return rate


def adopted(d: pd.DataFrame, rates: dict[str, float], flags: list[str]) -> pd.Series:
    """Per-delivery late probability when each fix in `rates` works on that share of its deliveries.

    A fix with rate 0.85 removes its cause from 85% of the deliveries that have it. A delivery keeps its actual
    outcome when none of its causes is removed; otherwise it takes the late rate of deliveries with exactly the
    causes that remain. With every rate at 1.0 this equals if_fixed().
    """
    lookup = {k if isinstance(k, tuple) else (k,): v for k, v in d.groupby(flags).late.mean().items()}
    keep, moved = {}, {}
    for combo in d[flags].drop_duplicates().itertuples(index=False):
        present = [i for i, f in enumerate(flags) if combo[i] and f in rates]
        p_keep, value = 1.0, 0.0
        for mask in product([False, True], repeat=len(present)):
            p, key = 1.0, list(combo)
            for i, fixed in zip(present, mask):
                p *= rates[flags[i]] if fixed else 1 - rates[flags[i]]
                if fixed:
                    key[i] = False
            if not any(mask):
                p_keep = p
            elif p > 0:
                value += p * _late_rate(d, flags, tuple(key), lookup)
        keep[tuple(combo)], moved[tuple(combo)] = p_keep, value
    keys = pd.MultiIndex.from_frame(d[flags])
    p_keep = pd.Series(keep).reindex(keys).to_numpy()
    value = pd.Series(moved).reindex(keys).to_numpy()
    return pd.Series(p_keep * d.late.astype(float).to_numpy() + value, index=d.index)


def shapley(d: pd.DataFrame, flags: list[str]) -> dict[str, float]:
    """Points of on-time delivery lost to each cause, sharing deliveries with several causes fairly (SPEC §2.2)."""
    n = len(flags)
    on_time = {}
    for size in range(n + 1):
        for subset in combinations(flags, size):
            on_time[frozenset(subset)] = 1 - float(if_fixed(d, list(subset), flags).mean())
    out = {}
    for f in flags:
        others = [g for g in flags if g != f]
        total = 0.0
        for size in range(n):
            for subset in combinations(others, size):
                s = frozenset(subset)
                weight = factorial(size) * factorial(n - size - 1) / factorial(n)
                total += weight * (on_time[s | {f}] - on_time[s])
        out[f] = total
    return out

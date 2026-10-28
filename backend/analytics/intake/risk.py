"""risk_lookup: late rate by facts known before despatch (SPEC §5.5, E10)."""
import pandas as pd

KEY = ["f_addr", "f_cutoff", "f_stock", "f_lane"]
MIN_N = 30


def risk_lookup(d: pd.DataFrame) -> pd.DataFrame:
    """f_lane (bad lane or D on a Friday) is known when the carrier is booked, before despatch."""
    g = d.groupby(KEY).late.agg(n="size", late_rate="mean").reset_index()
    coarse = d.groupby(KEY[:3]).late.mean().rename("coarse").reset_index()
    g = g.merge(coarse, on=KEY[:3])
    g["late_rate"] = g.late_rate.where(g.n >= MIN_N, g.coarse)
    return g.drop(columns="coarse")

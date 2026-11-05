"""Route reordering demo (C9c, SPEC §5.19): 2-opt over SD-11's invented stops, written to route_demo.

Synthetic: positions, both orders and optimised_km are invented. Only planned_km, actual_km and overran are real.
Nothing but GET /api/labs/route-demo reads this table (REQ-RDEMO-06).
"""
import importlib.util
import json
from pathlib import Path

import numpy as np
import pandas as pd

_GEN = Path(__file__).resolve().parents[2] / "synthetic-data" / "generators" / "sd11_route_stops.py"
_spec = importlib.util.spec_from_file_location("sd11_route_stops", _GEN)
sd11 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(sd11)


def two_opt(points: np.ndarray, order: list[int]) -> list[int]:
    """Best-improvement 2-opt with the depot fixed at both ends; never returns a longer tour."""
    pts = np.vstack([sd11.DEPOT, points])            # index 0 is the depot
    route = np.array([0, *[i + 1 for i in order], 0])
    dist = np.linalg.norm(pts[:, None] - pts[None, :], axis=2)
    improved = True
    while improved:
        improved = False
        for i in range(1, len(route) - 2):
            js = np.arange(i + 1, len(route) - 1)
            a, b = route[i - 1], route[i]
            gain = dist[a, b] + dist[route[js], route[js + 1]] - dist[a, route[js]] - dist[b, route[js + 1]]
            k = int(np.argmax(gain))
            if gain[k] > 1e-9:
                j = js[k]
                route[i:j + 1] = route[i:j + 1][::-1]
                improved = True
    return [int(x) - 1 for x in route[1:-1]]


def _examples(t: pd.DataFrame) -> pd.Series:
    """One overrun, one on-plan and one no-distance delivery: the lowest delivery id of each kind whose reordering
    is shorter than the plan (fallback: the lowest id of that kind)."""
    kinds = {
        "overrun": t.overran,
        "on_plan": ~t.overran & t.actual_km.notna(),
        "no_distance": t.actual_km.isna(),
    }
    example = pd.Series([None] * len(t), index=t.index, dtype=object)
    for kind, mask in kinds.items():
        if mask.any():
            shorter = mask & (t.optimised_km < t.planned_km)
            pick = t[shorter if shorter.any() else mask]
            example[pick.sort_values("delivery_id").index[0]] = kind
    return example


def route_demo(d: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for r in d[["delivery_id", "stops_on_route", "planned_route_km", "actual_route_km", "f_route"]].itertuples(index=False):
        pts, planned = sd11.stops_for(r.delivery_id, int(r.stops_on_route), float(r.planned_route_km))
        best = two_opt(pts, planned)
        rows.append({
            "delivery_id": r.delivery_id, "n_stops": int(r.stops_on_route),
            "stops": json.dumps(np.round(pts, 3).tolist()),
            "planned_order": json.dumps(planned), "optimised_order": json.dumps(best),
            "planned_km": float(r.planned_route_km), "optimised_km": min(round(sd11.tour_km(pts, best), 3), float(r.planned_route_km)),
            "actual_km": None if pd.isna(r.actual_route_km) else float(r.actual_route_km),
            "overran": bool(r.f_route),
        })
    t = pd.DataFrame(rows)
    t["example"] = _examples(t)
    t["synthetic"] = True
    return t

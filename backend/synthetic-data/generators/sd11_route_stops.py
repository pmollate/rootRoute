"""SD-11 (SPEC §12.1, §5.19, C9c): synthetic stop positions per delivery for the route reordering demo.

Seeded by the delivery id, so the same delivery always gets the same stops. The fulfilment warehouse is the depot at
(0, 0). The planned order is a nearest-neighbour tour (a reasonable dispatcher's plan), and every point is scaled so that
tour measures the delivery's real planned_route_km. Positions are invented: the supplied data has none.
"""
import hashlib

import numpy as np

DEPOT = np.zeros(2)


def seed_for(delivery_id: str) -> int:
    return int.from_bytes(hashlib.sha256(delivery_id.encode()).digest()[:8], "little")


def tour_km(points: np.ndarray, order: list[int]) -> float:
    """Depot → points in `order` → depot, straight-line km."""
    path = np.vstack([DEPOT, points[order], DEPOT])
    return float(np.linalg.norm(np.diff(path, axis=0), axis=1).sum())


def nearest_neighbour(points: np.ndarray) -> list[int]:
    left, pos, order = list(range(len(points))), DEPOT, []
    while left:
        i = left.pop(int(np.argmin(np.linalg.norm(points[left] - pos, axis=1))))
        order.append(i)
        pos = points[i]
    return order


def stops_for(delivery_id: str, n_stops: int, planned_km: float) -> tuple[np.ndarray, list[int]]:
    """`n_stops` points uniform in a unit disc around the depot, scaled so the nearest-neighbour tour is `planned_km`."""
    if planned_km <= 0 or n_stops < 1:
        raise ValueError(f"{delivery_id}: need planned_km > 0 and at least one stop")
    rng = np.random.default_rng(seed_for(delivery_id))
    r, angle = np.sqrt(rng.random(n_stops)), rng.random(n_stops) * 2 * np.pi
    points = np.column_stack([r * np.cos(angle), r * np.sin(angle)])
    order = nearest_neighbour(points)  # scaling keeps the order: nearest stays nearest
    return points * (planned_km / tour_km(points, order)), order

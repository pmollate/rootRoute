"""SD-04 synthetic client domains and saved addresses (SPEC §12.1)."""
import numpy as np
import pandas as pd

from analytics.intake.reference import ADDRESSES, LABELS, client_domain

SEED = 42
DEMO_CLIENT = "C190"


def client_domains(clients: pd.DataFrame) -> pd.DataFrame:
    return pd.DataFrame({"domain": clients.client_id.map(client_domain), "client_id": clients.client_id})


def saved_addresses(clients: pd.DataFrame) -> pd.DataFrame:
    """1-3 saved delivery addresses per client in its region (C190 always 2), taken from the real reference list."""
    rng = np.random.default_rng(SEED)
    rows = []
    for c in clients.itertuples():
        n = 2 if c.client_id == DEMO_CLIENT else int(rng.integers(1, 4))
        addresses = ADDRESSES[c.region]
        for i in range(n):
            a = addresses[(int(c.client_id[1:]) + i) % len(addresses)]
            rows.append({"client_id": c.client_id, "label": LABELS[i % len(LABELS)], "line1": a["line1"],
                         "line2": f"Dock {i + 1}", "city": a["city"], "state": a["state"], "zip": a["zip"],
                         "synthetic": True})
    return pd.DataFrame(rows)

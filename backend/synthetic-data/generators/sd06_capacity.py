"""SD-06: synthetic carrier capacity contracts (owner C). The pipeline builds the same table in memory.

Run from the repo root:  python backend/synthetic-data/generators/sd06_capacity.py
"""
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BACKEND))

from analytics.carriers.capacity import carrier_capacity  # noqa: E402
from analytics.core.load import load  # noqa: E402

OUT = BACKEND / "synthetic-data" / "out"

if __name__ == "__main__":
    d, _ = load()
    OUT.mkdir(parents=True, exist_ok=True)
    carrier_capacity(d).to_csv(OUT / "carrier_capacity.csv", index=False)
    print(f"wrote {OUT / 'carrier_capacity.csv'}")

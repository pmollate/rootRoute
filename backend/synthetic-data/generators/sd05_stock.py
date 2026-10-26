"""SD-05: synthetic daily stock per warehouse x client x SKU (owner B). The pipeline builds the same table in memory.

Run from the repo root:  python backend/synthetic-data/generators/sd05_stock.py
"""
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BACKEND))

from analytics.core.load import load  # noqa: E402
from analytics.warehouse.stock import stock_daily  # noqa: E402

OUT = BACKEND / "synthetic-data" / "out"

if __name__ == "__main__":
    d, _ = load()
    OUT.mkdir(parents=True, exist_ok=True)
    stock_daily(d).to_csv(OUT / "stock_daily.csv", index=False)
    print(f"wrote {OUT / 'stock_daily.csv'}")

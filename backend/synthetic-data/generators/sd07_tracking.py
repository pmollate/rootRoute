"""SD-07: synthetic carrier tracking feeds in three formats (owner C). The pipeline also calls write_feeds().

Run from the repo root:  python backend/synthetic-data/generators/sd07_tracking.py
"""
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BACKEND))

from analytics.carriers.tracking import write_feeds  # noqa: E402
from analytics.core.load import load  # noqa: E402

if __name__ == "__main__":
    d, _ = load()
    print(f"wrote feeds to {write_feeds(d)}")

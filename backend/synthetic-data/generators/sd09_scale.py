"""SD-09: synthetic N× replica and a synthetic second client, for the timed scale run (AC-DATA-23, docs/SCALE-RUN.md).

Run from the repo root:  python backend/synthetic-data/generators/sd09_scale.py [--factor 10]
Writes out/scale/x<N>/ and out/scale/second-client/ (gitignored). `npm run bench` builds them too if missing.
"""
import argparse
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BACKEND))

from analytics.core.load import DATA_DIR  # noqa: E402
from analytics.scaledata import write_replica, write_second_client  # noqa: E402

OUT = BACKEND / "synthetic-data" / "out" / "scale"

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--factor", type=int, default=10)
    factor = parser.parse_args().factor
    print(f"wrote {write_replica(DATA_DIR, OUT / f'x{factor}', factor)}")
    print(f"wrote {write_second_client(DATA_DIR, OUT / 'second-client')}")

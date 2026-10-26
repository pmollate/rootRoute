"""Run every area's build step and write the tables (CONTRACTS §4).

Usage:  python -m analytics.pipeline            # writes to DATABASE_URL
        python -m analytics.pipeline --test-db  # writes to TEST_DATABASE_URL
        python -m analytics.pipeline --dry-run  # builds only, prints table sizes
"""
import argparse
import os
import time

import pandas as pd

from analytics import carriers, intake, warehouse
from analytics.core.build import build as core_build
from analytics.core.context import Ctx
from analytics.core.db import write_tables
from analytics.core.load import DATA_DIR, load

STEPS = [("core", core_build), ("warehouse", warehouse.build), ("carriers", carriers.build), ("intake", intake.build)]


def run() -> dict[str, pd.DataFrame]:
    d, clients = load()
    ctx = Ctx(d=d, clients=clients, data_dir=DATA_DIR)
    for name, step in STEPS:
        started = time.time()
        out = step(ctx)
        overlap = set(out) & set(ctx.tables)
        if overlap:
            raise ValueError(f"step {name} rewrote tables owned by an earlier step: {overlap}")
        ctx.tables.update(out)
        print(f"{name}: {len(out)} tables in {time.time() - started:.1f}s")
    return ctx.tables


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--test-db", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    tables = run()
    if args.dry_run:
        for name, df in sorted(tables.items()):
            print(f"{name:28s} {len(df):>8,} rows")
        return
    url = os.environ["TEST_DATABASE_URL" if args.test_db else "DATABASE_URL"]
    started = time.time()
    write_tables(tables, url)
    print(f"wrote {len(tables)} tables in {time.time() - started:.1f}s")


if __name__ == "__main__":
    main()

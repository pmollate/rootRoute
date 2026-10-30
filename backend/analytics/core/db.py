"""Write pipeline tables to Postgres. Each run replaces every table in one transaction.

The live API reads these tables while CD refreshes them. Replacing them one by one inside the transaction held some
locks while waiting for others, so a reader joining two of them (complaints JOIN clients) could deadlock with the
pipeline. So the write takes every lock it needs up front, waits a bounded time for readers to finish, and retries
the whole transaction if Postgres still picks it as a deadlock victim.
"""
import os
import time
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv
from psycopg import errors as pg
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import OperationalError

REPO = Path(__file__).resolve().parents[3]
# Precedence: real environment variables > root .env > config/environments/<APP_ENV>.env (load_dotenv never overrides).
load_dotenv(REPO / ".env")
APP_ENV = os.environ.get("APP_ENV") or "development"
load_dotenv(REPO / "config" / "environments" / f"{APP_ENV}.env")

ATTEMPTS = 4
LOCK_TIMEOUT = "30s"  # how long to wait for running readers before giving up this attempt


def sqlalchemy_url(url: str) -> str:
    for prefix in ("postgresql://", "postgres://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    return url


def lock_conflict(e: OperationalError) -> bool:
    """A deadlock, or a lock not granted within LOCK_TIMEOUT: worth retrying. Anything else is a real error."""
    return isinstance(e.orig, (pg.DeadlockDetected, pg.LockNotAvailable))


def _replace_all(conn, tables: dict[str, pd.DataFrame]) -> None:
    conn.execute(text(f"SET LOCAL lock_timeout = '{LOCK_TIMEOUT}'"))
    existing = sorted(set(tables) & set(inspect(conn).get_table_names()))
    if existing:
        # One statement, before any table is touched: no lock is held while the write waits for another.
        names = ", ".join('"' + n + '"' for n in existing)
        conn.execute(text(f"LOCK TABLE {names} IN ACCESS EXCLUSIVE MODE"))
    for name, df in tables.items():
        df.to_sql(name, conn, if_exists="replace", index=False, method="multi", chunksize=1000)


def write_tables(tables: dict[str, pd.DataFrame], url: str, attempts: int = ATTEMPTS, wait=time.sleep) -> None:
    engine = create_engine(sqlalchemy_url(url))
    try:
        for attempt in range(1, attempts + 1):
            try:
                with engine.begin() as conn:
                    _replace_all(conn, tables)
                return
            except OperationalError as e:
                if not lock_conflict(e) or attempt == attempts:
                    raise
                delay = 2 ** attempt
                print(f"tables busy ({type(e.orig).__name__}); retry {attempt + 1} of {attempts} in {delay}s")
                wait(delay)
    finally:
        engine.dispose()

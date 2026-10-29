"""The table writer under concurrent readers: CD refreshes tables while the live API reads them."""
import os

import pandas as pd
import psycopg
import pytest
from psycopg import errors as pg
from sqlalchemy.exc import OperationalError

from analytics.core import db

URL = os.environ.get("TEST_DATABASE_URL")
TABLES = ["zz_writer_test_a", "zz_writer_test_b"]


def _conflict(orig):
    return OperationalError("DROP TABLE x", {}, orig)


def test_only_lock_conflicts_are_retried():
    assert db.lock_conflict(_conflict(pg.DeadlockDetected("deadlock detected")))
    assert db.lock_conflict(_conflict(pg.LockNotAvailable("lock timeout")))
    assert not db.lock_conflict(_conflict(pg.UndefinedTable("no such table")))


def _db_up() -> bool:
    if not URL:
        return False
    try:
        psycopg.connect(URL, connect_timeout=2).close()
        return True
    except psycopg.OperationalError:
        return False


@pytest.fixture
def conn():
    if not _db_up():
        pytest.skip("TEST_DATABASE_URL is not reachable")
    with psycopg.connect(URL, autocommit=True) as c:
        for t in TABLES:
            c.execute(f'DROP TABLE IF EXISTS "{t}"')
            c.execute(f'CREATE TABLE "{t}" (v int)')
        yield c
        for t in TABLES:
            c.execute(f'DROP TABLE IF EXISTS "{t}"')


def test_a_reader_holding_a_table_delays_the_write_then_it_retries_and_succeeds(conn, monkeypatch):
    """The CD failure: a reader inside a transaction holds a table the pipeline must replace. The write gives up
    after the lock timeout instead of deadlocking, retries once the reader is done, and replaces every table."""
    monkeypatch.setattr(db, "LOCK_TIMEOUT", "300ms")
    reader = psycopg.connect(URL)
    reader.execute(f'SELECT * FROM "{TABLES[1]}"')  # open transaction: holds AccessShareLock on table b
    waits = []

    def wait(seconds):
        waits.append(seconds)
        reader.rollback()  # the API's query finishes
        reader.close()

    frames = {t: pd.DataFrame({"v": [1, 2, 3]}) for t in TABLES}
    db.write_tables(frames, URL, attempts=3, wait=wait)
    assert waits == [2]  # one retry
    for t in TABLES:
        assert conn.execute(f'SELECT count(*) FROM "{t}"').fetchone()[0] == 3


def test_gives_up_after_the_last_attempt(conn, monkeypatch):
    monkeypatch.setattr(db, "LOCK_TIMEOUT", "200ms")
    with psycopg.connect(URL) as reader:
        reader.execute(f'SELECT * FROM "{TABLES[0]}"')
        with pytest.raises(OperationalError) as e:
            db.write_tables({t: pd.DataFrame({"v": [1]}) for t in TABLES}, URL, attempts=2, wait=lambda s: None)
        assert isinstance(e.value.orig, pg.LockNotAvailable)
        reader.rollback()

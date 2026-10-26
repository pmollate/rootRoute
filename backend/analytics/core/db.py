"""Write pipeline tables to Postgres. Each run replaces every table in one transaction."""
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv
from sqlalchemy import create_engine

REPO = Path(__file__).resolve().parents[3]
load_dotenv(REPO / ".env")


def sqlalchemy_url(url: str) -> str:
    for prefix in ("postgresql://", "postgres://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    return url


def write_tables(tables: dict[str, pd.DataFrame], url: str) -> None:
    engine = create_engine(sqlalchemy_url(url))
    with engine.begin() as conn:
        for name, df in tables.items():
            df.to_sql(name, conn, if_exists="replace", index=False, method="multi", chunksize=1000)
    engine.dispose()

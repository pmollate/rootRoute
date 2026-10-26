import pytest

from analytics.core.load import DATA_DIR, load


@pytest.fixture(scope="session")
def data():
    return load()


@pytest.fixture(scope="session")
def d(data):
    return data[0]


@pytest.fixture(scope="session")
def clients(data):
    return data[1]


@pytest.fixture(scope="session")
def penalties():
    import pandas as pd
    return pd.read_csv(DATA_DIR / "sla_penalties.csv")

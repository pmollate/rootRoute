import pandas as pd
import pytest

from analytics.intake import synthetic
from analytics.intake.reference import ADDRESSES, AREA_CODE, STATE_REGION


@pytest.fixture(scope="module")
def saved(clients):
    return synthetic.saved_addresses(clients)


def test_reference_addresses_sit_in_their_region():
    for region, addresses in ADDRESSES.items():
        assert len(addresses) >= 2
        for a in addresses:
            assert STATE_REGION[a["state"]] == region and a["zip"].isdigit() and len(a["zip"]) == 5
            assert a["state"] in AREA_CODE


def test_sd04_domains_and_demo_client(clients, saved):
    dom = synthetic.client_domains(clients)
    assert dom.domain.is_unique and len(dom) == 280
    assert len(saved[saved.client_id.eq("C190")]) == 2
    assert saved.zip.str.fullmatch(r"\d{5}").all()


def test_saved_addresses_come_from_the_reference_list(saved):
    real = {(a["line1"], a["zip"]) for addresses in ADDRESSES.values() for a in addresses}
    assert set(zip(saved.line1, saved.zip)) <= real


def test_nfr_05_sd04_reproducible(clients):
    pd.testing.assert_frame_equal(synthetic.saved_addresses(clients), synthetic.saved_addresses(clients))

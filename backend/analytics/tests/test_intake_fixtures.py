from email import message_from_string
from email.utils import parsedate_to_datetime
from zoneinfo import ZoneInfo

import pytest

from analytics.intake import fixtures, synthetic
from analytics.intake.reference import ADDRESSES, MAILBOX_TZ


@pytest.fixture(scope="module")
def fx(clients):
    return fixtures.make_fixtures(clients, synthetic.saved_addresses(clients))


def test_sd02_shape(fx):
    golds = [g for _, g in fx]
    assert len(fx) == 50
    assert sum(bool(g["missing"]) for g in golds) == fixtures.INCOMPLETE
    assert sum(g["address_issue"] is not None for g in golds) == fixtures.INVALID
    matched = sum(g["matched_saved"] for g in golds)
    assert sum(g["decision"] == "CONFIRM_ADDRESS" for g in golds) == fixtures.INCOMPLETE - matched + fixtures.INVALID
    assert sum(g["decision"] == "MISSING_INFO" for g in golds) == 1
    assert sum(g["injection"] for g in golds) == 1
    assert {g["layout"] for g in golds} == set(range(1, 15))
    demo = [g for g in golds if g["client_id"] == "C190"]
    assert len(demo) == 1 and demo[0]["decision"] == "CONFIRM_ADDRESS" and demo[0]["missing"] == ["address.line1", "address.zip"]


def test_ac_sec_05_labelled(fx):
    assert all("SYNTHETIC" in eml for eml, _ in fx)


def test_fixture_bodies_contain_gold_values(fx):
    for eml, g in fx:
        body = eml.upper()
        for it in g["items"]:
            assert it["sku"] in body and str(it["qty"]) in body
        for k, v in g["address"].items():
            if v:
                assert v.upper() in body, (g["id"], k, v)
        for value in g["pii"]:
            assert value.upper() in body, (g["id"], value)


def test_valid_addresses_are_real_reference_addresses(fx):
    real = {(a["line1"], a["city"], a["state"], a["zip"]) for addresses in ADDRESSES.values() for a in addresses}
    for _, g in fx:
        a = g["address"]
        if not g["missing"] and g["address_issue"] is None:
            assert (a["line1"], a["city"], a["state"], a["zip"]) in real, g["id"]


def test_headers_are_ready_for_gmail(fx):
    ids = set()
    for eml, g in fx:
        msg = message_from_string(eml)
        assert msg["Message-ID"] == g["message_id"] and msg["X-Synthetic"] == "true"
        local = parsedate_to_datetime(msg["Date"]).astimezone(ZoneInfo(MAILBOX_TZ))
        assert local.strftime("%Y-%m-%d %H:%M") == g["received_at"]
        ids.add(g["message_id"])
    assert len(ids) == len(fx)


def test_nfr_05_sd02_reproducible(clients):
    saved = synthetic.saved_addresses(clients)
    assert fixtures.make_fixtures(clients, saved) == fixtures.make_fixtures(clients, saved)

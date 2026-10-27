"""Generate SD-04 (client domains, saved addresses) and SD-02 (50 intake fixture emails + gold JSON).

Run from the repo root:  python backend/synthetic-data/generators/sd02_sd04_intake.py
"""
import json
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BACKEND))

from analytics.core.load import load  # noqa: E402
from analytics.intake import fixtures, synthetic  # noqa: E402

OUT = BACKEND / "synthetic-data" / "out"
FIXTURES = BACKEND / "tests" / "fixtures" / "emails"


def main() -> None:
    _, clients = load()
    OUT.mkdir(parents=True, exist_ok=True)
    FIXTURES.mkdir(parents=True, exist_ok=True)
    synthetic.client_domains(clients).to_csv(OUT / "client_domains.csv", index=False)
    saved = synthetic.saved_addresses(clients)
    saved.to_csv(OUT / "saved_addresses.csv", index=False)
    for eml, gold in fixtures.make_fixtures(clients, saved):
        (FIXTURES / f"{gold['id']}.eml").write_text(eml)
        (FIXTURES / f"{gold['id']}.json").write_text(json.dumps(gold, indent=2))
    print(f"wrote {OUT} and {FIXTURES}")


if __name__ == "__main__":
    main()

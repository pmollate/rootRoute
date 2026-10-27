"""Shared reference data for synthetic intake data (also read by Node)."""
import json
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2]
REF_DIR = BACKEND / "synthetic-data" / "reference"
REF = json.loads((REF_DIR / "state_regions.json").read_text())
STATE_REGION = {s: region for region, states in REF["regions"].items() for s in states}
ADDRESSES = REF["addresses"]  # region -> real public buildings [{line1, city, state, zip, place}]
MAILBOX_TZ = json.loads((REF_DIR / "mailbox.json").read_text())["timezone"]
LABELS = ["Main DC", "Riverside store", "North depot", "Downtown store", "East yard"]
# Made-up streets for "street not found" fixtures. Check they do not exist in the fixture cities (Task A2 Step 6).
FICTIONAL_STREETS = ["Quillfeather Ln", "Brindlewick Way", "Marrowgate Ct"]
# Synthetic signature names; phone numbers use the reserved fictional range 555-0100 to 555-0199.
PEOPLE = ["Dana Whitfield", "Marcus Bell", "Priya Natarajan", "Tom Okafor", "Elena Ruiz", "Sam Kowalski", "Grace Liu",
          "Owen Brennan"]
AREA_CODE = {"NY": "518", "MA": "617", "PA": "215", "NJ": "973", "GA": "404", "FL": "407", "NC": "704", "TN": "615",
             "IL": "312", "OH": "614", "MI": "313", "MN": "612", "CA": "916", "WA": "206", "AZ": "602", "CO": "303"}


def client_domain(client_id: str) -> str:
    return f"client{int(client_id[1:]):03d}.example"


def client_sender(client_id: str) -> str:
    return f"orders@{client_domain(client_id)}"

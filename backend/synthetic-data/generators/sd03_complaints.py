"""SD-03: the 34 real complaints rendered as synthetic complaint emails for the demo (owner A).

Run from the repo root:  python backend/synthetic-data/generators/sd03_complaints.py
"""
import sys
from pathlib import Path

import pandas as pd

BACKEND = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BACKEND))

from analytics.intake.reference import client_sender  # noqa: E402

OUT = BACKEND / "synthetic-data" / "out" / "complaints"


def main() -> None:
    complaints = pd.read_csv(BACKEND.parent / "Halcyon-Hackathon-Dataset" / "complaints.csv")
    OUT.mkdir(parents=True, exist_ok=True)
    for c in complaints.itertuples():
        body = (f"Hello,\n\nAbout delivery {c.delivery_id}: {c.text}\n\nCategory: {c.category}\n\n"
                f"-- SYNTHETIC complaint email built from complaints.csv --")
        (OUT / f"{c.complaint_id}.eml").write_text(
            f"From: {client_sender(c.client_id)}\nTo: support@halcyon.example\n"
            f"Subject: [SYNTHETIC] Complaint {c.complaint_id}\nDate: {c.complaint_date} 10:00\nX-Synthetic: true\n\n{body}\n")
    print(f"wrote {len(complaints)} complaint emails to {OUT}")


if __name__ == "__main__":
    main()

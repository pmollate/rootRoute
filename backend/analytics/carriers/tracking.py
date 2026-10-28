"""SD-07 synthetic carrier tracking feeds and adapters (SPEC §5.13, C8).

Each carrier publishes events in its own style: JSON lines (A, B, C), weekly portal HTML pages (D), weekly batch CSV
files (E, F). Adapters normalise all three into one carrier_events table.
"""
import json
import re
from pathlib import Path

import pandas as pd

BACKEND = Path(__file__).resolve().parents[2]
OUT = BACKEND / "synthetic-data" / "out" / "tracking"
API, PORTAL, BATCH = ["A", "B", "C"], ["D"], ["E", "F"]


def events(d: pd.DataFrame) -> pd.DataFrame:
    base = d[["delivery_id", "carrier_id", "shipped_ts", "delivered_date"]]
    parts = [
        base.assign(event="picked_up", ts=base.shipped_ts),
        base.assign(event="in_transit", ts=base.shipped_ts + pd.Timedelta(hours=6)),
        base.assign(event="out_for_delivery", ts=base.delivered_date + pd.Timedelta(hours=8)),
        base.assign(event="delivered", ts=base.delivered_date + pd.Timedelta(hours=14)),
    ]
    out = pd.concat(parts)[["delivery_id", "carrier_id", "event", "ts"]]
    return out.sort_values(["carrier_id", "ts", "delivery_id"]).reset_index(drop=True)


def write_feeds(d: pd.DataFrame, out: Path = OUT) -> Path:
    ev = events(d)
    ev["stamp"] = ev.ts.dt.strftime("%Y-%m-%d %H:%M")
    ev["week"] = ev.ts.dt.strftime("%G-W%V")
    out.mkdir(parents=True, exist_ok=True)
    for c in API:
        with open(out / f"api_{c}.jsonl", "w") as f:
            for r in ev[ev.carrier_id.eq(c)].itertuples():
                f.write(json.dumps({"shipment_ref": r.delivery_id, "status": r.event, "at": r.stamp}) + "\n")
    for c in PORTAL:
        for week, g in ev[ev.carrier_id.eq(c)].groupby("week"):
            rows = "".join(f"<tr><td>{r.delivery_id}</td><td>{r.event.replace('_', ' ').upper()}</td><td>{r.stamp}</td></tr>"
                           for r in g.itertuples())
            (out / f"portal_{c}_{week}.html").write_text(
                f"<html><body><h1>Carrier {c} tracking - SYNTHETIC</h1><table>{rows}</table></body></html>")
    for c in BATCH:
        for week, g in ev[ev.carrier_id.eq(c)].groupby("week"):
            g[["delivery_id", "event", "stamp"]].rename(columns={"delivery_id": "REF", "event": "CODE", "stamp": "TIME"}) \
                .to_csv(out / f"batch_{c}_{week}.csv", index=False)
    return out


ROW = re.compile(r"<tr><td>([^<]+)</td><td>([^<]+)</td><td>([^<]+)</td></tr>")


def read_feeds(out: Path = OUT) -> pd.DataFrame:
    frames = []
    for c in API:
        j = pd.read_json(out / f"api_{c}.jsonl", lines=True, dtype={"at": str})
        frames.append(pd.DataFrame({"delivery_id": j.shipment_ref, "carrier_id": c, "event": j.status,
                                    "ts": j["at"], "source": "api"}))
    for path in sorted(out.glob("portal_*.html")):
        c = path.name.split("_")[1]
        rows = ROW.findall(path.read_text())
        frames.append(pd.DataFrame([{"delivery_id": r[0], "carrier_id": c, "event": r[1].lower().replace(" ", "_"),
                                     "ts": r[2], "source": "portal"} for r in rows]))
    for path in sorted(out.glob("batch_*.csv")):
        c = path.name.split("_")[1]
        b = pd.read_csv(path, dtype=str)
        frames.append(pd.DataFrame({"delivery_id": b.REF, "carrier_id": c, "event": b.CODE, "ts": b.TIME,
                                    "source": "batch"}))
    ev = pd.concat(frames, ignore_index=True)
    ev["ts"] = pd.to_datetime(ev.ts).astype("datetime64[us]")
    ev["synthetic"] = True
    return ev

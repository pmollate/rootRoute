"""Load the supplied dataset and add the cause flags defined in SPEC §5.1."""
from pathlib import Path

import pandas as pd

BACKEND = Path(__file__).resolve().parents[2]
REPO = BACKEND.parent
DATA_DIR = REPO / "Halcyon-Hackathon-Dataset"
DATE_COLS = ["order_received_ts", "shipped_ts", "promised_date", "pick_list_date", "delivered_date"]

# The five root causes (SPEC §5.1). Together they explain every late delivery in the data.
FLAGS = ["f_addr", "f_stock", "f_cutoff", "f_lane", "f_route"]
# Split flag sets used by the area / "as built" scenarios (SPEC §2.4).
AREA_FLAGS = ["f_addr_email", "f_addr_other", "f_cutoff", "f_skip_nearest", "f_stock_out", "f_lane", "f_route"]
PICK_FLAGS = ["f_addr_email", "f_addr_other", "f_cut_early", "f_cut_late", "f_skip_nearest", "f_stock_out", "f_lane", "f_route"]
CUTOFF_HOUR = 8
ROUTE_OVERRUN = 1.20   # no otherwise-clean delivery is late below a 20% overrun
FRIDAY = 4
FRIDAY_CAP_CARRIER = "D"   # the carrier whose Friday volume overloads it (SPEC §5.2)
# Carrier x region lanes that fail on fair data every day of the week (reproduced by analytics/carriers/lanes.py).
BAD_LANES = {("D", "Midwest"), ("D", "Southeast"), ("E", "West"), ("F", "Northeast"), ("F", "Southeast")}


def add_flags(d: pd.DataFrame) -> pd.DataFrame:
    d = d.copy()
    hour = d.order_received_ts.dt.hour
    d["late"] = d.on_time.eq("N")
    d["after_cutoff"] = hour >= CUTOFF_HOUR
    d["route_dev"] = d.actual_route_km / d.planned_route_km
    d["f_addr"] = d.address_status.eq("incomplete")
    d["f_cutoff"] = d.commitment_type.eq("same_day") & d.after_cutoff
    d["f_stock"] = d.fulfilment_warehouse_id.ne(d.nearest_warehouse_id)
    d["f_stock_out"] = d.f_stock & d.nearest_warehouse_had_stock.eq("N")
    d["f_skip_nearest"] = d.f_stock & d.nearest_warehouse_had_stock.eq("Y")
    lane = pd.Series(list(zip(d.carrier_id, d.destination_region)), index=d.index)
    d["f_bad_lane"] = lane.isin(BAD_LANES)
    d["f_d_friday"] = d.carrier_id.eq(FRIDAY_CAP_CARRIER) & d.order_received_ts.dt.day_of_week.eq(FRIDAY)
    d["f_lane"] = d.f_bad_lane | d.f_d_friday
    d["f_route"] = d.route_dev.gt(ROUTE_OVERRUN)  # NaN (missing actual km) -> False
    d["f_addr_email"] = d.f_addr & d.order_channel.eq("Email")
    d["f_addr_other"] = d.f_addr & d.order_channel.ne("Email")
    d["f_cut_early"] = d.f_cutoff & (hour < 11)
    d["f_cut_late"] = d.f_cutoff & (hour >= 11)
    d["fair"] = ~(d.f_addr | d.f_stock | d.f_cutoff)
    return d


def load(data_dir: Path = DATA_DIR) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Return (deliveries with flags and client columns, clients)."""
    d = pd.read_csv(data_dir / "deliveries.csv")
    for col in DATE_COLS:
        d[col] = pd.to_datetime(d[col])
    clients = pd.read_csv(data_dir / "clients.csv")
    d = add_flags(d).merge(clients, on="client_id", how="left")
    return d, clients

# Synthetic data register

The supplied dataset (`Halcyon-Hackathon-Dataset/`) has no stock levels, carrier contracts, tracking feeds or order
emails. Features that need them run on data we generate here. This file is the register for SPEC §12.1.

## Rules

1. **Generated from the supplied data.** Every dataset reuses the real delivery ids, dates, clients, warehouses and
   carriers, so it agrees with the supplied data (for example, stock is zero exactly where a delivery is flagged
   out of stock).
2. **Seeded, one generator per dataset.** Each dataset has one script in `generators/`. Any randomness is seeded, so
   every run gives the same output. Generated files go to `out/` (gitignored) unless noted. Never edit `Halcyon-Hackathon-Dataset/`.
3. **Never in headline figures.** The headline numbers, the replay and the recommendation use supplied data only
   (REQ-REP-04). Every table built from synthetic data has `synthetic = true`, and every screen that shows it carries a
   "Synthetic data" badge (REQ-UI-04).

Run generators from the repo root, for example `python backend/synthetic-data/generators/sd05_stock.py`. Datasets
the pipeline needs (SD-05, SD-06, SD-07) are also built in memory by `npm run pipeline`, so the generator is only
needed to inspect the files.

## Register

| ID | Dataset | Owner | Generator | Status |
|---|---|---|---|---|
| SD-01 | API JSON orders + EDI 850 files | Email (A) | `sd01_orders.py` | Planned (A9) |
| SD-02 | 50 intake fixture emails + gold JSON | Email (A) | `sd02_sd04_intake.py` | Planned (A3) |
| SD-03 | 34 complaint emails | Email (A) | `sd03_complaints.py` | Planned (A10) |
| SD-04 | Client domains, saved addresses | Email (A) | `sd02_sd04_intake.py` | Planned (A2) |
| SD-05 | SKUs, daily stock per warehouse × SKU | Warehouse (B) | `sd05_stock.py` | Built |
| SD-06 | Carrier capacity contracts | Carriers (C) | `sd06_capacity.py` | Built |
| SD-07 | Carrier tracking events (JSON, HTML, CSV) | Carriers (C) | `sd07_tracking.py` | Planned (C6) |
| SD-08 | Mock mailbox + mock WMS form | Email (A) | none (static pages) | Stretch (A12) |
| SD-09 | 10× replica + a second client, for the timed scale run | All (S3) | `sd09_scale.py` | Built |

### SD-01: API JSON orders and EDI 850 files

- **Built from:** real deliveries with `order_channel` API or EDI. Half are incomplete, taken from deliveries where
  `address_status == 'incomplete'`, so the address check has real failures to catch.
- **Used by:** E11, address checks on API and EDI orders (`POST /api/orders`, `POST /api/orders/edi`).
- **Generator:** `python backend/synthetic-data/generators/sd01_orders.py` → `out/api_orders.json`, `out/edi_orders.json`.
- **Replace with (real):** integration logs from the order API and the EDI gateway.

### SD-02: intake fixture emails with gold answers

- **Built from:** real clients and their deliveries; 14 invented email layouts; about 28% have an incomplete address.
  Each email has a gold JSON answer used by the extraction eval.
- **Used by:** E1–E9, the email intake agent and its eval.
- **Generator:** `python backend/synthetic-data/generators/sd02_sd04_intake.py` → `backend/tests/fixtures/emails/NN.eml`
  and `NN.json` (committed, so Node tests and the eval read the same files).
- **Replace with (real):** an export of the order mailbox.

### SD-03: complaint emails

- **Built from:** the 34 real complaints in `complaints.csv` (same ids, clients, deliveries and text), wrapped as emails.
- **Used by:** E12, the complaint triage agent.
- **Generator:** `python backend/synthetic-data/generators/sd03_complaints.py` → `out/complaints/<complaint_id>.eml`.
- **Replace with (real):** the complaint inbox.

### SD-04: client domains and saved addresses

- **Built from:** the real client ids. Email domains (`clientNNN.example`) and US addresses (state, city, ZIP) are
  invented; regions match each client's region in the supplied data.
- **Used by:** E2 (sender to client match) and E4 (address completion from saved addresses).
- **Generator:** `python backend/synthetic-data/generators/sd02_sd04_intake.py` → `out/client_domains.csv`,
  `out/saved_addresses.csv`; loaded into Postgres with `npm run seed`.
- **Replace with (real):** the CRM.

### SD-05: SKUs and daily stock

- **Built from:** the real deliveries. Each delivery gets a SKU; stock per date × warehouse × client × SKU is zero at
  the nearest warehouse exactly on the deliveries where `nearest_warehouse_had_stock == 'N'` (AC-STK-01).
- **Used by:** W5, weekly placement suggestions and their impact (tables `stock_daily`, `placement_suggestions`,
  `placement_impact`; Warehouses screen).
- **Generator:** `python backend/synthetic-data/generators/sd05_stock.py` → `out/stock_daily.csv`. The pipeline
  builds the same table in memory (`analytics/warehouse/stock.py`).
- **Replace with (real):** a WMS inventory extract.

### SD-06: carrier capacity contracts

- **Built from:** observed daily volume per carrier and region on days other than Friday (p95).
- **Used by:** C4 (recommender capacity check) and C10/C11 (capacity and the Friday cap); table `carrier_capacity`.
- **Generator:** `python backend/synthetic-data/generators/sd06_capacity.py` → `out/carrier_capacity.csv`. The
  pipeline builds the same table in memory (`analytics/carriers/capacity.py`).
- **Replace with (real):** procurement's carrier contracts.

### SD-07: carrier tracking events

- **Built from:** the real `shipped_ts`, `delivered_date` and carrier of each delivery. Carriers A–C send JSON lines,
  D a weekly portal HTML page, E–F a weekly CSV.
- **Used by:** C8, tracking adapters and deliveries at risk (table `carrier_events`, `/api/tracking`).
- **Generator:** `python backend/synthetic-data/generators/sd07_tracking.py` → `out/tracking/` (about 15 MB). The
  pipeline also writes the feeds.
- **Replace with (real):** carrier tracking feeds.

### SD-08: mock mailbox and mock WMS form

- **Built from:** nothing; static pages that stand in for Outlook and the WMS order-entry screen.
- **Used by:** E13, the entry bot that keys approved ALL_CLEAR orders (stretch).
- **Generator:** none. The mock WMS form is served by the Next.js app at `/mock-wms.html`.
- **Replace with (real):** Outlook and the WMS.

### SD-09: scale replica and second client

- **Built from:** the supplied dataset. `x10/` is ten copies of every delivery (copies 1–9 get new delivery, order,
  penalty and complaint ids with a `-Rkk` suffix; every other value is unchanged), interleaved by order time with a
  seeded shuffle. `second-client/` is the same deliveries as a made-up "Northwind Freight (synthetic)" would hold them:
  clients `N1001`–`N1280`, carriers ATLAS…FJORD, warehouses DC1–DC5, dates moved 313 weeks earlier (Apr–Sep 2020),
  plus `client_profile.json` with that client's carrier rules. Each folder has `manifest.json` and `SYNTHETIC.txt`.
- **Used by:** the timed scale run only (`npm run bench`, `docs/SCALE-RUN.md`, AC-DATA-23). Never by a screen, the
  headline figures or the replay.
- **Generator:** `python backend/synthetic-data/generators/sd09_scale.py [--factor 10]` → `out/scale/x10/` (about
  80 MB) and `out/scale/second-client/`. `npm run bench` builds them if missing.
- **Replace with (real):** a second client's own extract, mapped onto the same columns.

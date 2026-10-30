"""Timed scale run (SPEC-data-upload AC-DATA-23, NFR-DATA-02; ROADMAP §3-4).

Runs the same steps as `npm run pipeline` (load + the pipeline's STEPS) on a data folder, with no database write unless
--db-url is given, and records wall time and peak memory per step. Each dataset runs in its own Python process, so
the peak resident memory (ru_maxrss) belongs to that dataset only.

Usage (from backend/):
  python -m analytics.bench                       # 1x supplied, 10x synthetic, second client (with and without profile)
  python -m analytics.bench --factor 10 --trace   # also a second pass per dataset with tracemalloc peaks per step
  python -m analytics.bench --db-url URL          # also time the table write, to a THROWAWAY database only
  python -m analytics.bench --one DIR --json OUT  # one dataset, in this process
Datasets and results go to backend/synthetic-data/out/scale/ (gitignored).
"""
import argparse
import json
import os
import platform
import resource
import subprocess
import sys
import time
import tracemalloc
from contextlib import contextmanager
from pathlib import Path

import numpy as np
import pandas as pd

from analytics import scaledata
from analytics.carriers import backtest, tracking
from analytics.core import load as core
from analytics.core.context import Ctx
from analytics.pipeline import STEPS

BACKEND = Path(__file__).resolve().parents[1]
OUT = BACKEND / "synthetic-data" / "out" / "scale"
MB = 2 ** 20
# Golden 1x figures (CLAUDE.md "Key numbers", SPEC §2.2, §2.4). Counts scale with the replica factor; rates do not.
GOLDEN_RATES = {"on_time_pct": 71.0, "as_built_pct": 88.5, "as_built_adopted_pct": 85.9, "adopt_all_pct": 92.0,
                "route_only_pct": 73.6, "lanes_routes_pct": 80.4, "all_but_route_pct": 96.3}
GOLDEN_COUNTS = {"deliveries": 48340, "late": 14019, "penalties_usd": 872460, "handling_usd": 476646}
GOLDEN_POINTS = {"f_lane": 7.6, "f_addr": 7.0, "f_stock": 5.6, "f_cutoff": 5.6, "f_route": 3.2}
POINTS_TOLERANCE = 0.06   # as in test_scenarios: the deck rounds route's 3.15 points up to 3.2


@contextmanager
def client_profile(profile: dict | None):
    """Apply one client's rules (client_profile.json) for the length of a run, then put Halcyon's back.

    Keys left out keep Halcyon's value, so a partial profile shows what each key is for (docs/SCALE-RUN.md)."""
    saved = (core.BAD_LANES, core.FRIDAY_CAP_CARRIER, backtest.SPLIT, tracking.API, tracking.PORTAL, tracking.BATCH)
    profile = profile or {}
    try:
        if "bad_lanes" in profile:
            core.BAD_LANES = {tuple(lane) for lane in profile["bad_lanes"]}
        if "friday_cap_carrier" in profile:
            core.FRIDAY_CAP_CARRIER = profile["friday_cap_carrier"]
        if "backtest_split" in profile:
            backtest.SPLIT = pd.Timestamp(profile["backtest_split"])
        if "tracking_feeds" in profile:
            feeds = profile["tracking_feeds"]
            tracking.API, tracking.PORTAL, tracking.BATCH = feeds["api"], feeds["portal"], feeds["batch"]
        yield
    finally:
        (core.BAD_LANES, core.FRIDAY_CAP_CARRIER, backtest.SPLIT,
         tracking.API, tracking.PORTAL, tracking.BATCH) = saved


def peak_rss_mb() -> float:
    """Peak resident memory of this process so far (ru_maxrss is bytes on macOS, KiB on Linux)."""
    peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return peak / MB if sys.platform == "darwin" else peak / 1024


def input_size(data_dir: Path) -> dict:
    files = sorted(data_dir.glob("*.csv"))
    rows = {f.name: sum(1 for _ in f.open()) - 1 for f in files}
    return {"deliveries_rows": rows["deliveries.csv"],
            "deliveries_mb": round((data_dir / "deliveries.csv").stat().st_size / MB, 1),
            "all_csv_mb": round(sum(f.stat().st_size for f in files) / MB, 1), "rows": rows}


def headline(tables: dict[str, pd.DataFrame]) -> dict:
    kpi = tables["kpis"].set_index("key").value
    sc = tables["scenario_results"]
    sc = sc[sc.segment.eq("all")].set_index("scenario").on_time
    attr = tables["cause_attribution"].set_index("cause").points_lost
    bt = tables["carrier_backtest"].set_index("choice")
    lanes = tables["lane_scores"]
    return {
        "deliveries": int(kpi["deliveries"]), "late": int(kpi["late"]), "on_time_pct": 100 * kpi["on_time"],
        "penalties_usd": int(round(kpi["penalties_usd"])), "handling_usd": int(round(kpi["handling_cost_usd"])),
        "pre_pickup_share_pct": 100 * kpi["pre_pickup_share"],
        **{f"{k}_pct": 100 * sc[k] for k in ["as_built", "as_built_adopted", "adopt_all", "route_only", "lanes_routes",
                                            "all_but_route"]},
        "points_lost": {f: 100 * float(v) for f, v in attr.items()},
        "blocked_lanes": int(lanes.blocked.sum()),
        "backtest_test_n": int(bt.loc["actual", "n"]),
        "backtest_actual_pct": 100 * float(bt.loc["actual", "on_time"]),
        "backtest_recommended_pct": 100 * float(bt.loc["recommended", "on_time"]),
        "carrier_events": len(tables["carrier_events"]),
    }


def checks(h: dict, factor: int) -> list[dict]:
    """Golden-number check: rates equal the 1x figures (to 0.1 point), counts are factor x the 1x figures."""
    out = []
    for k, v in GOLDEN_RATES.items():
        out.append({"check": k, "expected": v, "got": round(h[k], 1), "ok": round(h[k], 1) == v})
    for k, v in GOLDEN_COUNTS.items():
        out.append({"check": k, "expected": v * factor, "got": h[k], "ok": h[k] == v * factor})
    for k, v in GOLDEN_POINTS.items():
        got = round(h["points_lost"].get(k, float("nan")), 2)
        out.append({"check": f"points_lost.{k}", "expected": v, "got": got, "ok": abs(got - v) <= POINTS_TOLERANCE})
    return out


def run_dataset(data_dir: Path, tracking_dir: Path, profile: dict | None | str = "auto", trace: bool = False,
                db_url: str | None = None) -> dict:
    """Run load + every pipeline step on data_dir. profile="auto" reads data_dir/client_profile.json if present."""
    data_dir, tracking_dir = Path(data_dir), Path(tracking_dir)
    if profile == "auto":
        path = data_dir / "client_profile.json"
        profile = json.loads(path.read_text()) if path.exists() else None
    steps: list[dict] = []

    def timed(name, fn):
        if trace:
            tracemalloc.reset_peak()
        started = time.perf_counter()
        result = fn()
        rec = {"step": name, "seconds": round(time.perf_counter() - started, 2), "peak_rss_mb": round(peak_rss_mb())}
        if trace:
            rec["peak_traced_mb"] = round(tracemalloc.get_traced_memory()[1] / MB)
        steps.append(rec)
        return result

    if trace:
        tracemalloc.start()
    try:
        with client_profile(profile):
            d, clients = timed("load", lambda: core.load(data_dir))
            ctx = Ctx(d=d, clients=clients, data_dir=data_dir, tracking_dir=tracking_dir)
            for name, step in STEPS:
                ctx.tables.update(timed(name, lambda step=step: step(ctx)))
            if db_url:
                from analytics.core.db import write_tables
                timed("db_write", lambda: write_tables(ctx.tables, db_url))
    finally:
        if trace:
            tracemalloc.stop()
    return {
        "data_dir": str(data_dir), "profile": (profile or {}).get("client"), "input": input_size(data_dir),
        "steps": steps, "total_seconds": round(sum(s["seconds"] for s in steps), 2), "peak_rss_mb": round(peak_rss_mb()),
        "tables": {name: len(df) for name, df in sorted(ctx.tables.items())},
        "result_rows": int(sum(len(df) for df in ctx.tables.values())),
        "headline": headline(ctx.tables),
    }


def machine() -> dict:
    cpu, ram = platform.processor(), None
    if sys.platform == "darwin":
        cpu = subprocess.run(["sysctl", "-n", "machdep.cpu.brand_string"], capture_output=True, text=True).stdout.strip()
        ram = int(subprocess.run(["sysctl", "-n", "hw.memsize"], capture_output=True, text=True).stdout)
    elif hasattr(os, "sysconf"):
        ram = os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES")
    return {"os": platform.platform(), "cpu": cpu, "cores": os.cpu_count(), "ram_gb": round(ram / 2 ** 30) if ram else None,
            "python": platform.python_version(), "pandas": pd.__version__, "numpy": np.__version__}


def _one_in_subprocess(name: str, data_dir: Path, args, no_profile: bool = False, trace: bool = False) -> dict:
    out = OUT / "results" / f"{name}{'-trace' if trace else ''}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    cmd = [sys.executable, "-m", "analytics.bench", "--one", str(data_dir), "--json", str(out),
           "--tracking-dir", str(OUT / "tracking" / name)]
    cmd += ["--no-profile"] if no_profile else []
    cmd += ["--trace"] if trace else []
    cmd += ["--db-url", args.db_url] if args.db_url and not trace else []
    started = time.perf_counter()
    p = subprocess.run(cmd, cwd=BACKEND, capture_output=True, text=True)
    if p.returncode != 0:
        err = (p.stderr.strip().splitlines() or ["(no output)"])[-1]
        return {"name": name, "error": err, "seconds_to_failure": round(time.perf_counter() - started, 1)}
    return {"name": name, **json.loads(out.read_text())}


APP_DATABASES = {"latelens", "latelens_test"}


def throwaway(url: str) -> bool:
    """The bench's write replaces whole tables, so it may only target a database the app does not use."""
    app_urls = {os.environ.get("DATABASE_URL"), os.environ.get("TEST_DATABASE_URL")} - {None, ""}
    name = url.rsplit("/", 1)[-1].split("?", 1)[0]
    return url not in app_urls and name not in APP_DATABASES


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--factor", type=int, default=10)
    ap.add_argument("--trace", action="store_true", help="add a tracemalloc pass (slower) for per-step peaks")
    ap.add_argument("--db-url", help="also time the table write; a THROWAWAY database, never the app's")
    ap.add_argument("--one", type=Path, help="run one data folder in this process")
    ap.add_argument("--json", type=Path)
    ap.add_argument("--tracking-dir", type=Path)
    ap.add_argument("--no-profile", action="store_true")
    args = ap.parse_args()
    if args.db_url and not throwaway(args.db_url):
        ap.error("--db-url must not be the app's database (latelens, latelens_test, DATABASE_URL, TEST_DATABASE_URL)")

    if args.one:
        r = run_dataset(args.one, args.tracking_dir or OUT / "tracking" / args.one.name,
                        profile=None if args.no_profile else "auto", trace=args.trace, db_url=args.db_url)
        if args.json:
            args.json.write_text(json.dumps(r, indent=2) + "\n")
        print(json.dumps(r["steps"]))
        return

    x = OUT / f"x{args.factor}"
    second = OUT / "second-client"
    if not (x / "manifest.json").exists():
        scaledata.write_replica(core.DATA_DIR, x, args.factor)
    if not (second / "manifest.json").exists():
        scaledata.write_second_client(core.DATA_DIR, second)
    runs = [("x1", core.DATA_DIR, 1, False), (f"x{args.factor}", x, args.factor, False),
            ("second-client", second, 1, False), ("second-client-no-profile", second, 1, True)]
    results = {"machine": machine(), "date": time.strftime("%Y-%m-%d %H:%M"), "runs": []}
    for name, folder, factor, no_profile in runs:
        print(f"running {name} ...", flush=True)
        r = _one_in_subprocess(name, folder, args, no_profile=no_profile)
        if "headline" in r:
            r["checks"] = checks(r["headline"], factor)
        if args.trace and "headline" in r:
            t = _one_in_subprocess(name, folder, args, no_profile=no_profile, trace=True)
            r["traced_steps"] = t.get("steps")
        results["runs"].append(r)
        print(summary_line(r), flush=True)
    path = OUT / "results.json"
    path.write_text(json.dumps(results, indent=2) + "\n")
    print(f"wrote {path}")


def summary_line(r: dict) -> str:
    if "error" in r:
        return f"  {r['name']}: FAILED after {r['seconds_to_failure']}s: {r['error']}"
    steps = " ".join(f"{s['step']}={s['seconds']}s" for s in r["steps"])
    failed = [c["check"] for c in r["checks"] if not c["ok"]]
    return (f"  {r['name']}: {r['input']['deliveries_rows']:,} rows, {r['input']['deliveries_mb']} MB, "
            f"{r['total_seconds']}s total ({steps}), peak RSS {r['peak_rss_mb']} MB, "
            f"golden checks {'all pass' if not failed else 'FAIL: ' + ', '.join(failed)}")


if __name__ == "__main__":
    main()

from analytics.pipeline import run

CONTRACT_TABLES = {
    "deliveries_clean", "clients", "carriers", "warehouses", "delivery_causes", "dq_report", "kpis", "cause_summary",
    "accounts", "scenario_results", "scenario_breakdown",
    "cause_attribution", "cause_kpis", "warehouse_region_distance", "client_region_nearest", "warehouse_stats",
    "penalty_reconciliation", "stock_daily", "placement_suggestions", "placement_impact", "lane_scores",
    "carrier_capacity", "carrier_backtest", "carrier_events", "route_overruns", "route_demo", "complaints", "risk_lookup",
}


def test_pipeline_builds_every_contract_table():
    """CONTRACTS §4: the pipeline writes every contract table, none empty."""
    tables = run()
    assert set(tables) == CONTRACT_TABLES
    assert all(len(df) > 0 for df in tables.values())
    assert list(tables["delivery_causes"].columns)[:2] == ["delivery_id", "client_id"]

from analytics.pipeline import run


def test_pipeline_runs_and_returns_tables():
    tables = run()
    assert "clients" in tables and len(tables["clients"]) == 280

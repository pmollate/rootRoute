def test_ac_diag_01_flag_counts(d):
    """AC-DIAG-01"""
    expected = {"f_addr": 5994, "f_cutoff": 4826, "f_stock": 6700, "f_stock_out": 6009, "f_skip_nearest": 691,
                "f_lane": 10030, "f_bad_lane": 7895, "f_d_friday": 4333, "f_route": 2880, "fair": 32045}
    assert len(d) == 48340
    assert {k: int(d[k].sum()) for k in expected} == expected


def test_ac_diag_01_five_causes_explain_every_late_delivery(d):
    """AC-DIAG-01"""
    from analytics.core.load import FLAGS
    assert d[~d[FLAGS].any(axis=1)].late.sum() == 0


def test_cause_rules_come_from_config(tmp_path):
    """ROADMAP L1: a client's rules file (ANALYTICS_RULES) replaces the defaults without a code change."""
    import json
    import os
    import subprocess
    import sys

    from analytics.core.load import BACKEND, RULES
    rules = {**RULES, "cutoff_hour": 9, "bad_lanes": [["A", "West"]]}
    path = tmp_path / "rules.json"
    path.write_text(json.dumps(rules))
    out = subprocess.run([sys.executable, "-c", "from analytics.core import load; print(load.CUTOFF_HOUR, load.BAD_LANES)"],
                         cwd=BACKEND, env={**os.environ, "ANALYTICS_RULES": str(path)}, capture_output=True, text=True, check=True)
    assert out.stdout.strip() == "9 {('A', 'West')}"

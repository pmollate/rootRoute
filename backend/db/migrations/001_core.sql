-- Owner B. Node-owned core tables. Python-owned tables are created by analytics/pipeline.py (CONTRACTS §4).
CREATE TABLE audit_log (
  id serial PRIMARY KEY,
  actor text NOT NULL,
  action text NOT NULL,
  ref text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

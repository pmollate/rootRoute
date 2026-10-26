-- Owner C. Carrier recommendation log and operator overrides (CONTRACTS §5).
CREATE TABLE recommendations (
  id serial PRIMARY KEY,
  order_ref text,
  region text NOT NULL,
  commitment text NOT NULL,
  carrier text NOT NULL,
  backup text NOT NULL,
  reason text NOT NULL,
  for_date text NOT NULL,                -- "YYYY-MM-DD", used for daily capacity counts
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recommendations_day ON recommendations (for_date, region, carrier);

CREATE TABLE override_log (
  id serial PRIMARY KEY,
  order_ref text NOT NULL,
  from_carrier text NOT NULL,
  to_carrier text NOT NULL,
  reason text NOT NULL,
  user_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

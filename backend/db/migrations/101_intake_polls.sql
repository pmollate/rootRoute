-- Owner A. One row per Gmail check: the scheduled poll every INTAKE_POLL_MINUTES, or the "Fetch from Gmail" button
-- (SPEC §5.3 E15, REQ-INT-08). The next poll asks Gmail for mail after the last successful one, less a 2-minute overlap.
CREATE TABLE intake_polls (
  id serial PRIMARY KEY,
  trigger text NOT NULL,                 -- schedule | button
  query text NOT NULL,                   -- the Gmail search used
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  fetched int NOT NULL DEFAULT 0,        -- messages Gmail returned
  processed int NOT NULL DEFAULT 0,      -- of those, new or retried emails run through the pipeline
  retried int NOT NULL DEFAULT 0,        -- emails waiting for the AI services, run again
  failed int NOT NULL DEFAULT 0,
  ok boolean,                            -- null while running; false keeps the window open for the next poll
  error text
);
CREATE INDEX intake_polls_ok ON intake_polls (ok, started_at);

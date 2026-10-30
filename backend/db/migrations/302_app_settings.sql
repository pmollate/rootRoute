-- Owner C. App-wide switches an admin sets (design docs/superpowers/specs/2026-10-30-order-journey-auto-advance-design.md §4).
-- Writer: modules/settings only. No row means the setting is off.
CREATE TABLE app_settings (
  key text PRIMARY KEY,                       -- 'auto_advance'
  value jsonb NOT NULL,                       -- auto_advance: true | false
  updated_by text NOT NULL,                   -- user id from the session (REQ-AUTH-07)
  updated_at timestamptz NOT NULL DEFAULT now()
);

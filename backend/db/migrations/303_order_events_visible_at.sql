-- Owner C. When an order event shows in the journey (design docs/superpowers/specs/2026-10-30-order-journey-auto-advance-design.md §7).
-- Auto-advance sets it a few seconds apart; every other writer leaves the default, so its events show at once as before.
ALTER TABLE order_events ADD COLUMN visible_at timestamptz NOT NULL DEFAULT now();

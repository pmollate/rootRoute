-- Owner C. Order journey events for new orders (D9; design docs/superpowers/specs/2026-10-30-order-journey-simulator-design.md §7).
-- Writer: modules/carriers recordOrderEvent only. The WMS and carriers are simulated, so every row is synthetic.
CREATE TABLE order_events (
  id serial PRIMARY KEY,
  order_ref text NOT NULL,               -- "email:<id>"
  event text NOT NULL CHECK (event IN ('wms_entered', 'picked', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered')),
  ts timestamp NOT NULL,                 -- local time, no zone ("YYYY-MM-DD HH:mm" in the API)
  detail jsonb NOT NULL DEFAULT '{}',    -- wms_entered: { wmsOrderId }
  synthetic boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_ref, event)
);

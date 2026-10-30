-- Owner A. E19 one-time address link (SPEC §5.17, CONTRACTS §5). After submission; CONFIRM_LINK defaults to off.
-- Numbered 103 because 102 is client_emails. The token itself is never stored: only its SHA-256 hex (SEC-LINK-01).
CREATE TABLE address_confirm_tokens (
  id serial PRIMARY KEY,
  token_hash char(64) NOT NULL UNIQUE,
  email_id int NOT NULL REFERENCES intake_emails (id),  -- the email the CONFIRM_ADDRESS reply was sent for (REQ-LINK-08)
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,                      -- SPEC §5.17 lifetime, computed on instants (SEC-LINK-02)
  issued_by text NOT NULL,                              -- the operator's sub who sent the reply
  used_at timestamptz,
  revoked_at timestamptz,
  prefill jsonb NOT NULL,                               -- { address, pin } shown on the page
  confirmed_address jsonb,                              -- LinkAddress, set on confirmation
  lat double precision,                                 -- the confirmed pin
  lon double precision,
  map_reading jsonb,                                    -- the reverse-geocoded reading shown at the second Confirm
  map_lookups int NOT NULL DEFAULT 0,                   -- capped at 20 (SEC-LINK-04)
  synthetic boolean NOT NULL
);
CREATE INDEX address_confirm_tokens_live ON address_confirm_tokens (email_id) WHERE used_at IS NULL AND revoked_at IS NULL;

-- The seed owns only source = 'seed' rows; a source = 'link' row is written only when the order is approved (REQ-LINK-05).
ALTER TABLE saved_addresses
  ADD COLUMN source text NOT NULL DEFAULT 'seed' CHECK (source IN ('seed', 'link')),
  ADD COLUMN lat double precision,
  ADD COLUMN lon double precision,
  -- the order whose approval saved it. No foreign key on purpose: TRUNCATE intake_emails ... CASCADE (a demo or test
  -- reset) would otherwise empty every client's saved addresses, seed rows included.
  ADD COLUMN email_id int,
  ADD COLUMN confirmed_at timestamptz;                  -- when the client confirmed it

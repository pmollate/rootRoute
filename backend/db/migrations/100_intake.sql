-- Owner A. Intake tables (CONTRACTS §5).
CREATE TABLE client_domains (
  domain text PRIMARY KEY,
  client_id text NOT NULL
);

CREATE TABLE saved_addresses (
  id serial PRIMARY KEY,
  client_id text NOT NULL,
  label text NOT NULL,
  line1 text NOT NULL,
  line2 text,
  city text NOT NULL,
  state text NOT NULL,
  zip text NOT NULL,
  synthetic boolean NOT NULL DEFAULT true
);
CREATE INDEX saved_addresses_client ON saved_addresses (client_id);

CREATE TABLE intake_emails (
  id serial PRIMARY KEY,
  source text NOT NULL DEFAULT 'gmail',  -- gmail | paste
  gmail_id text UNIQUE,                  -- null for pasted emails; dedupe key for Gmail fetches
  thread_id text,
  message_id text,                       -- RFC 822 Message-ID; client replies point at our reply's id
  from_addr text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  redacted_body text,                    -- what the AI model saw: PII replaced by tags
  pii_map jsonb,                         -- tag -> original value, to put names back into an approved reply
  received_at text NOT NULL,             -- local "YYYY-MM-DD HH:mm"
  in_reply_to int REFERENCES intake_emails (id),
  hash text NOT NULL UNIQUE,
  client_id text,
  status text NOT NULL,                  -- RECEIVED | AWAITING_APPROVAL | APPROVED | SENT | ENTERED
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE intake_extractions (
  id serial PRIMARY KEY,
  email_id int NOT NULL REFERENCES intake_emails (id),
  extraction jsonb,                      -- null when extraction failed
  decision text NOT NULL,                -- ALL_CLEAR | CONFIRM_ADDRESS | MISSING_INFO
  checks jsonb NOT NULL,                 -- { address, validation, promise, warehouse, carrier }
  reply_draft text NOT NULL,
  reply_source text NOT NULL,            -- model | template
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE outbound_messages (
  id serial PRIMARY KEY,
  email_id int NOT NULL REFERENCES intake_emails (id),
  to_addr text NOT NULL,
  body text NOT NULL,
  gmail_id text,                         -- id of the sent Gmail message
  status text NOT NULL,                  -- sent | refused
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE inbound_orders (
  id serial PRIMARY KEY,
  channel text NOT NULL,                 -- API | EDI
  order_ref text NOT NULL,
  client_id text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL,                  -- accepted | held
  missing jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE alerts (
  id serial PRIMARY KEY,
  order_ref text NOT NULL,
  risk double precision NOT NULL,
  type text NOT NULL,                    -- delay
  draft text NOT NULL,
  status text NOT NULL DEFAULT 'AWAITING_APPROVAL',
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE complaint_triage (
  id serial PRIMARY KEY,
  complaint_id text NOT NULL,
  delivery_id text NOT NULL,
  stages jsonb NOT NULL,
  escalate boolean NOT NULL,
  draft text NOT NULL,
  draft_source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

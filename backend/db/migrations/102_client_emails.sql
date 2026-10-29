-- Owner A. Test senders registered by full address, for mailboxes on a shared domain such as gmail.com where a
-- client_domains row would make every sender at that domain a known client (SPEC §5.3 E16). The address is checked
-- first, then the domain. Loaded by `npm run seed` from synthetic-data/out/client_emails.csv (gitignored, optional).
CREATE TABLE client_emails (
  email text PRIMARY KEY,                -- lower case
  client_id text NOT NULL
);

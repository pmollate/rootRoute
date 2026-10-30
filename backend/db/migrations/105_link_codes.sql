-- Owner A. E19 verification code (SPEC §5.17 "Verification code", REQ-LINK-17 to -19, SEC-LINK-12). Numbered 105
-- because 104 is reserved for sku_catalog. Only SHA-256 hashes are kept: never the code or the verification token.
ALTER TABLE address_confirm_tokens
  ADD COLUMN code_hash char(64),                        -- SHA-256 of '<token_hash>:<code>', the current code
  ADD COLUMN code_sent_at timestamptz,                  -- when the current code went (60 s between codes)
  ADD COLUMN code_expires_at timestamptz,               -- 10 minutes after sending
  ADD COLUMN codes_sent int NOT NULL DEFAULT 0,         -- at most 3 per link
  ADD COLUMN code_tries int NOT NULL DEFAULT 0,         -- entries on the current code; 5 wrong lock it
  ADD COLUMN verify_hash char(64),                      -- SHA-256 of the verification token (x-link-verify)
  ADD COLUMN verified_at timestamptz;

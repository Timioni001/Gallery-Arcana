-- Durable state for the Zallet testnet adapter. Observations are a scanned
-- snapshot of wallet-visible transactions; submissions record every send
-- before it reaches the wallet so a lost response is never resubmitted.
CREATE TABLE zallet_transactions (
  txid text PRIMARY KEY CHECK (txid ~ '^[a-f0-9]{64}$'),
  status text NOT NULL,
  confirmations integer NOT NULL,
  blockhash text,
  present boolean NOT NULL DEFAULT true,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  viewed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE zallet_observations (
  output_id text PRIMARY KEY,
  txid text NOT NULL REFERENCES zallet_transactions(txid),
  address text NOT NULL,
  memo text,
  zat bigint NOT NULL CHECK (zat > 0),
  shielded boolean NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX zallet_observations_address ON zallet_observations(address);
CREATE TABLE zallet_scan_state (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  tip_height integer NOT NULL,
  tip_hash text NOT NULL,
  scanned_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE zallet_submissions (
  idempotency_key text PRIMARY KEY,
  to_address text NOT NULL,
  zat bigint NOT NULL CHECK (zat > 0),
  state text NOT NULL CHECK (state IN ('submitting','submitted','sent','rejected','failed','unbroadcast')),
  operation_id text UNIQUE,
  txids text[],
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

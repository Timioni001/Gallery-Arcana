-- Gallery Arcana V2. Fresh installation schema; do not apply over V1 data.
-- Every trade is private to its participants. The database is trusted with offer prices
-- and temporary payment/order data; it is NOT a zero-knowledge orderbook.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL
);
INSERT INTO settings VALUES
  ('reservation_minutes','15'),
  ('payment_window_minutes','20'),
  ('dispute_days','30'),
  ('platform_cut_bps','0');

CREATE TABLE accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alias text NOT NULL UNIQUE CHECK (alias = lower(alias)),
  pass_hash text NOT NULL,
  payout_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (
  token_hash bytea PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);

CREATE TABLE uploaded_assets (
  key text PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES accounts(id),
  kind text NOT NULL CHECK (kind IN ('previews','private')),
  original_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES accounts(id),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL CHECK (category IN ('digital','collectible','onchain','other')),
  visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','unlisted')),
  delivery text NOT NULL DEFAULT 'download' CHECK (delivery IN ('download','manual','external')),
  preview_key text,
  file_key text,
  file_name text,
  asset_reference text,
  price_usd_cents integer NOT NULL CHECK (price_usd_cents > 0),
  status text NOT NULL DEFAULT 'live' CHECK (status IN ('live','reserved','sold','paused')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (delivery <> 'download' OR file_key IS NOT NULL)
);
CREATE INDEX listings_public_idx ON listings(created_at DESC)
  WHERE visibility = 'public' AND status = 'live';

-- Amounts and participants are never exposed by any public endpoint.
CREATE TABLE offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES listings(id),
  buyer_id uuid NOT NULL REFERENCES accounts(id),
  amount_usd_cents integer NOT NULL CHECK (amount_usd_cents > 0),
  counter_usd_cents integer CHECK (counter_usd_cents > 0),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','countered','accepted','declined','withdrawn','completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX offers_by_buyer ON offers(buyer_id,created_at DESC);
CREATE INDEX offers_by_listing ON offers(listing_id,created_at DESC);

-- Addresses are created by the isolated worker, claimed by the API once.
CREATE TABLE address_pool (
  address text PRIMARY KEY,
  claimed boolean NOT NULL DEFAULT false,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX addresses_free ON address_pool(created_at) WHERE NOT claimed;

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  address text NOT NULL UNIQUE,
  memo_code text NOT NULL UNIQUE,
  usd_cents integer NOT NULL,
  rate_micro_usd bigint NOT NULL,
  expected_zat bigint NOT NULL,
  received_zat bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','expired','late')),
  txid text,
  confirmations integer NOT NULL DEFAULT 0,
  ref_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payments_pending ON payments(created_at) WHERE status IN ('pending','expired');

CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES listings(id),
  buyer_id uuid REFERENCES accounts(id),
  offer_id uuid REFERENCES offers(id),
  payment_id uuid REFERENCES payments(id),
  price_usd_cents integer NOT NULL,
  payout_address text NOT NULL,
  receipt_hash bytea NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'awaiting_payment'
    CHECK (status IN ('awaiting_payment','paid','expired','refund_due','refund_queued')),
  expires_at timestamptz NOT NULL,
  paid_at timestamptz,
  scrubbed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_pending_order_per_listing ON orders(listing_id)
  WHERE status='awaiting_payment';

-- Sending is a manually reconciled state. Unknown wallet outcomes must NOT be automatically retried.
CREATE TABLE payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('seller_sale','buyer_refund')),
  to_address text NOT NULL,
  zat bigint NOT NULL CHECK (zat > 0),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','sending','sent','failed')),
  txid text,
  attempts integer NOT NULL DEFAULT 0,
  ref_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX payouts_no_duplicate_sale ON payouts(kind,ref_id) WHERE ref_id IS NOT NULL;
CREATE INDEX payouts_queue ON payouts(created_at) WHERE status='queued';

ALTER TABLE sessions ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE sessions ADD COLUMN absolute_expires_at timestamptz NOT NULL DEFAULT now()+interval '90 days';
ALTER TABLE listings ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK (revision>0);
ALTER TABLE offers ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK (revision>0);
ALTER TABLE offers ADD COLUMN listing_revision integer NOT NULL DEFAULT 1;
UPDATE offers o SET listing_revision=l.revision FROM listings l WHERE l.id=o.listing_id;
CREATE UNIQUE INDEX one_active_offer_per_buyer ON offers(listing_id,buyer_id)
  WHERE status IN ('open','countered','accepted');
CREATE UNIQUE INDEX uploaded_assets_owner_key ON uploaded_assets(key,owner_id);
ALTER TABLE listings ADD CONSTRAINT listing_private_owner FOREIGN KEY(file_key,seller_id) REFERENCES uploaded_assets(key,owner_id);
ALTER TABLE listings ADD CONSTRAINT listing_preview_owner FOREIGN KEY(preview_key,seller_id) REFERENCES uploaded_assets(key,owner_id);
ALTER TABLE listings ADD CONSTRAINT listing_private_key CHECK(file_key IS NULL OR file_key ~ '^[a-f0-9]{32}\.bin$');
ALTER TABLE listings ADD CONSTRAINT listing_preview_key CHECK(preview_key IS NULL OR preview_key ~ '^[a-f0-9]{32}\.(png|jpg|webp)$');
ALTER TABLE orders ADD COLUMN file_key text;
ALTER TABLE orders ADD COLUMN file_name text;
ALTER TABLE orders ADD COLUMN title text;
UPDATE orders o SET file_key=l.file_key,file_name=l.file_name,title=l.title FROM listings l WHERE o.listing_id=l.id;
ALTER TABLE orders ADD COLUMN refund_zat bigint NOT NULL DEFAULT 0 CHECK(refund_zat>=0);
ALTER TABLE orders ADD COLUMN refund_status text NOT NULL DEFAULT 'none' CHECK(refund_status IN ('none','due','queued','sent','review'));
UPDATE orders o SET refund_zat=p.received_zat,refund_status=CASE WHEN o.status='refund_queued' THEN 'queued' ELSE 'due' END
  FROM payments p WHERE o.payment_id=p.id AND o.status IN ('refund_due','refund_queued');
ALTER TABLE orders DROP CONSTRAINT orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK(status IN ('awaiting_payment','paid','expired','refund_due','refund_queued','payment_review'));
CREATE UNIQUE INDEX one_completed_sale ON orders(listing_id) WHERE status IN ('paid','payment_review');
ALTER TABLE payments DROP CONSTRAINT payments_status_check;
ALTER TABLE payments ADD CONSTRAINT payments_status_check CHECK(status IN ('pending','confirmed','expired','late','review'));
ALTER TABLE payments ADD CONSTRAINT payment_amounts CHECK(expected_zat>0 AND received_zat>=0 AND confirmations>=0 AND rate_micro_usd>0);
ALTER TABLE payments ADD COLUMN last_scanned_at timestamptz;
ALTER TABLE payments ADD COLUMN scrubbed_at timestamptz;
CREATE TABLE payment_notes (
  output_id text PRIMARY KEY,
  payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  txid text NOT NULL,
  address text NOT NULL,
  memo text NOT NULL,
  zat bigint NOT NULL CHECK(zat>0),
  confirmations integer NOT NULL CHECK(confirmations>=0),
  canonical boolean NOT NULL DEFAULT true,
  observed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notes_by_payment ON payment_notes(payment_id);
ALTER TABLE payouts DROP CONSTRAINT payouts_status_check;
ALTER TABLE payouts ADD CONSTRAINT payouts_status_check CHECK(status IN ('queued','sending','sent','failed','cancelled'));
ALTER TABLE payouts ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE payouts ADD COLUMN failure_code text;
CREATE TABLE rate_limits (
  key_hash bytea PRIMARY KEY,
  hits integer NOT NULL CHECK(hits>0),
  reset_at timestamptz NOT NULL
);
CREATE TABLE worker_health (
  name text PRIMARY KEY,
  ready boolean NOT NULL,
  heartbeat_at timestamptz NOT NULL DEFAULT now()
);
-- Mock-only durable simulator data. These tables never represent blockchain evidence.
CREATE TABLE mock_addresses(address text PRIMARY KEY);
CREATE TABLE mock_notes (
  output_id text PRIMARY KEY,
  txid text NOT NULL,
  address text NOT NULL REFERENCES mock_addresses(address),
  zat bigint NOT NULL CHECK(zat>0),
  memo text,
  confirmations integer NOT NULL CHECK(confirmations>=0),
  canonical boolean NOT NULL DEFAULT true
);
CREATE TABLE mock_sends (
  idempotency_key text PRIMARY KEY,
  txid text NOT NULL UNIQUE,
  to_address text NOT NULL,
  zat bigint NOT NULL CHECK(zat>0)
);

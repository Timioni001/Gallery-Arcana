ALTER TABLE uploaded_assets ADD COLUMN file_sha256 text CHECK(file_sha256 ~ '^[a-f0-9]{64}$');
ALTER TABLE listings ADD COLUMN file_sha256 text CHECK(file_sha256 ~ '^[a-f0-9]{64}$');
ALTER TABLE orders ADD COLUMN file_sha256 text CHECK(file_sha256 ~ '^[a-f0-9]{64}$');
-- Preserve terms of pre-upgrade orders. All new checkouts require buyer acceptance.
ALTER TABLE orders ADD COLUMN acquisition_version smallint NOT NULL DEFAULT 0 CHECK(acquisition_version IN (0,1));
ALTER TABLE orders ALTER COLUMN acquisition_version SET DEFAULT 1;
ALTER TABLE orders ADD CONSTRAINT acquisition_fingerprint CHECK(acquisition_version=0 OR file_sha256 IS NOT NULL);
ALTER TABLE orders ADD COLUMN funded_at timestamptz;
ALTER TABLE orders ADD COLUMN file_first_accessed_at timestamptz;
ALTER TABLE orders ADD COLUMN delivery_confirmed_at timestamptz;
ALTER TABLE orders ADD COLUMN disputed_at timestamptz;
ALTER TABLE orders ADD COLUMN dispute_reason text CHECK(length(dispute_reason)<=2000);
ALTER TABLE orders ADD COLUMN resolved_at timestamptz;
ALTER TABLE orders ADD COLUMN proof jsonb;
ALTER TABLE orders DROP CONSTRAINT orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK(status IN
 ('awaiting_payment','funded','disputed','paid','expired','refund_due','refund_queued','payment_review'));
DROP INDEX one_completed_sale;
CREATE UNIQUE INDEX one_completed_sale ON orders(listing_id) WHERE status IN ('funded','disputed','paid','payment_review');
CREATE TABLE acquisition_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('buyer_accepted','buyer_disputed','operator_release','operator_refund')),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(order_id,kind)
);
CREATE INDEX acquisition_events_by_order ON acquisition_events(order_id,created_at);

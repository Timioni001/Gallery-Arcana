-- A single-use invoice and receipt cannot be attached to more than one order.
ALTER TABLE payments ADD CONSTRAINT one_invoice_per_order UNIQUE(ref_id);
ALTER TABLE orders ADD CONSTRAINT one_order_per_invoice UNIQUE(payment_id);
ALTER TABLE sessions ADD CONSTRAINT session_hash_length CHECK(octet_length(token_hash)=32);
ALTER TABLE orders ADD CONSTRAINT receipt_hash_length CHECK(octet_length(receipt_hash)=32);
ALTER TABLE offers ADD CONSTRAINT counter_requires_amount CHECK(status<>'countered' OR counter_usd_cents IS NOT NULL);
ALTER TABLE payouts ADD CONSTRAINT payout_attempts_nonnegative CHECK(attempts>=0);
ALTER TABLE accounts ADD CONSTRAINT alias_shape CHECK(alias ~ '^[a-z][a-z0-9_-]{2,23}$');

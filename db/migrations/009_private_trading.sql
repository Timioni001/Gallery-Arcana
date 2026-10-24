ALTER TABLE listings ADD COLUMN invitation_only boolean NOT NULL DEFAULT false;
CREATE TABLE sale_invitations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),listing_id uuid NOT NULL REFERENCES listings(id),seller_id uuid NOT NULL REFERENCES accounts(id),buyer_id uuid REFERENCES accounts(id),
 listing_revision integer NOT NULL,price_usd_cents integer NOT NULL CHECK(price_usd_cents BETWEEN 50 AND 100000000),offer_id uuid REFERENCES offers(id),
 capability_hash bytea NOT NULL CHECK(octet_length(capability_hash)=32),expires_at timestamptz NOT NULL,revoked_at timestamptz,redeemed_order_id uuid UNIQUE REFERENCES orders(id),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE attestation_issuers (
 id text PRIMARY KEY CHECK(id ~ '^[a-f0-9]{64}$'),public_key text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),revoked_at timestamptz
);
CREATE TABLE trade_passports (
 id uuid PRIMARY KEY,account_id uuid NOT NULL REFERENCES accounts(id),source_order_id uuid REFERENCES orders(id),issuer_id text NOT NULL REFERENCES attestation_issuers(id),
 proof jsonb NOT NULL,expires_at timestamptz NOT NULL,revoked_at timestamptz,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX invitation_expiry ON sale_invitations(expires_at);
CREATE INDEX passport_by_account ON trade_passports(account_id,expires_at);
CREATE INDEX passport_by_source ON trade_passports(source_order_id);
CREATE INDEX passport_expiry ON trade_passports(expires_at);

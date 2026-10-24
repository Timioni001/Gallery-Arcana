ALTER TABLE accounts ADD COLUMN encryption_epoch integer NOT NULL DEFAULT 0 CHECK(encryption_epoch>=0);
CREATE TABLE encryption_identities (
 id uuid PRIMARY KEY,account_id uuid NOT NULL REFERENCES accounts(id),epoch integer NOT NULL,
 public_identity jsonb NOT NULL,binding jsonb NOT NULL,revision integer NOT NULL CHECK(revision>0),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),revoked_at timestamptz,UNIQUE(account_id,revision)
);
CREATE UNIQUE INDEX one_current_identity ON encryption_identities(account_id) WHERE revoked_at IS NULL;
CREATE TABLE identity_challenges (
 id uuid PRIMARY KEY,account_id uuid NOT NULL REFERENCES accounts(id),epoch integer NOT NULL,current_id uuid REFERENCES encryption_identities(id),
 proposed jsonb NOT NULL,statement text NOT NULL,secret_hash bytea NOT NULL,expires_at timestamptz NOT NULL
);
ALTER TABLE uploaded_assets ADD COLUMN crypto_mode text NOT NULL DEFAULT 'server' CHECK(crypto_mode IN ('server','capsule-v1'));
ALTER TABLE uploaded_assets ADD COLUMN capsule_id uuid;
ALTER TABLE listings ADD COLUMN crypto_mode text NOT NULL DEFAULT 'server' CHECK(crypto_mode IN ('server','capsule-v1'));
ALTER TABLE listings ADD COLUMN capsule_id uuid;
ALTER TABLE orders ADD COLUMN crypto_mode text NOT NULL DEFAULT 'server' CHECK(crypto_mode IN ('server','capsule-v1'));
CREATE TABLE capsule_envelopes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),listing_id uuid NOT NULL REFERENCES listings(id),listing_revision integer NOT NULL,
 buyer_id uuid NOT NULL REFERENCES accounts(id),sender_key_id uuid NOT NULL REFERENCES encryption_identities(id),recipient_key_id uuid NOT NULL REFERENCES encryption_identities(id),
 envelope jsonb NOT NULL,expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(listing_id,buyer_id,listing_revision,recipient_key_id)
);
ALTER TABLE orders ADD COLUMN capsule_envelope_id uuid REFERENCES capsule_envelopes(id);
CREATE TABLE conversations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),listing_id uuid NOT NULL REFERENCES listings(id),buyer_id uuid NOT NULL REFERENCES accounts(id),seller_id uuid NOT NULL REFERENCES accounts(id),
 buyer_key_id uuid NOT NULL REFERENCES encryption_identities(id),seller_key_id uuid NOT NULL REFERENCES encryption_identities(id),
 expires_at timestamptz NOT NULL,closed_at timestamptz,sequence integer NOT NULL DEFAULT 0 CHECK(sequence BETWEEN 0 AND 500),created_at timestamptz NOT NULL DEFAULT now(),CHECK(buyer_id<>seller_id)
);
CREATE TABLE encrypted_messages (
 id uuid PRIMARY KEY,conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,sender_id uuid NOT NULL REFERENCES accounts(id),
 sequence integer NOT NULL,buyer_envelope jsonb NOT NULL,seller_envelope jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(conversation_id,sequence)
);
CREATE TABLE dispute_reviewers (
 order_id uuid PRIMARY KEY REFERENCES orders(id),reviewer_id uuid NOT NULL REFERENCES accounts(id),reviewer_key_id uuid NOT NULL REFERENCES encryption_identities(id),assigned_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE dispute_evidence (
 id uuid PRIMARY KEY,order_id uuid NOT NULL REFERENCES orders(id),submitter_id uuid NOT NULL REFERENCES accounts(id),reviewer_id uuid NOT NULL REFERENCES accounts(id),
 envelope jsonb NOT NULL,ciphertext_hash text NOT NULL,expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE dispute_decisions (
 order_id uuid PRIMARY KEY REFERENCES orders(id),decision text NOT NULL CHECK(decision IN ('release','refund')),actor text NOT NULL DEFAULT 'loopback-admin-token',
 evidence_hashes jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION immutable_dispute_decision() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Dispute decision records are append-only'; END $$;
CREATE TRIGGER append_only_decisions BEFORE UPDATE OR DELETE ON dispute_decisions FOR EACH ROW EXECUTE FUNCTION immutable_dispute_decision();
CREATE UNIQUE INDEX one_pending_identity_challenge ON identity_challenges(account_id);
CREATE INDEX identity_challenge_expiry ON identity_challenges(expires_at);
CREATE INDEX conversation_quota ON conversations(buyer_id,expires_at) WHERE closed_at IS NULL;
CREATE INDEX conversation_expiry ON conversations(expires_at);
CREATE INDEX evidence_by_order ON dispute_evidence(order_id,created_at);
CREATE INDEX evidence_expiry ON dispute_evidence(expires_at);

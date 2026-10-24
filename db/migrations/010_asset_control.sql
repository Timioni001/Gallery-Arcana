CREATE TABLE asset_control_challenges (
 id uuid PRIMARY KEY,account_id uuid NOT NULL REFERENCES accounts(id),kind text NOT NULL CHECK(kind IN ('dns','github','evm')),subject text NOT NULL,
 statement text NOT NULL,expected_marker text NOT NULL,expires_at timestamptz NOT NULL,consumed_at timestamptz,attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE asset_control_verifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),challenge_id uuid NOT NULL UNIQUE REFERENCES asset_control_challenges(id),account_id uuid NOT NULL REFERENCES accounts(id),
 kind text NOT NULL,subject text NOT NULL,evidence_hash text NOT NULL,verified_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL
);
CREATE INDEX control_challenge_expiry ON asset_control_challenges(expires_at);
CREATE INDEX control_verification_owner ON asset_control_verifications(account_id,verified_at DESC);

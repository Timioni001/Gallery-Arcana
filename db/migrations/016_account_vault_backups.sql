-- Optional client-encrypted key backups. No recovery keys or readable passphrases.
CREATE TABLE account_vault_backups (
  account_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  revision integer NOT NULL CHECK (revision > 0),
  backup jsonb NOT NULL CHECK (jsonb_typeof(backup) = 'object' AND octet_length(backup::text) <= 524288),
  updated_at timestamptz NOT NULL DEFAULT now()
);

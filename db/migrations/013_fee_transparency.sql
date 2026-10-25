-- The fee rate each order was checked out under, and a public append-only
-- history of fee changes. Fees apply to completed sales only.
ALTER TABLE orders ADD COLUMN platform_fee_bps integer CHECK (platform_fee_bps BETWEEN 0 AND 10000);
CREATE TABLE fee_history (
  id bigserial PRIMARY KEY,
  fee_bps integer NOT NULL CHECK (fee_bps BETWEEN 0 AND 10000),
  effective_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO fee_history(fee_bps) SELECT (value #>> '{}')::integer FROM settings WHERE key='platform_cut_bps';
CREATE FUNCTION fee_history_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'fee_history is append-only'; END $$;
CREATE TRIGGER fee_history_immutable BEFORE UPDATE OR DELETE ON fee_history FOR EACH ROW EXECUTE FUNCTION fee_history_append_only();

-- Market USD/ZEC quotes written by the worker; checkout reads only fresh rows.
CREATE TABLE price_quotes (
  id bigserial PRIMARY KEY,
  rate_micro_usd bigint NOT NULL CHECK (rate_micro_usd > 0),
  sources jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX price_quotes_recent ON price_quotes(fetched_at DESC);

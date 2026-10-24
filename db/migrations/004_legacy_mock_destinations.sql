-- The original worker persisted its address pool but not its in-memory wallet.
-- Preserve known mock destinations so pending invoices can still be simulated.
-- Historical in-memory notes cannot be reconstructed and are never fabricated.
INSERT INTO mock_addresses(address)
  SELECT address FROM address_pool WHERE address ~ '^utest1mock[a-f0-9]{24}$'
  UNION SELECT address FROM payments WHERE address ~ '^utest1mock[a-f0-9]{24}$'
ON CONFLICT(address) DO NOTHING;

ALTER TABLE orders ADD COLUMN seller_payout_zat bigint CHECK(seller_payout_zat>=0);
-- Freeze outstanding v0.4 terms during upgrade. Integer NUMERIC avoids bigint
-- multiplication overflow and never uses floating-point accounting.
DO $$
DECLARE fee bigint;
BEGIN
 SELECT (value #>> '{}')::bigint INTO fee FROM settings WHERE key='platform_cut_bps';
 IF fee IS NULL OR fee<0 OR fee>10000 THEN RAISE EXCEPTION 'Invalid platform fee'; END IF;
 UPDATE orders o SET seller_payout_zat=floor(p.expected_zat::numeric*(10000-fee)/10000)::bigint
 FROM payments p WHERE o.payment_id=p.id AND o.acquisition_version=1;
END $$;

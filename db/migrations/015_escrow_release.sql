-- Escrow deadlines. A funded acquisition releases to the seller automatically at
-- release_after unless the buyer accepts earlier or disputes before it. Disputes
-- carry a decision deadline. Both are snapshotted per order when it is funded.
ALTER TABLE orders ADD COLUMN release_after timestamptz;
ALTER TABLE orders ADD COLUMN dispute_due_at timestamptz;
-- Orders already funded get a full review window from the upgrade, never a shorter one.
UPDATE orders SET release_after=now()+interval '72 hours' WHERE status='funded' AND acquisition_version=1;
UPDATE orders SET dispute_due_at=COALESCE(disputed_at,now())+interval '14 days' WHERE status='disputed';
CREATE INDEX orders_release_due ON orders(release_after) WHERE status='funded';
ALTER TABLE acquisition_events DROP CONSTRAINT acquisition_events_kind_check;
ALTER TABLE acquisition_events ADD CONSTRAINT acquisition_events_kind_check
  CHECK(kind IN ('buyer_accepted','buyer_disputed','operator_release','operator_refund','auto_release'));

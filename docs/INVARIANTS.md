# Domain invariants and audit repairs

## Database and transactions

Migrations adopt the intact original schema, then apply versioned changes transactionally under an advisory lock. Checksums detect mutation of applied SQL. Foreign keys bind listing files/previews to their uploader. Unique constraints enforce one active offer per buyer/listing, one pending order per listing, one completed/reviewed sale per listing, one invoice per order, one order per invoice, one receipt hash and one payout kind/order pair.

Invoice creation and expiry decisions use PostgreSQL time, avoiding API/worker clock disagreement. Domain lock order is listing → order → payment → payout. Checkout, offer actions and product edits serialize on the listing. Serialization/deadlock failures retry the whole transaction. Wallet submission is not retried inside a database transaction.

Session creation, explicit rotation and revoke-all serialize on the account row before modifying sessions. Revoke-all observes successors committed by earlier rotations; a new login serialized afterward creates a new session. Token rotation preserves the original absolute expiry. Worker heartbeat writes require the registered process UUID, so a predecessor cannot clobber successor readiness after losing its advisory-lock connection.

Listing states are live ↔ paused, live → reserved → sold, and reserved → live on expiration. Seller edits require the current revision and a live/paused state. Edits invalidate active offers; file and price snapshots protect orders from later changes. Checkout self-heals an expired reservation even if no worker is running. A late payment on an old order cannot release a newer reservation.

Offer states are open → accepted/declined/countered/withdrawn, countered → accepted/countered/declined/withdrawn, accepted → completed/withdrawn/declined. Buyer acceptance of a counter requires the exact viewed revision. Successful sale completes the selected offer and declines remaining active offers; unrelated offers are never described as completed purchases.

## Payment state machine

Each invoice owns a fresh destination, a 128-bit random invoice memo, an integer quote, a deadline and an order reference. No account balance or buyer-supplied transaction ID proves payment. An adapter must supply complete historical output snapshots, including spent outputs, and synchronization readiness. Each output has a stable pool/index identity; address, memo, value and immutable identity are verified before persistence. Duplicate observations cannot increase totals.

Only canonical shielded outputs at the configured confirmation threshold count. Pending partial funds remain pending until completion or expiration. Confirmed partial/late funds after expiry become refundable and never deliver goods. Initial excess is separated from seller proceeds and is refundable through the existing receipt claim endpoint. Settlement and queue insertion commit exactly once in the same transaction.

Confirmed output loss, changed confirmed totals, or conflicting persistent output identity trigger review. Delivery of affected paid orders is frozen and queued payouts are cancelled. Sending/sent funds cannot be undone; they require independent reconciliation. Review does not automatically clear after another snapshot. This is a safety response demonstrated by deterministic mocks, not a claim that chain finality is guaranteed.

Payouts move queued → sending → sent. The durable payout UUID is the wallet submission/reconciliation key. Atomic row claims prevent two workers from sending one queued payout. If the RPC result is uncertain, sending remains sending. A later exact destination/value match records the existing transaction; neither missing nor unknown results authorize another send. The durable mock implements this contract across process restarts. A real wallet's equivalent remains unverified.

## Delivery and receipts

Only paid orders deliver. The receipt is a random bearer secret hashed at rest; knowing a listing ID or payment transaction ID is insufficient. A buyer can replace a paid receipt; replacement invalidates download/refund use of the old code. Refund claims recheck the current receipt hash after acquiring locks. Originals are encrypted with AES-256-GCM, bound to their new-format storage key; legacy encrypted files remain readable.

Storage validates key kind/shape, rejects traversal and symlink reads, creates exclusive restrictive files and removes a newly written file if its database association fails. Preview decoding, pixel limits and re-encoding prevent header-only image spoofing and remove metadata. Opaque private uploads are never treated as executable previews. Malware scanning is not implemented; downloaded files remain untrusted.

## Repairs from the initial audit

The initial migration was not repeatable. The wallet and simulator forgot state on restart. The watcher had no persistent per-output replay tracking and abandoned expired invoices after seven days. Confirmed payments were not rechecked for reorganizations. Underpaid expired invoices had no refund path, and overpayments were forwarded wholesale to sellers. Listing edits/pagination and explicit session rotation/revocation were absent. Buyer counter-acceptance did not use the shared listing lock. Download data was read from mutable listing fields. Rate limits lived in one process, error logging serialized untrusted messages, the default admin placeholder could be used, and privacy cleanup could leave identifying note data or encounter offer references.

The versioned migrations, domain services, scanner, durable mock, operations code and automated tests now address these local paths. Remaining real-chain/custody and manual-review limits are explicitly recorded in ZALLET_GAP.md and OPERATIONS.md.

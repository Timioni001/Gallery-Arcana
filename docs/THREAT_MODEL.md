# Privacy and security threat model

## Participants and trust

Buyers and sellers use aliases and passphrases without mandatory identity checks. Sellers publish listing metadata and chosen previews; buyers' offers and order/payment APIs are private to their account. Sellers receive limited sale summaries and their own negotiation data. They do not receive a buyer purchase feed, buyer identifier, wallet deposit address or receipt secret through public listing responses.

The marketplace operator, database administrator and API process are trusted with account relationships, offer prices, invoice data and original-file decryption keys. Session/receipt secrets are hashed in PostgreSQL, but a compromised application can observe them in transit inside the process. The operator can correlate requests, accounts and payments. Pseudonymous accounts do not prevent browser, IP, timing, file-content or payment-pattern correlation. Alias availability is observable during registration.

Negotiation is stored as plaintext behind participant access controls. No client key protocol exists and no E2EE claim is made. AES-GCM protects files at rest, not against the API/operator holding the key. Unlisted links and public previews provide no confidentiality from recipients who share them.

## External attackers and malicious accounts

Attackers may guess IDs, submit another account's upload/offer/order IDs, forge MIME headers, traverse paths, present symlinks, replay receipts or wallet events, race checkout, spoof proxy headers, attempt SQL injection, send cross-site mutations or abuse login/signup. Tests exercise these boundaries. Queries use parameters; public fields are explicit projections. Domain mutations lock and validate ownership/current state. Unique database constraints provide a second boundary against duplicate orders, invoices, offers and payouts.

Cookies are HttpOnly and Strict SameSite with HTTPS Secure attributes. Custom mutation headers, exact origins and cross-site fetch metadata checks protect browser mutations; no external CORS permission is provided. Explicit session rotation invalidates the old token atomically, revocation covers all account sessions, and absolute expiry bounds server idle renewal. Browser cookies are renewed through explicit rotation to avoid stale read responses overwriting a freshly rotated token. PostgreSQL rate limits are shared across instances and retain hashes instead of raw IP/alias keys. Distributed account creation and denial of service remain possible.

A receipt grants bearer authorization for paid-proof retrieval and eligible refunds. Downloads of linked new acquisitions additionally require the buyer session; legacy or retention-anonymized paid receipts retain bearer redemption. Anyone stealing a bearer capability may redeem its allowed operations; protect it like a password. Buyer-authenticated replacement revokes its previous value. Requests/responses are not cached and have no-referrer headers. Receipt bodies, session tokens, invoice memos, file contents and arbitrary exception/wallet messages are not logged.

Private files are served as attachments with octet-stream/nosniff, never from the preview path. Public images are fully decoded and re-encoded without source metadata. Size and decoded-pixel limits bound image work. File contents can still be harmful to a downloader; no antivirus/content moderation system is implemented.

## Chain observers and wallet operations

The mock wallet does not provide Zcash privacy, confirmation or finality. A future genuine fully shielded transfer can hide relevant onchain details, but cannot hide information already supplied to counterparties or the marketplace. Unified addresses can contain transparent receivers: a prefix or UA string alone is not a shielded-only guarantee. The offline Zallet normalizer is an Orchard-only response-contract check, not proof of whole-transaction privacy or a live-chain integration.

Spending credentials belong in a separate wallet worker identity/secret store, never the public API. The API instantiates no wallet and rejects common spending-secret bindings. Local development shares a PostgreSQL identity and loads shared `.env` settings; it is not hardened production process isolation. Mainnet/real-wallet/production modes fail configuration validation.

Wallet synchronization, full-history attribution, spent-note recovery, reorg handling and send-result reconciliation must be independently proven before real funds. An uncertain payout is never blindly resubmitted. Reorganized settled payments freeze delivery and queued spending, but cannot undo an already sent payout or a file already downloaded.

## Retention and operations

After the configured settled-order period (default 30 days), with no unresolved payout or refund, cleanup removes the buyer link, payment/order association, receipt-to-offer association, note-level memo/tx data, and stored payout destination/tx details. The private file snapshot and receipt hash remain redeemable. Seller/listing/account records and aggregate accounting amounts remain; this is not erasure of every possible correlation. Unresolved invoices, refunds, sending payouts and review cases are retained for recovery instead of silently losing funds.

Completed mock submission ledger entries are also removed at this boundary; otherwise their payout UUIDs would retain a link to destinations and transaction IDs. A future real wallet and infrastructure backups have separate retention constraints that this database cleanup cannot erase.

Operational logs contain allowlisted event names, entity UUIDs and bounded known failure codes. These logs still require restricted access. Secret stores, key rotation/backup recovery, least-privilege production roles, independent security review, legal/moderation policies and custody controls are not established by this development setup.

## Acquisition trust and attestations

The operator holds funds in the mock custody model; buyer approval authorizes seller release, and shared-token operators resolve disputes. No automatic timeout release is implemented. A malicious operator/application/database can change records and possess signing keys; this is not trustless escrow. Stored SHA-256 proves byte consistency, not authenticity, legal title, licensing or safe content. Minimal signed claims distinguish buyer acceptance from operator release and label this implementation mock. They remain historically verifiable after later review; there is no revocation/key-history service. Sharing a proof discloses correlatable listing/order IDs, digest and time. Private dispute reasons are scrubbed after resolved retention; unresolved holds are retained for recovery.

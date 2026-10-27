# Gallery Arcana — complete available backend inventory

Version 0.5 extends the existing private-acquisitions backend. Version 0.4 combined the original marketplace, the security/recovery work, and the private-acquisitions archive. There is no frontend. The working payment system is a deterministic durable mock; no real blockchain settlement is represented as verified.

## Accounts and access

- Pseudonymous alias signup/login without mandatory identity verification; normalized aliases and salted scrypt passphrase hashes.
- Random hashed sessions with idle and absolute expiration, atomic rotation, logout and account-wide revocation. Creation/rotation/revocation serialize to prevent successor-token races.
- HttpOnly, Strict SameSite cookies; Secure on HTTPS; exact-origin/custom-header/fetch-site CSRF checks. No external CORS access.
- Participant-only offers and buyer order/payment APIs, seller-owned edits/uploads, private seller sale summaries, strong-token loopback administrative access disabled by default.
- Shared PostgreSQL limits for IP, account and normalized-login buckets; input validation, parameterized SQL and privacy-safe error/log projections.

## Listings and negotiation

- Seller-owned public or unlisted listings, metadata editing with revisions, owned private files and optional previews.
- Public search, categories, bounded pagination and deterministic ordering; paused/reserved/sold availability states.
- Private offers, seller acceptance/rejection/counters, buyer counter acceptance/rejection and withdrawal; stale revision and ownership checks.
- One active offer per buyer/listing; one reservation/completed acquisition per asset. Edits invalidate active offers and reserved/sold listings cannot change.
- Manual/external references can be listed and negotiated; their external ownership/delivery isn't checked by the platform and they cannot use automatic file checkout.

## Purchasing and private acquisitions

- Atomic checkout reserves one listing, snapshots file/title/name/digest, price, seller destination and payout amount, and persists a unique invoice/destination/memo/deadline/ZIP-321 request.
- All currency accounting uses integer zatoshis and integer fixed-rate quotes. Competing buyers cannot reserve conflicting sales; expired reservations recover without a worker; late old invoices cannot release a new reservation.
- New orders move `awaiting_payment → funded → paid` through verified mock funding followed by explicit buyer acceptance. Seller funds stay on hold until acceptance or operator release; no silence-based payout.
- Buyer-authenticated receipt/download access while an account link remains. Independent digest confirmation and prior byte preparation are required for buyer release.
- Confidential buyer disputes; loopback operator release or full refund; exact-once payout/event transitions under concurrency. Dispute reasons are private operator-readable plaintext.
- Seller proceeds use checkout terms; initial excess is refundable separately after release. Expired partial/late payments have a refund path and never unlock goods.
- Private receipt renewal revokes old capabilities; signed acquisition proofs are retrieved privately and independently verifiable with Ed25519. Legacy orders retain their original terms without fabricated attestations.

## Assets, proofs and privacy

- Private originals up to 25 MB, AES-256-GCM encryption, authenticated new-format file identifiers and legacy-format decryption.
- SHA-256 recorded from plaintext upload, privately propagated through the listing and snapshotted order, checked on every delivery; missing legacy hashes have an idempotent decrypt-and-backfill command.
- Preview PNG/JPEG/WebP decoding/re-encoding strips metadata, rejects malformed types/animation, and enforces 5 MB/25-million-pixel limits. Previews are public.
- Restricted exclusive file writes, path validation, symlink protections, safe attachment names/octet-stream delivery and cleanup on failed DB association.
- Strict Ed25519 proof schemas/canonical encoding, distinct buyer/operator outcomes, private-key permission and pair validation, public-only verification key responses and safe key generation without overwrite.
- No public buyer history, offer feed, invoice details, original digest, proof inventory or negotiation data. Attestations contain minimal but correlatable IDs/digest/time and are not ownership deeds or chain receipts.
- Settled retention removes buyer/payment/offer associations, dispute reasons, note metadata and completed mock submission details, while retaining receipt redemption. Unresolved funded/disputed/reviewed/uncertain funds remain recoverable. Backups/wallet history have separate retention limits.

## Wallet and crash recovery

- PostgreSQL-backed mock addresses, received notes and idempotent sends survive worker crashes/restarts.
- Exact address/memo/value/output-identity attribution, configured confirmations, persistent deduplication, spent-note adapter contract and synchronization gating; balances and buyer-supplied transaction IDs never prove an invoice.
- Under/over/late payments, conflicting output attribution and deterministic mock reorganizations are exercised by tests. Settled changes freeze delivery and queued spending for manual reconciliation.
- Atomic payout claims, durable submission UUIDs, exact destination/value reconciliation, and refusal to automatically retry ambiguous sends. Reconciliation command reports unresolved submissions.
- Source-pinned Zallet/Zebra investigation cohort, offline supported-response normalizer and bounded read-only RPC diagnostic with method allowlist, authentication, timeout/size/ID checks, account/receiver matching and stable-tip sample checks.
- Real-wallet mode, mainnet and production fail closed. The read-only probe is not a scanner or acceptance gate substitute; genuine funded testnet integration remains blocked.

## Web application (web/)

- Vite + React client served same-origin with the API. Landing, market, listing, offer/counter, checkout, order, studio, observer, verify, invitation and reviewer pages.
- Browser key vault in IndexedDB: identity generation and sealed-challenge registration, encrypted offline backup with a random 256-bit recovery key, restore on a new device, explicit reset. Private keys and capsule content keys never leave the browser.
- Arcana Capsules created in the browser (chunked AES-GCM, ≤16 MB), ciphertext-only upload with digest cross-check, per-buyer HPKE key sealing by the seller after trust-on-first-use fingerprint confirmation, funded-envelope retrieval and local decryption/verification by the buyer.
- End-to-end encrypted conversations with ≤32 KB attachments, client-side replay suppression, change warnings for counterparty keys and deletion.
- One-time private invitations (capability carried in the URL fragment), Trade Passport issue/present/revoke, public receipt/passport verification, asset-control challenges (DNS, GitHub, EVM `personal_sign`), consent-based dispute evidence sealed to the assigned reviewer, reviewer decryption workspace.
- Persistent mock/live settlement badge; `/observer` performs live unauthenticated probes to show what outsiders can read.
- Browser journeys (`npm run e2e` in `web/`) drive two to four real browser contexts against the API and worker.

## Operations and automation

- Node.js 22+, TypeScript, Fastify and PostgreSQL 16; separate API and wallet worker. Native Ubuntu/WSL PostgreSQL instructions; optional loopback-bound Docker database.
- Configuration/encryption/signing-key validation, no spending-secret bindings in the API, structured allowlisted logs, liveness/readiness endpoints and graceful shutdown.
- Single worker advisory lock, owned heartbeat UUIDs, backoff, connection-loss failure exit, serialized cycles, privacy cleanup and durable recovery.
- Transactional checksummed baseline/adoption/migrations 001–010; no direct schema replay on a populated database.
- Unit/security/RPC-contract tests, isolated PostgreSQL integration databases and temporary storage, real HTTP API/worker acceptance with lock loss and SIGKILL recovery, and runnable mock demo including offline proof verification.
- SHA-pinned GitHub CI actions, Node 22/24 matrix and PostgreSQL service. Local results are documented separately from hosted CI status.

## Commands and documentation

`npm ci`, `npm run keys`, `npm run migrate`, `npm run assets:backfill`, `npm run worker`, `npm run api`, `npm run demo:mock`, `npm run test:all`, `npm run payouts:reconcile`, `npm run zallet:probe`.

[API contract](API.md) · [Acquisition protocol](PRIVATE_ACQUISITIONS.md) · [Operations](OPERATIONS.md) · [Domain invariants](INVARIANTS.md) · [Threat model](THREAT_MODEL.md) · [Executed validation](VALIDATION.md) · [Real Zcash gate](ZALLET_GAP.md).

## Not available or in progress

No live Zcash/testnet settlement, mainnet custody, live FX feed, production key vault/backup recovery, independent protocol/security certification, individual operator authentication, key transparency/Signal-style forward secrecy, malware scanning, legal ownership/licensing guarantees, NFT/domain/repository custody, cross-chain atomic transfer, auctions, platform token or frontend. Browser ESM compiles and Node crypto journeys execute; real-browser interoperability is not yet demonstrated. A buyer confirmation/platform signature cannot provide those guarantees.

## v0.5 additions — implemented and locally verified

- Versioned browser-compatible client cryptography workspace: RFC 9180 HPKE, AES-GCM chunk order/length authentication, encrypted metadata, per-product random keys, encrypted identity backups, sender signatures, explicit peer pins and recovery epochs.
- Encrypted possession-challenge identity registration; signed continuity rotations, revocation for new activity, monotonic identity revisions and explicit passphrase-confirmed continuity loss/reset.
- Ciphertext-only capsule uploads and revision/buyer-bound prepositioned key envelopes. Checkout refuses absent/stale/revoked-key preparation; funding gates envelope retrieval. Existing server-encrypted products remain supported.
- Participant-only encrypted conversations with signed dual-recipient copies, bounded encrypted attachments, replay-resistant UUIDs/sequences, controlled deletion and expiry. Financial amounts remain backend-verifiable plaintext metadata.
- One-time private sales: opaque ID plus body-only hashed capability, designated recipient, fixed/accepted-offer price, expiration, revocation and atomic redemption through existing checkout. Public metadata access for invitation-only products is blocked.
- Trade Passport v2: private issuance of completed-acquisition or seller-delivery threshold facts, opt-in exact counts, audience/holder binding, fresh-nonce holder presentations, online revocation, offline signature checking and issuer-key history/compromise handling. No public transaction-search endpoint or unlinkability/ZK claim.
- Consent-based reviewer-only HPKE evidence, explicit reviewer replacement/re-encryption, package integrity/retention, immutable application-level decision records and existing exact-once refund/release protections.
- Independent DNS/public-GitHub/EIP-191 control challenges with purpose/origin/account/subject/nonces, expiry and atomic consumption. DNS/GitHub fixtures are synthetic; wallet tests prove local signatures only. No transfers or legal ownership claims.
- `npm run crypto:build` and `npm run journey:capsule`; the full HTTP/process test exercises the client-only-key journey while preserving the legacy demo. Full contracts and limits are in [CRYPTO_PROTOCOL.md](CRYPTO_PROTOCOL.md), [API.md](API.md) and [ASSET_CONTROL.md](ASSET_CONTROL.md).

Purchased capsule routing metadata (recipient/sender key/account IDs and listing reference) is retained to permit old-key recovery after financial retention. Content remains encrypted, but cleanup is not complete transaction unlinking. Encrypted evidence/conversations expire; expired/closed invitations and passports are removed. Existing privacy/account metadata, counterparties and wallet operations remain visible to the operator as described in the threat model.

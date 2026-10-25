# API contract

JSON API, no frontend. All mutations require `X-Arcana-Action: 1`; invalid browser origins or cross-site fetch metadata are rejected. No cross-origin CORS access is enabled. Responses use `Cache-Control: no-store`, `Referrer-Policy: no-referrer` and `X-Content-Type-Options: nosniff`.

Errors use `{error: string}` with 400 for input errors, 401 for missing authentication, 403 for forbidden actions, 404 for unavailable/private resources, 409 for stale/conflicting state, 413 for oversized bodies, 415 for unsupported uploads, 429 for limits and 503 for unavailable payment readiness. Validation responses include only field paths/codes; internal messages, SQL details and wallet responses are not returned.

## Public discovery and health

| Route | Contract |
| --- | --- |
| `GET /` | API name, version and documentation metadata. |
| `GET /api/health` | Process liveness, `mode: mock`, `network: test`, and `origin` (the exact `PUBLIC_ORIGIN` that client encryption identities must bind to). No chain-readiness claim. |
| `GET /api/terms` | Public trading terms: current `platformFeeBps` (completed sales only; refunds pay nothing), append-only `feeHistory`, settlement mode/network, `escrow` (`reviewHours`, `disputeDecisionDays`, plain-language rule), `minConfirmations`, and the price source with its maximum age (latest market quote, or the fixed demo rate). |
| `GET /api/ready` | 200 only when migrations, encryption/signing keys, worker heartbeat and free destination pool are ready; otherwise 503. |
| `GET /api/listings` | Live public listings. Optional `category=digital\|collectible\|onchain\|other`, literal title `q` (70 chars), `limit` 1–80 (default 40), `offset` 0–10000. Returns an array ordered by creation time and ID. |
| `GET /api/listings/{id}` | Listing metadata by UUID; unlisted links are readable by anyone possessing the URL. Paused listings are visible only to their seller. |
| `GET /previews/{key}` | Public re-encoded PNG/JPEG/WebP bytes; never a private original. |

Public listings omit buyer IDs, offers, private storage keys, payout addresses, receipt hashes and payment information. Sold status is listing availability, not a public transaction feed.

## Accounts and sessions

| Route | Contract |
| --- | --- |
| `POST /api/signup` | `{alias,passphrase}`. Alias normalizes to lowercase, 3–24 `[a-z0-9_-]` chars starting with a letter; passphrase 12–200 chars. Returns `{account:{id,alias}}` and a session cookie. |
| `POST /api/login` | `{alias,passphrase}`. Same account response and a fresh token; wrong alias and wrong passphrase receive the same error. |
| `GET /api/me` | `{account:null}` or the current `{id,alias,hasPayout}` identity. |
| `POST /api/logout` | Revokes the current token and clears its cookie. |
| `POST /api/session/rotate` | Atomically replaces the current token; old token stops working. Returns `{ok:true}` and the new cookie. |
| `POST /api/sessions/revoke` | Authenticated account revokes all its sessions, including the caller. |
| `PUT /api/me/payout` | Authenticated `{address}`. Only testnet-looking destinations are allowed in mock mode. This is not cryptographic receiver/network validation. |

Tokens are random 256-bit values, stored as hashes. Cookies are HttpOnly, SameSite=Strict, and Secure for HTTPS origins. Authenticated activity renews the server idle deadline (default 30 days), bounded by an absolute lifetime (default 90 days). The browser cookie lasts 30 days from issuance/explicit rotation; rotate to renew it. Read responses never rewrite an old token over a concurrent rotation. Rotation preserves the absolute deadline. Bearer session tokens are also supported; login never exposes raw session tokens in JSON.

## Listings and uploads

| Route | Contract |
| --- | --- |
| `POST /api/assets/previews` | Authenticated raw bytes with `Content-Type: application/octet-stream` and `X-Asset-Type: image/png\|image/jpeg\|image/webp`. Max 5 MB, max 25 million decoded pixels. Actual image decoding/re-encoding strips metadata. Returns `{key}`. |
| `POST /api/assets/private` | Authenticated raw bytes, max 25 MB, optional `X-Asset-Filename`. Bytes are encrypted and later delivered as an attachment with octet-stream type. Claimed MIME never changes this treatment. Returns `{key,sha256}`. The digest is private upload metadata. |
| `POST /api/listings` | `{title,description?,category?,visibility?,delivery?,fileKey?,previewKey?,assetReference?,priceUsdCents}`. Title 3–120 chars, description ≤2500, price 50–100000000 integer cents. Defaults: digital/public/download. Seller must own attached uploads and configure payout. Download delivery requires a private file. Returns `{listingId,revision}`. |
| `PATCH /api/listings/{id}` | Seller only, live/paused listings only. Partial create fields plus required `expectedRevision`. Advances revision and invalidates active offers. Reserved/sold products cannot be edited. |
| `GET /api/listings/mine` | Authenticated seller's listings and revisions. |
| `POST /api/listings/{id}/status` | Seller `{status:"live"\|"paused"}`. Cannot override reserved/sold state. |

`manual` and `external` listings can be advertised/negotiated but cannot enter automatic checkout. Assets and trade terms are snapshotted into orders. File paths and encryption keys never come from caller-controlled disk paths.

## Private offers

| Route | Contract |
| --- | --- |
| `POST /api/listings/{id}/offers` | Buyer `{amountUsdCents}` (same integer price bounds). One active offer per buyer/listing. Returns `{offerId,revision}`. |
| `GET /api/offers` | Only the account's buyer/seller offers; includes amount, counter, status, revision and listing `crypto_mode`. For the seller only, `buyer_id`/`buyer_alias` identify the pseudonymous buyer so a capsule key can be sealed to them (null for the buyer). `capsule_ready` is true when a current, unexpired envelope exists between both parties' active keys for the listing revision. No global history. |
| `POST /api/offers/{id}/action` | `{action,counterUsdCents?,expectedVersion?}`. Actions: `accept`, `decline`, `counter` for the seller; `withdraw`, `decline-counter`, `accept-counter` for the buyer. `counter` requires an amount. `accept-counter` requires the exact viewed `expectedVersion`; stale versions receive 409. Other actions may pass a version to guard their view. |

Seller acceptance applies only to the original open offer. A seller cannot accept their own counter on the buyer's behalf. Product edits invalidate offers. Actions stop while a listing is reserved/sold. Prices are access-controlled plaintext, not E2EE.

## Orders, receipts and delivery

| Route | Contract |
| --- | --- |
| `POST /api/listings/{id}/checkout` | Authenticated buyer `{}` or `{offerId}` for their current accepted offer. Atomically reserves the listing and returns `{orderId,payment:{paymentId,address,memo,amountZat,amountZec,usdCents,uri,expiresAt},receiptCode}`. Address is mock-only and single-use. Save the bearer receipt secret securely. |
| `GET /api/orders` | Current buyer's order summaries, never a public history. |
| `GET /api/orders/{id}` | Buyer-only status, immutable title/price/digest, funded/download/acceptance timestamps, payment progress/confirmations and refund state. |
| `GET /api/orders/{id}/payment` | Buyer-only original address, memo, quote and ZIP-321 URI. Never returns the receipt secret. |
| `GET /api/sales` | Seller's order summaries with the fee breakdown each order was checked out under: `platform_fee_bps`, `price_zat`, `platform_fee_zat`, `seller_payout_zat`. Omits buyer identity, memos, payment destinations and receipt secrets. |
| `POST /api/orders/{id}/receipt` | Funded/disputed/paid order's authenticated buyer replaces the receipt code. Returns private receipt metadata plus a new `receiptCode`; previous code is revoked. |
| `POST /api/files/{listingId}` | `{receiptCode}` plus the buyer session for linked v0.4 acquisitions. Funded/paid/disputed only; verifies the snapshotted SHA-256 and returns `X-Arcana-Asset-SHA256`. Legacy and retention-anonymized paid receipts retain bearer redemption. Unfunded/reviewed/refunded/revoked codes do not deliver. |
| `POST /api/refunds/late` | `{receiptCode,address}` claims confirmed late/expired partial funds or initial overpayment excess after release. The receipt is bearer authorization to choose the refund destination. Returns `{refundId,status:"queued"}`; repeat claims fail. |

Statuses: `awaiting_payment`, `funded`, `disputed`, `paid`, `expired`, `refund_due`, `refund_queued`, `payment_review`. New orders require explicit acceptance after funding; pre-upgrade orders keep the previous payment-to-paid transition. Independent refund state is `none`, `due`, `queued`, `sent`, or `review`. Expected ZEC is an exact integer-zatoshi minimum. Underpayment never delivers. Initial excess is refundable; seller payout uses snapshotted checkout terms and never includes excess. Later deposits or lost confirmed outputs enter manual review instead of silently modifying an existing payout.

## Buyer acceptance, disputes and attestations

| Route | Contract |
| --- | --- |
| `POST /api/orders/{id}/confirm-delivery` | Buyer `{receiptCode,assetSha256}`; exact digest, prior authenticated file preparation, and funded state required. Signs a minimal Ed25519 claim, marks paid and queues proceeds atomically. Replays/stale state receive 409. |
| `POST /api/orders/{id}/dispute` | Buyer `{reason}` (trimmed 10–2000 chars), funded state only and before the order's `release_after`. Returns disputed/on-hold with `decisionDueInDays`; reason is private operator-readable plaintext. |
| `POST /api/orders/{id}/proof` | Bearer `{receiptCode}`; returns the stored proof only for a paid acquisition. No public order lookup or fabricated legacy proof. |
| `GET /api/proofs/public-key` | `{algorithm:"Ed25519",publicKey}` in PEM form. |
| `POST /api/proofs/verify` | `{proof}` → `{valid}`; strict schema/signature check against the current public key, no order lookup. |
| `GET /api/admin/disputes` | Strong admin token and direct loopback; private unresolved dispute queue. |
| `POST /api/admin/orders/{id}/resolve` | Same gate; `{decision:"release"}` or `{decision:"refund",refundAddress}`. Disputed state and confirmed funds required; one audited disposition. |

A dispute refund returns the complete confirmed amount, including initial excess, and blocks further file delivery. Refund state becomes sent after reconciliation; order status remains `refund_queued` with `refund_status:"sent"`. Proof outcomes distinguish `buyer_accepted`, `operator_release` and `auto_release` (review window closed without acceptance or dispute). Order views include `release_after` and `dispute_due_at`. Disputed and payment-review orders are never released automatically. Proofs attest platform statements, not legal ownership or live blockchain settlement. See [PRIVATE_ACQUISITIONS.md](PRIVATE_ACQUISITIONS.md).

## Local operational interfaces

`GET /api/admin/payouts/stuck` is disabled by default. With a strong configured admin token it additionally requires a direct loopback connection and `X-Admin-Token`. It only returns payout IDs, kinds, states, attempts and timestamps. Do not forward any `/api/admin/*` route through an external reverse proxy. Prefer `npm run payouts:reconcile`.

The separate worker exposes loopback `GET /health`, `GET /ready`, and optional `POST /dev/pay`. Simulation requires `MOCK_SIMULATOR_TOKEN` through Bearer authentication and `{address,zat:"integer",memo}`. It persists mock notes; it does not send Zcash. It does not accept buyer-provided transaction IDs or confirmations as blockchain proof.

All API instances share PostgreSQL fixed-window rate limits keyed by hashes of IP/account/normalized-login buckets. Key mutation limits: listings 30/hour, uploads 40/hour, offers 30/hour, checkouts 12/hour; login 10/10min per IP and normalized alias; signup 6/hour per IP. Global limits additionally apply. Worker cleanup removes expired buckets.

## v0.5 encrypted commerce contracts

All account routes below require the existing session and mutation CSRF headers. Public exceptions are issuer history and signature verification. Binary fields are canonical base64url. Identity/envelope JSON schemas are strict and versioned; use the client SDK and [CRYPTO_PROTOCOL.md](CRYPTO_PROTOCOL.md) for exact canonical bytes, pins and recovery behavior. Never send private keys or plaintext content keys.

| Route | Input / access / behavior |
| --- | --- |
| `POST /api/encryption/challenges` | Own `PublicIdentity` v1; returns `{challengeId,statement,sealed,expiresAt}`. Five-minute encrypted possession challenge; rotation is bound to the prior identity. |
| `POST /api/encryption/challenges/{id}/complete` | `{secret,signature,previousSignature?}`. New-key proof plus prior signing key required for rotation; consumes the challenge. |
| `GET /api/encryption/identities/{accountId}` | Authenticated known-account lookup, no global directory. Returns public identities, binding proofs, epoch/revision and revocation timestamps. Used challenge nonces in binding proofs are public verification material, not content keys. |
| `POST /api/encryption/reset` | `{passphrase,acknowledgeKeyLoss:true}`. Fresh passphrase, account/IP limits. Revokes identities/passports and marks a continuity break; cannot recover old plaintext. |
| `POST /api/capsules` | Octet-stream containing SDK-encoded Capsule v1, max 24 MiB encoded / 16 MiB plaintext. Authenticated seller identity; returns `{key,sha256,capsuleId,cryptoMode:"capsule-v1"}`. Metadata name/MIME/plaintext digest are encrypted. |
| `POST /api/listings/{id}/capsule-envelope` | Seller `{buyerId,envelope}`. Live capsule listing only; signed HPKE buyer envelope stored for the current revision, withheld from buyers before funding. |
| `POST /api/orders/{id}/key-envelope` | Buyer session plus `{receiptCode}`. Funded/paid/disputed capsule order only; no payment-review/refund access. Returns the prepositioned envelope, including historical original-key envelopes after rotation. |
| `POST /api/conversations` | Buyer `{listingId,days?:1..30,invitation?:{id,capability}}`. Creates fixed buyer/seller membership and identity roster; at most 25 active conversations per buyer. Invitation-only listings require the capability. |
| `GET /api/conversations` | The caller's active (unexpired, undeleted) conversations as buyer or seller: ids, listing title, participant ids and pinned key ids, counterpart alias, sequence and expiry. Never message contents. |
| `POST /api/conversations/{id}/messages` | Participant `{id,buyer:Envelope,seller:Envelope}`. Signed/encrypted copies, matched context/nonces/recipient keys, unique message UUID and sequence. At most 500 messages; plaintext ≤64 KiB through SDK. |
| `GET /api/conversations/{id}/messages?after=0` | Participant only, unexpired conversation; returns only the caller's recipient envelope, max 100 messages ordered by sequence. |
| `DELETE /api/conversations/{id}` | Either participant deletes server copies immediately. Downloaded copies/backups cannot be erased. |
| `POST /api/admin/orders/{id}/reviewer` | Loopback admin `{reviewerId,replaceAssignment?:false}`. Independent reviewer with active encryption identity; disputed order only. Explicit replacement requires newly consented/re-encrypted evidence. |
| `GET /api/orders/{id}/reviewer` | Buyer, seller or assigned reviewer receives the public reviewer identity for explicit pinning. |
| `POST /api/orders/{id}/evidence` | Buyer/seller `{consent:true,envelope}` with purpose `evidence` and reviewer recipient. Max 20 encrypted packages/order; package UUID replay protection; retention ≤30 days. |
| `GET /api/orders/{id}/evidence` | Assigned reviewer account only, unexpired packages. An admin token alone grants no retrieval/decryption. |
| `POST /api/listings/{id}/invitations` | Seller, live capsule only: `{buyerId?,priceUsdCents?,offerId?,hours?:1..168}`. Accepted `offerId` determines negotiated price/buyer; cannot combine with a conflicting buyer or price. Returns `{invitationId,capability,expiresAt}` once. |
| `POST /api/invitations/{id}/inspect` | Authenticated `{capability}` and designated buyer if any. Returns private listing reference/title/price/deadline; rejects expired/revoked/redeemed/stale invitations. |
| `POST /api/invitations/{id}/redeem` | Same authorization/body; normal checkout response. Locks listing and invitation, creates one order/invoice and consumes capability atomically. Capsule buyer envelope must already exist. |
| `DELETE /api/invitations/{id}` | Seller revokes an unused invitation. Redeemed invitations cannot be revoked into reusable capabilities. |
| `POST /api/passports` | Authenticated explicit sharing request: `{kind:"completed_acquisition"\|"seller_deliveries",orderId?,minimum?:1,discloseCount?:false,audience,hours?:1..168}`. Own buyer-confirmed acquisition or established seller threshold only. Returns private Ed25519 v2 proof bound to the current identity fingerprint. |
| `POST /api/passports/verify` | Public `{proof,audience}`. Checks strict schema/signature, audience, expiry, proof revocation and issuer compromise. Returns `{valid,claim?,holderProofRequired?}`. Does not prove holder possession; use a relying-party nonce and SDK presentation helpers. |
| `DELETE /api/passports/{id}` | Owner revokes their certificate. No public certificate listing/search endpoint exists. |
| `GET /api/passports/issuers` | Public historical issuer IDs/SPKI PEMs/revocation timestamps. Does not publish transactions or users. |
| `POST /api/admin/passport-issuers/{keyId}/revoke` | Strong loopback admin; revokes a compromised issuer and blocks its further issuance/release. Rotate configured keys before restarting normal operation. |
| `POST /api/asset-control/challenges` | Authenticated `{kind:"dns"\|"github"\|"evm",subject,chainId?}`. Returns ten-minute domain-separated nonce statement. DNS: `_arcana-control.<domain>` TXT marker. GitHub: `.well-known/arcana-control.txt` on public `main`. EVM: EIP-191 personal-sign; chain IDs 1/137/42161/8453. |
| `POST /api/asset-control/challenges/{id}/verify` | Owner `{signature?}`; checks live DNS/GitHub observation or recovered EVM signer. Max five attempts, single-use, expiry rechecked after observation. Returns private time-bounded control observation, never legal ownership or a transfer. |
| `GET /api/asset-control/verifications` | Own private records only, no public inventory. Observations expire after 24 hours. |

For invitation-only listings, ordinary public listing GET/search and direct checkout are denied; the seller retains owner access. Offers and conversation creation require `{invitation:{id,capability}}` in the body. Fixed invitation prices do not silently change after a later negotiation: issue a new accepted-offer invitation/revoke the old one when changing terms. Capability secrets belong in request bodies, never URLs/analytics/logs. Concurrent redemption losers may receive 404 at inspection or 409 at the locked listing state.

`GET /api/orders/{id}` additionally exposes the buyer's `crypto_mode`. Existing delivery/acceptance routes remain: capsule downloads return encoded ciphertext, `X-Arcana-Asset-SHA256` and acceptance/proof hashes describe ciphertext, and local SDK decryption checks the private plaintext digest. Legacy server-encrypted products continue unchanged. Financial offer/counter amounts remain operator-visible; optional encrypted conversations do not conceal settlement metadata.

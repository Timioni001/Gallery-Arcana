# API contract

JSON API, no frontend. All mutations require `X-Arcana-Action: 1`; invalid browser origins or cross-site fetch metadata are rejected. No cross-origin CORS access is enabled. Responses use `Cache-Control: no-store`, `Referrer-Policy: no-referrer` and `X-Content-Type-Options: nosniff`.

Errors use `{error: string}` with 400 for input errors, 401 for missing authentication, 403 for forbidden actions, 404 for unavailable/private resources, 409 for stale/conflicting state, 413 for oversized bodies, 415 for unsupported uploads, 429 for limits and 503 for unavailable payment readiness. Validation responses include only field paths/codes; internal messages, SQL details and wallet responses are not returned.

## Public discovery and health

| Route | Contract |
| --- | --- |
| `GET /` | API name, version and documentation metadata. |
| `GET /api/health` | Process liveness, `mode: mock`, `network: test`. No chain-readiness claim. |
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
| `GET /api/offers` | Only the account's buyer/seller offers; includes amount, counter, status and revision. No global history. |
| `POST /api/offers/{id}/action` | `{action,counterUsdCents?,expectedVersion?}`. Actions: `accept`, `decline`, `counter` for the seller; `withdraw`, `decline-counter`, `accept-counter` for the buyer. `counter` requires an amount. `accept-counter` requires the exact viewed `expectedVersion`; stale versions receive 409. Other actions may pass a version to guard their view. |

Seller acceptance applies only to the original open offer. A seller cannot accept their own counter on the buyer's behalf. Product edits invalidate offers. Actions stop while a listing is reserved/sold. Prices are access-controlled plaintext, not E2EE.

## Orders, receipts and delivery

| Route | Contract |
| --- | --- |
| `POST /api/listings/{id}/checkout` | Authenticated buyer `{}` or `{offerId}` for their current accepted offer. Atomically reserves the listing and returns `{orderId,payment:{paymentId,address,memo,amountZat,amountZec,usdCents,uri,expiresAt},receiptCode}`. Address is mock-only and single-use. Save the bearer receipt secret securely. |
| `GET /api/orders` | Current buyer's order summaries, never a public history. |
| `GET /api/orders/{id}` | Buyer-only status, immutable title/price/digest, funded/download/acceptance timestamps, payment progress/confirmations and refund state. |
| `GET /api/orders/{id}/payment` | Buyer-only original address, memo, quote and ZIP-321 URI. Never returns the receipt secret. |
| `GET /api/sales` | Seller's order summaries. Omits buyer identity, memos, payment destinations and receipt secrets. |
| `POST /api/orders/{id}/receipt` | Funded/disputed/paid order's authenticated buyer replaces the receipt code. Returns private receipt metadata plus a new `receiptCode`; previous code is revoked. |
| `POST /api/files/{listingId}` | `{receiptCode}` plus the buyer session for linked v0.4 acquisitions. Funded/paid/disputed only; verifies the snapshotted SHA-256 and returns `X-Arcana-Asset-SHA256`. Legacy and retention-anonymized paid receipts retain bearer redemption. Unfunded/reviewed/refunded/revoked codes do not deliver. |
| `POST /api/refunds/late` | `{receiptCode,address}` claims confirmed late/expired partial funds or initial overpayment excess after release. The receipt is bearer authorization to choose the refund destination. Returns `{refundId,status:"queued"}`; repeat claims fail. |

Statuses: `awaiting_payment`, `funded`, `disputed`, `paid`, `expired`, `refund_due`, `refund_queued`, `payment_review`. New orders require explicit acceptance after funding; pre-upgrade orders keep the previous payment-to-paid transition. Independent refund state is `none`, `due`, `queued`, `sent`, or `review`. Expected ZEC is an exact integer-zatoshi minimum. Underpayment never delivers. Initial excess is refundable; seller payout uses snapshotted checkout terms and never includes excess. Later deposits or lost confirmed outputs enter manual review instead of silently modifying an existing payout.

## Buyer acceptance, disputes and attestations

| Route | Contract |
| --- | --- |
| `POST /api/orders/{id}/confirm-delivery` | Buyer `{receiptCode,assetSha256}`; exact digest, prior authenticated file preparation, and funded state required. Signs a minimal Ed25519 claim, marks paid and queues proceeds atomically. Replays/stale state receive 409. |
| `POST /api/orders/{id}/dispute` | Buyer `{reason}` (trimmed 10–2000 chars), funded state only. Returns disputed/on-hold; reason is private operator-readable plaintext. |
| `POST /api/orders/{id}/proof` | Bearer `{receiptCode}`; returns the stored proof only for a paid acquisition. No public order lookup or fabricated legacy proof. |
| `GET /api/proofs/public-key` | `{algorithm:"Ed25519",publicKey}` in PEM form. |
| `POST /api/proofs/verify` | `{proof}` → `{valid}`; strict schema/signature check against the current public key, no order lookup. |
| `GET /api/admin/disputes` | Strong admin token and direct loopback; private unresolved dispute queue. |
| `POST /api/admin/orders/{id}/resolve` | Same gate; `{decision:"release"}` or `{decision:"refund",refundAddress}`. Disputed state and confirmed funds required; one audited disposition. |

A dispute refund returns the complete confirmed amount, including initial excess, and blocks further file delivery. Refund state becomes sent after reconciliation; order status remains `refund_queued` with `refund_status:"sent"`. An operator release is distinguished from buyer acceptance in the proof. No automatic timeout release or payment-review bypass exists. Proofs attest platform statements, not legal ownership or live blockchain settlement. See [PRIVATE_ACQUISITIONS.md](PRIVATE_ACQUISITIONS.md).

## Local operational interfaces

`GET /api/admin/payouts/stuck` is disabled by default. With a strong configured admin token it additionally requires a direct loopback connection and `X-Admin-Token`. It only returns payout IDs, kinds, states, attempts and timestamps. Do not forward any `/api/admin/*` route through an external reverse proxy. Prefer `npm run payouts:reconcile`.

The separate worker exposes loopback `GET /health`, `GET /ready`, and optional `POST /dev/pay`. Simulation requires `MOCK_SIMULATOR_TOKEN` through Bearer authentication and `{address,zat:"integer",memo}`. It persists mock notes; it does not send Zcash. It does not accept buyer-provided transaction IDs or confirmations as blockchain proof.

All API instances share PostgreSQL fixed-window rate limits keyed by hashes of IP/account/normalized-login buckets. Key mutation limits: listings 30/hour, uploads 40/hour, offers 30/hour, checkouts 12/hour; login 10/10min per IP and normalized alias; signup 6/hour per IP. Global limits additionally apply. Worker cleanup removes expired buckets.

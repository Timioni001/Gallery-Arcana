# Private acquisitions — backend v0.4

New checkouts use a custodial buyer-acceptance flow. Existing pre-upgrade orders retain their original settlement terms. This backend accepts deterministic mock payments only; real testnet, mainnet and production custody remain disabled.

## Acquisition flow

1. A seller uploads an original encrypted with AES-256-GCM. Its plaintext SHA-256 is stored privately and copied from the owned upload into the listing.
2. A buyer chooses a price or submits a private offer/counteroffer. Checkout reserves the listing and snapshots the original, digest, price, payout destination and integer seller payout terms.
3. The worker matches exact canonical mock outputs, invoice address/memo/value and required confirmations. Funding changes a new order to `funded`; the listing becomes unavailable and no seller payout exists.
4. The authenticated buyer supplies the receipt secret to download the order's immutable original. The server decrypts and checks its digest, sets `X-Arcana-Asset-SHA256`, and records successful preparation of the bytes. The buyer should independently hash the downloaded bytes. This event does not prove the client received, opened or approved them.
5. The buyer confirms with the receipt and matching digest. One transaction writes the Ed25519-signed proof, changes the order to `paid`, and queues seller proceeds from the checkout snapshot. Missing/unsafe/mismatched signing keys roll back the release.
6. Alternatively, the buyer disputes a funded acquisition. Funds remain on hold until an authenticated loopback operator explicitly releases seller proceeds or refunds the complete received amount. There is no automatic timeout release.

Initial overpayments remain separately refundable after release. Before release, the excess cannot be claimed through the late-refund endpoint; operator refund includes it in the full refund. This prevents two refund paths from allocating the same funds. Seller proceeds never include excess. Fee changes after checkout do not change snapshotted seller proceeds.

Concurrent acceptance, disputes and resolutions serialize with the same listing → order → payment → payout lock order. Unique sale/payout/event constraints prevent conflicting dispositions. Confirmed-note loss or changed attribution freezes funded, disputed and paid orders in `payment_review`; neither buyer nor operator acquisition routes bypass this freeze. Existing uncertain-send reconciliation still refuses blind retries.

## Routes

All mutations require `X-Arcana-Action: 1`. Browser origin/fetch-site protections and shared rate limits apply. See [API.md](API.md) for the complete route contract.

| Route | Access and behavior |
| --- | --- |
| `POST /api/orders/{id}/confirm-delivery` | Buyer session and `{receiptCode,assetSha256}`. Requires funded state and prior authenticated byte preparation. Returns `{status:"paid",proof}`. |
| `POST /api/orders/{id}/dispute` | Buyer session and `{reason}` (10–2000 chars). Only funded orders; reasons are private plaintext visible to the operator. |
| `POST /api/orders/{id}/proof` | Bearer `{receiptCode}`. Returns the stored proof only while the order is paid. No proof is fabricated for legacy orders. |
| `GET /api/proofs/public-key` | Public `{algorithm:"Ed25519",publicKey}`; returns only a normalized public PEM. |
| `POST /api/proofs/verify` | `{proof}` → `{valid}`. Checks signature/schema against the configured public key without querying an order. |
| `GET /api/admin/disputes` | Strong admin token and direct loopback connection. Private dispute queue, no public history. |
| `POST /api/admin/orders/{id}/resolve` | Same admin gate. `{decision:"release"}` or `{decision:"refund",refundAddress}`. Records one explicit operator event. |
| `POST /api/files/{listingId}` | Current receipt plus buyer authentication for linked v0.4 orders; funded/paid/disputed only. Legacy or retention-anonymized paid receipts retain bearer redemption. |

## What an attestation proves

The canonical signed bytes are the UTF-8 JSON array `[version,orderId,listingId,assetSha256,finalizedAt,outcome,paymentMode]`. Version is 1, algorithm Ed25519, signature is unpadded base64url. The envelope and claim schemas reject extra fields, invalid identifiers/dates and altered signatures. Outcomes distinguish `buyer_accepted` from `operator_release`; this implementation always issues `paymentMode:"mock"`.

A proof establishes only that the platform signed this historical claim. It does not prove genuine Zcash settlement, legal title, copyright, licensing, authenticity, human inspection, external ownership transfer or a current unrevoked payment state. Previously issued proofs can still verify offline after a later chain review. No proof-revocation or multi-key rotation protocol is implemented. Preserve published verification keys; changing the configured key changes what the current verification endpoint accepts.

Proofs include order/listing UUIDs, the file digest and a timestamp. They remain private unless a recipient shares them; sharing can enable correlation and reveal an unlisted listing URL. No buyer alias, amount, address, memo or transaction ID is included. The operator sees account relationships and plaintext negotiations and can decrypt originals; this is not E2EE or trustless escrow.

## Upgrade and demo

Run the normal checksummed `npm run migrate`, for both fresh and existing databases. Do not run the archive's old standalone upgrade SQL or replace `db/schema.sql`. Migrations 006/007 add acquisition state/snapshots and payout terms without changing prior migration files. Back up persistent data first, stop old processes, provision/preserve signing keys, apply migrations, and run `npm run assets:backfill` before accepting new checkouts for legacy originals. Backfill decrypts existing files, fills missing digests, and refuses missing/corrupt originals. It never guesses a digest or invents a legacy proof.

`npm run keys` creates an ignored Ed25519 key pair and refuses overwrite. Configure both paths from `.env.example`. Private key permissions must be 0600 or stricter and the public key must match. The API validates both keys before listening/readiness; public proof verification itself reads only the public key.

`npm run demo:mock` exercises two new aliases, encrypted upload, unlisted listing, private offer/acceptance, checkout, authenticated mock receive, funding, verified download, explicit acceptance and offline proof verification. It requires running mock API/worker services and the same strong simulator token in `.env.worker`. It creates local demo records; it prints flags only, never account credentials, receipts or invoice secrets. The automated HTTP acceptance test executes this script against an isolated database.

See [OPERATIONS.md](OPERATIONS.md), [VALIDATION.md](VALIDATION.md) and [CAPABILITIES.md](CAPABILITIES.md). Live Zcash, fresh FX quotes, production key/backup recovery, individual operator identities, dispute policy and external security review remain separate blockers.

# Gallery Arcana — API contract (JSON; no frontend)

Local base: `http://localhost:8080`. All state mutations need `X-Arcana-Action: 1`. Sessions use Strict HttpOnly cookies. No external CORS support is enabled.

## Public
- `GET /` — server metadata JSON.
- `GET /api/health` — API process status, wallet mode and network (does not prove wallet operation).
- `GET /api/listings?category=digital&q=term` — public, live listings only.
- `GET /api/listings/{listing_uuid}` — listing (unlisted entries accessible by UUID).
- `GET /previews/{preview_key}` — image previews, not encrypted.

## Accounts
- `POST /api/signup` — `{ "alias": "seller01", "passphrase": "12+ chars" }`.
- `POST /api/login` — same shape.
- `POST /api/logout` — invalidate current session.
- `GET /api/me` — current session identity and whether payout address is configured.
- `PUT /api/me/payout` — `{ "address": "utest1..." }`. Prefix check only, network/address validation must be implemented against real wallet before launch.

## Listings and assets
- `POST /api/assets/previews` — raw PNG/JPEG/WebP bytes, headers: `Content-Type: application/octet-stream`, `X-Asset-Type: image/png` etc.
- `POST /api/assets/private` — raw digital file (max 25MB), optional `X-Asset-Filename`.
- `POST /api/listings` — `{ "title": "...", "description": "...", "category": "digital", "visibility": "public|unlisted", "delivery": "download|manual|external", "fileKey": "...", "previewKey": "...", "priceUsdCents": 500 }`.
- `GET /api/listings/mine` — your listings.
- `POST /api/listings/{id}/status` — `{ "status": "paused|live" }`.

## Offers
- `POST /api/listings/{id}/offers` — `{ "amountUsdCents": 350 }`.
- `GET /api/offers` — seller/buyer participant offers only (no global feed).
- `POST /api/offers/{id}/action` — `{ "action": "accept|decline|counter|withdraw|accept-counter", "counterUsdCents": 400 }` (counter amount only when relevant).

## Orders and payment simulator
- `POST /api/listings/{id}/checkout` — `{}` or `{ "offerId": "..." }`. Only downloadable goods support this endpoint. Returns `{orderId, payment:{address,memo,amountZat,amountZec,uri,expiresAt},receiptCode}`. Save receiptCode: it is only returned once.
- `GET /api/orders` — your purchases only.
- `GET /api/orders/{id}` — status for authenticated buyer.
- `GET /api/orders/{id}/payment` — restore address, memo, amount and URI after a refresh. Never returns receiptCode.
- `POST /api/files/{listing_uuid}` — `{ "receiptCode": "RCT-..." }`, returns a binary file after payment confirmed.
- `POST /api/refunds/late` — `{ "receiptCode":"RCT-...", "address":"utest1..." }` if late payment confirmed.
- Mock/test only, localhost worker: `POST http://127.0.0.1:8081/dev/pay` with `{ "address": "...", "zat": "2500000", "memo": "GA-..." }`. This does NOT send Zcash.
- `GET /api/admin/payouts/stuck` — admin header auth for local manual reconciliation; do not expose without a separate hardened admin service in production.

## Privacy contract
- No global buyer histories or public bids.
- Offer confidentiality is access control, NOT end-to-end encryption.
- Payments and order metadata are temporarily accessible to the backend operator.
- Zcash anonymity is only provided by real, fully shielded transactions, **not** by the mock wallet.
- An unlisted link can be shared onward; do not expose sensitive descriptions/previews through it.

## Operational limits
- Session cookies have a rolling 30-day idle expiry and are invalidated on logout. Signing in creates a fresh random server-side token.
- Signup/login and mutating account actions use in-process IP limits; listing, upload, offer, and checkout mutations also use in-process account limits. Counters reset on restart and are not shared across API instances, so multi-instance deployment requires a shared limiter.
- The API disables request logging. It logs only bounded internal error messages and worker failures; operators must still protect process logs and database access.

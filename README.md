# Gallery Arcana — backend-only technical build (v0.3.0)

This project intentionally contains **NO UI**. It is the source-code backend for a simple privacy-oriented marketplace based on the original Gallery Arcana archive and the retuned marketplace design.

## Implemented modules

1. Accounts: alias/passphrase signup, scrypt hashes, server-side sessions, HttpOnly cookies.
2. Listings: public or unlisted; digital goods, collectibles, onchain references; owner-only upload association.
3. Negotiation: private (participant-only API) offer/counter/accept/decline/withdraw workflows. NOT end-to-end encrypted.
4. Checkout: atomic listing reservation, order record, new payment destination per order, ZIP-321 payment URI, buyer-only order status and payment instruction retrieval.
5. Delivery: AES-256-GCM encrypted private uploads, real image signatures for previews, high-entropy bearer receipts, authenticated order status, receipt-gated digital file downloads.
6. Payment worker: isolated wallet process, confirmations, late-payment tracking, queued payouts, and refund claims.
7. Privacy: no public buyer feed, no transaction history on listing endpoint, data-retention job, logs disabled in API, rolling sessions and in-process IP/account limits.
8. Tests: Node unit tests for amounts, receipts, scrypt, encryption and preview validation; local Postgres/API integration coverage for account sessions, upload ownership, offer privacy, checkout races, payment memo matching, expiry/refund, and file delivery.

Important: `web/` is deliberately absent. The API root returns metadata JSON.

## What is deliberately NOT live

- Mainnet and production execution are **disabled** by code guards. Mock wallet mode demonstrates the protocol without real funds.
- The included Zallet driver in `src/wallet/zallet.ts` is an **unverified reference** only and is not registered. Current Zallet docs do not list the prior code's `z_listreceivedbyaddress` call. Read `docs/ZALLET_GAP.md` before implementing a supported, independently verified scanner.
- Not trustless escrow; payout worker is custodial; FX uses a fixed demo rate.
- No E2EE chat or confidential seller matching. Offer prices are private from other marketplace users, but visible to the server/database operator.
- External tokens/NFTs are **listing/negotiation only**; no atomic settlement or asset proof, no support for unlawful trade.
- No dispute mediation, malicious file scanning, content moderation, multi-instance rate limiting, audited backups, or custody security review.
- `unlisted` means anyone with the link can see the listing metadata. It is not an encryption boundary.

## Run locally (Ubuntu / WSL)

Requirements: Node.js >=22, npm, PostgreSQL 16 (Docker optional). Running Postgres is needed for API integration; `npm test` does not need a database.

```bash
cp .env.example .env
# Choose a strong secret key, put the output in .env as ASSET_ENCRYPTION_KEY=...
openssl rand -hex 32
npm ci
# If Docker is installed:
docker compose up -d db
npm run migrate
npm run worker       # terminal A (demo address pool and payment simulator)
npm run api          # terminal B (http://127.0.0.1:8080)
```

If Docker is unavailable, run a local Postgres 16 service and set `DATABASE_URL` correctly. The migration initializes a **new** schema and will not migrate prior art-gallery data. Do not apply it to an existing production database.

### Terminal/API basics

Every POST/PUT/PATCH/DELETE request requires `X-Arcana-Action: 1`. Use `-b cookies.txt -c cookies.txt` for session cookies or submit an Authorization Bearer token if one exists. A cookie signup example:

```bash
curl -sS -c cookies.txt -H 'X-Arcana-Action: 1' -H 'Content-Type: application/json' \
  -d '{"alias":"seller01","passphrase":"a-long-unique-passphrase"}' http://localhost:8080/api/signup
curl -sS -b cookies.txt http://localhost:8080/api/me
```

Run the API and worker in distinct processes. The worker listens on `127.0.0.1:8081/dev/pay` in mock/test mode only; this is a **simulator**, not an actual Zcash RPC.

For a full walkthrough of the endpoint contract, see `docs/API.md`. Source references and priorities for real Zallet integration are in `docs/ZALLET_GAP.md`.

## Project map

```text
src/http/server.ts          Fastify API, input validation, auth enforcement
src/services/             listings, offers, checkout, auth, storage, settlement
src/jobs/                 address pool, watcher, payout queue, retention
src/wallet/               mock wallet + unverified Zallet prototype
src/lib/                  crypto, money conversion, image signatures
src/main.ts               API process
src/worker.ts             separate wallet/settlement worker
db/schema.sql             Postgres schema
scripts/migrate.ts        initial DB creation
test/core.test.ts         dependency-free Node tests
docs/                     API contract and technical limitations
```

## Validation

```bash
npm test
npm run typecheck          # after npm install
npm run test:integration   # after Postgres is running and npm run migrate has initialized a local database
```

The integration suite uses a local Postgres database and mock wallet only. It does not validate live Zcash testnet payments or payouts. Never advertise this repository as production-ready without independently verified wallet behavior and operational review.

# Gallery Arcana v0.5

A Node.js 22+, TypeScript, Fastify and PostgreSQL marketplace backend. API and wallet workers run separately. Development payments use an explicitly labelled durable mock wallet. **Real Zcash, mainnet and production custody remain disabled.**

The local workflow supports alias accounts, hashed passphrases, rotating/revocable sessions, seller-owned uploads and listing edits, public/unlisted discovery, private offers and counteroffers, atomic checkout, confirmation checks, held seller funds, verified encrypted-file delivery, explicit buyer acceptance, private disputes, Ed25519 attestations, receipts, refunds and payout reconciliation. The web app lives in [`web/`](web/README.md).

## Start locally

Use PostgreSQL 16, Node.js 22+ and npm. Native PostgreSQL on Ubuntu/WSL is supported; Docker is optional. Full native setup, key handling and separate service instructions are in [docs/OPERATIONS.md](docs/OPERATIONS.md).

```bash
npm ci
npm run crypto:build            # browser SDK ESM/declarations
cp .env.example .env             # only if .env does not already exist
# Set DATABASE_URL and a persistent ASSET_ENCRYPTION_KEY in .env.
# Generate the key locally: openssl rand -hex 32
# Optional database alternative: docker compose up -d db
npm run keys                    # once: creates ignored signing keys; refuses overwrite
npm run migrate                 # checksummed, transactional and repeatable
npm run assets:backfill          # needed for existing originals without fingerprints
npm run worker                  # terminal A
npm run api                     # terminal B
```

The API binds to loopback by default. `GET /api/health` reports process liveness; `GET /api/ready` checks schema, encryption/signing keys, worker heartbeat and payment-destination availability. All mutations require `X-Arcana-Action: 1`; browser mutations also enforce the configured origin and fetch-site checks. Session cookies are HttpOnly and SameSite=Strict, and Secure when `PUBLIC_ORIGIN` uses HTTPS.

Copy `.env.worker.example` to `.env.worker` for worker-only options. The localhost payment simulator is disabled unless a strong `MOCK_SIMULATOR_TOKEN` is configured. It requires Bearer authentication and never submits blockchain transactions. Wallet spending credentials must not be placed in the API environment.

## Ubuntu / WSL quick start

From an Ubuntu (or WSL2) shell with Node.js 22+:

```bash
npm run setup:wsl    # installs/starts PostgreSQL, creates role+DB, .env files, keys, migrations, web deps
npm run dev          # worker + API + web together; open http://localhost:5173 from Windows
```

Clone inside the Linux filesystem (for example `~/code`), not under `/mnt/c`, so file watching and npm installs stay fast. To pay for a test order, copy the memo from the order page and run `npm run mock:pay -- <memo>`. This uses the local mock simulator and sends no blockchain transaction.

## Web app

`web/` is a Vite + React + Tailwind v4 frontend (shadcn/Base UI primitives; warm paper, dot-matrix and isometric line-art design) with the landing page, market, listing/offer/checkout, order delivery verification and the seller studio. With the API and worker running:

```bash
npm ci --prefix web
npm run web:dev                 # http://localhost:5173, proxies /api and /previews to :8080
```

Without a reachable API the market shows clearly labelled, non-purchasable preview listings. See [web/README.md](web/README.md) for production serving.

## Validate

```bash
npm test                        # unit/security/RPC-contract tests; DB suites explicitly skipped here
npm run test:integration         # creates, migrates and drops a separate PostgreSQL DB per test file
npm run typecheck
# Or: npm run test:all
```

New checkouts reach `funded` after verified mock payment. Seller payout stays on hold until the buyer downloads, verifies SHA-256 and explicitly confirms, or a loopback operator resolves a dispute. See [private acquisitions](docs/PRIVATE_ACQUISITIONS.md). Existing orders keep their original settlement behavior.

The integration runner requires a local role with CREATEDB, or `TEST_DATABASE_ADMIN_URL` for a dedicated test role. It never truncates the application database. Tests cover the signup → private offer → acceptance → checkout → verified mock payment → file inspection → buyer acceptance → signed receipt journey; authorization, concurrent checkout, expiry, partial/excess/late payments, output replay, reorganizations, worker crash/restart and payout reconciliation. See [docs/VALIDATION.md](docs/VALIDATION.md) for executed results and limits.

`npm run zallet:probe` diagnoses supported read-only wallet RPC contracts using optional `.env.worker` bindings. It cannot spend or enable real payments. Its bounded sample does not satisfy live testnet acceptance; see [docs/ZALLET_GAP.md](docs/ZALLET_GAP.md).

## Contracts and limitations

- **[Complete capability inventory](docs/CAPABILITIES.md)** covers everything currently available and its verification limits.
- [API routes](docs/API.md), [domain invariants and audit repairs](docs/INVARIANTS.md), [threat model](docs/THREAT_MODEL.md), [operations](docs/OPERATIONS.md).
- Financial offers/counters remain operator-readable. Optional v1 encrypted conversations protect participant text/attachments using client keys; legacy records are explicitly plaintext. See [cryptography protocol](docs/CRYPTO_PROTOCOL.md).
- Legacy originals use server-held AES-256-GCM at rest. New Arcana Capsules add local client encryption with buyer-specific HPKE key envelopes; the server does not receive their content keys. Public previews are decoded and re-encoded with metadata removed; they remain public.
- Receipt codes authorize proof retrieval and eligible refunds. New linked acquisitions additionally require the buyer session for downloads. Legacy and retention-anonymized paid receipts preserve bearer redemption. Buyer receipt renewal invalidates the previous code.
- Unlisted URLs hide listings from search, but anyone with the URL can view their metadata.
- Rate limits are shared atomically through PostgreSQL. Limits do not make pseudonymous signup resistant to a distributed Sybil attack.
- Demo exchange rates are fixed and parsed entirely with integer arithmetic. They are unsuitable for accepting real funds.
- SHA-256 proves file consistency; Ed25519 proves a historical platform claim, without proving legal ownership or real onchain settlement.
- Reorganized settled payments and deposits arriving after settlement are frozen for manual review. Uncertain payouts are reconciled by durable submission ID and never blindly retried.
- Real wallet status is **blocked**: source/RPC-contract inspection is not live-chain validation. [docs/ZALLET_GAP.md](docs/ZALLET_GAP.md) records pinned investigation versions, exact blockers and the separate live-testnet acceptance gate.
- This backend provides no external NFT custody, atomic cross-chain settlement, dispute mediation, malware scanning, production key vault or audited backup system.

For the runnable local demonstration, configure the optional worker simulator credential and run `npm run demo:mock`. It creates local demo accounts/listings and prints verification flags without credentials or invoice secrets.

## v0.5 private commerce

[Client cryptography and recovery](docs/CRYPTO_PROTOCOL.md) provides versioned local chunked encryption, authenticated identities/rotation, pinned buyer envelopes, encrypted conversations/attachments and reviewer-only evidence. Single-use invitation capabilities support private capsule sales. Trade Passport v2 supports consent-based minimal facts, holder presentations, expiry, revocation and issuer-key history. Independent [asset-control observations](docs/ASSET_CONTROL.md) support DNS TXT, public GitHub challenge files and EIP-191 wallet signatures without custody.

Run `npm run journey:capsule` against configured loopback mock API/worker services to exercise encrypted negotiation → capsule purchase → local decryption → buyer acceptance → passport verification. This creates local verification records and does not send blockchain transactions. The original `npm run demo:mock` remains functional. The full automated suite runs both through actual HTTP processes plus isolated database tests.

First-contact fingerprints must be compared out of band or pinned from an already trusted channel. Static recipient keys provide no Signal-style forward secrecy. Malicious client code, endpoint compromise and privileged early release of prepared envelopes are outside ordinary encrypted-storage protection. Production, browser-interoperability and independent protocol review remain outstanding. Real Zcash remains a separate **blocked release gate**, documented with [current evidence](docs/evidence/zcash-testnet-v05.json).

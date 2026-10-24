# Gallery Arcana backend

A Node.js 22+, TypeScript, Fastify and PostgreSQL marketplace backend. API and wallet workers run separately. Development payments use an explicitly labelled durable mock wallet. **Real Zcash, mainnet and production custody remain disabled.**

The local workflow supports alias accounts, hashed passphrases, rotating/revocable sessions, seller-owned uploads and listing edits, public/unlisted discovery, private offers and counteroffers, atomic checkout, confirmation checks, encrypted delivery, private receipts, refunds and payout reconciliation. No frontend is included.

## Start locally

Use PostgreSQL 16, Node.js 22+ and npm. Native PostgreSQL on Ubuntu/WSL is supported; Docker is optional. Full native setup, key handling and separate service instructions are in [docs/OPERATIONS.md](docs/OPERATIONS.md).

```bash
npm ci
cp .env.example .env             # only if .env does not already exist
# Set DATABASE_URL and a persistent ASSET_ENCRYPTION_KEY in .env.
# Generate the key locally: openssl rand -hex 32
# Optional database alternative: docker compose up -d db
npm run migrate                 # checksummed, transactional and repeatable
npm run worker                  # terminal A
npm run api                     # terminal B
```

The API binds to loopback by default. `GET /api/health` reports process liveness; `GET /api/ready` checks schema, encryption-key presence, worker heartbeat and payment-destination availability. All mutations require `X-Arcana-Action: 1`; browser mutations also enforce the configured origin and fetch-site checks. Session cookies are HttpOnly and SameSite=Strict, and Secure when `PUBLIC_ORIGIN` uses HTTPS.

Copy `.env.worker.example` to `.env.worker` for worker-only options. The localhost payment simulator is disabled unless a strong `MOCK_SIMULATOR_TOKEN` is configured. It requires Bearer authentication and never submits blockchain transactions. Wallet spending credentials must not be placed in the API environment.

## Validate

```bash
npm test                        # unit/security/RPC-contract tests; DB suites explicitly skipped here
npm run test:integration         # creates, migrates and drops a separate PostgreSQL DB per test file
npm run typecheck
# Or: npm run test:all
```

The integration runner requires a local role with CREATEDB, or `TEST_DATABASE_ADMIN_URL` for a dedicated test role. It never truncates the application database. Tests cover the signup → private offer → acceptance → checkout → verified mock payment → receipt → file journey; authorization, concurrent checkout, expiry, partial/excess/late payments, output replay, reorganizations, worker crash/restart and payout reconciliation. See [docs/VALIDATION.md](docs/VALIDATION.md) for executed results and limits.

`npm run zallet:probe` diagnoses supported read-only wallet RPC contracts using optional `.env.worker` bindings. It cannot spend or enable real payments. Its bounded sample does not satisfy live testnet acceptance; see [docs/ZALLET_GAP.md](docs/ZALLET_GAP.md).

## Contracts and limitations

- [API routes](docs/API.md), [domain invariants and audit repairs](docs/INVARIANTS.md), [threat model](docs/THREAT_MODEL.md), [operations](docs/OPERATIONS.md).
- Offers are private through server access controls. The database/operator can read them; negotiation has no client encryption or E2EE claim.
- Private originals use AES-256-GCM at rest with authenticated file identifiers. The API operator holds the decryption key. Public previews are decoded and re-encoded with metadata removed; they remain public.
- Receipt codes are high-entropy bearer capabilities for downloads and refunds. Anyone possessing one can redeem it. The authenticated buyer can replace a paid order's receipt and invalidate the previous code.
- Unlisted URLs hide listings from search, but anyone with the URL can view their metadata.
- Rate limits are shared atomically through PostgreSQL. Limits do not make pseudonymous signup resistant to a distributed Sybil attack.
- Demo exchange rates are fixed and parsed entirely with integer arithmetic. They are unsuitable for accepting real funds.
- Reorganized settled payments and deposits arriving after settlement are frozen for manual review. Uncertain payouts are reconciled by durable submission ID and never blindly retried.
- Real wallet status is **blocked**: source/RPC-contract inspection is not live-chain validation. [docs/ZALLET_GAP.md](docs/ZALLET_GAP.md) records pinned investigation versions, exact blockers and the separate live-testnet acceptance gate.
- This backend provides no external NFT custody, atomic cross-chain settlement, dispute mediation, malware scanning, production key vault or audited backup system.

# Local operation (Ubuntu / WSL)

## Native PostgreSQL

On Ubuntu 24.04/WSL with PostgreSQL 16 packages available:

```bash
sudo apt update
sudo apt install postgresql-16 postgresql-contrib openssl
sudo service postgresql start
sudo -u postgres createuser --pwprompt --createdb arcana
sudo -u postgres createdb --owner=arcana arcana
```

Enter a local development password at the prompt, then set `DATABASE_URL` in the ignored `.env` file to match it. The CREATEDB privilege is for isolated local testing; the application itself does not need it. A dedicated test administrator can instead be supplied through `TEST_DATABASE_ADMIN_URL` for the test command. Ubuntu versions without PostgreSQL 16 in their default repositories need the official PostgreSQL package repository or an existing PostgreSQL 16 server.

Docker is an alternative, not a requirement:

```bash
docker compose up -d db
```

The included container binds Postgres to loopback and uses development-only credentials. Integration commands use PostgreSQL protocol connections and do not invoke Docker.

## Install and configure

```bash
npm ci
cp .env.example .env       # preserve an existing file
openssl rand -hex 32       # securely put the generated value in ASSET_ENCRYPTION_KEY
npm run keys              # once; preserve existing signing files
npm run migrate
npm run assets:backfill   # existing originals without fingerprints
```

Keep the encryption key stable and back it up securely together with storage. Losing it loses private originals. No setup script should regenerate an existing key. The API validates the encryption key and matching Ed25519 signing/verification files before listening. Signing private files must have no group/other permission bits; key generation refuses overwrite. Keep signing material backed up, and preserve public verification keys for old attestations. Files and directories use restrictive permissions. Original archive-format encrypted files remain readable; new files bind the storage key as GCM associated data.

Use `chmod 600 .env` after creating it. `.env`, `.env.worker`, dependency directories and asset storage are ignored by Git. Never put secrets in command output, logs or source control. `PUBLIC_ORIGIN` must be an exact origin; remote HTTP is rejected. HTTPS origins enable Secure cookies. Keep `trustProxy` disabled unless a specific trusted proxy configuration is implemented and verified.

## Separate processes

```bash
npm run worker            # terminal A; localhost worker port 8081
npm run api               # terminal B; localhost API port 8080
```

Both load shared development settings from `.env`; only the worker additionally loads `.env.worker`. The public API imports no wallet adapter and rejects a nonempty `ZALLET_RPC_PASS`, `ZCASH_SPENDING_KEY` or `WALLET_SEED` in its environment. For future custody deployment, use separate OS/database identities and a dedicated secret store; current development processes share a database identity and are not a production isolation boundary.

The worker holds an exclusive PostgreSQL advisory lock, schedules one payment cycle at a time, backs off failed cycles, and stores a heartbeat. Each process registers a new instance UUID after acquiring the lock; later heartbeat and shutdown updates require that UUID, preventing a draining predecessor from overwriting its replacement. Losing the lock connection drains the worker with exit code 1 and stops subsequent cycle stages. A cycle refreshes destinations, expires reservations, scans complete output snapshots and then handles payouts. Spending does not follow a failed scan. Funding new acquisitions does not queue seller payouts; buyer acceptance or explicit operator release is required. SIGINT/SIGTERM drain work and close listeners, database pools and worker locks. SIGKILL recovery uses persisted invoices, output observations and mock wallet state.

Liveness: `GET /api/health`. Readiness: `GET /api/ready`, which returns 503 if the current schema/key, recent ready worker heartbeat or free destination is missing. The worker has loopback `/health` and `/ready`. Readiness proves the local mock workflow only, not Zcash synchronization.

## Explicit mock simulator

Copy `.env.worker.example` to `.env.worker`. Add a generated 32-byte hex `MOCK_SIMULATOR_TOKEN`; leaving it unset disables simulation. Submit an invoice's address, integer `zat` string and exact memo to `POST http://127.0.0.1:8081/dev/pay`, using `Authorization: Bearer <local simulator token>` and JSON content type. Responses explicitly say `mode: mock`. Confirmation values come from the configured mock threshold; they are not chain evidence. Never expose the worker port publicly.

## Migrations and tests

`npm run migrate` serializes changes with an advisory lock and applies the original baseline plus ordered `db/migrations/*.sql` in a transaction. Applied SQL checksums are immutable. An intact original unversioned schema is adopted, then upgraded; an incomplete baseline fails instead of guessing. Migration 004 adopts legacy mock destination records; historical notes lost by the original in-memory simulator cannot be reconstructed and are never fabricated. Back up non-disposable databases before upgrades. Add a new migration for further schema changes.

Migrations 006/007 add private acquisition holds, immutable digest/payout snapshots and audited dispositions. Existing orders retain their original version-0 behavior; new orders use explicit buyer acceptance. Run `npm run assets:backfill` after migration before checking out legacy listings. This decrypts originals to fill missing fingerprints and refuses missing/corrupt files. Use the normal migration runner for both fresh and upgrade paths, not the archive's standalone upgrade script.

Migration 005 fences worker heartbeat ownership and invalidates the old readiness record. Stop existing API/worker processes, run migrations, then start both processes on the upgraded code. Keep the current schema and application version together.

```bash
npm test
npm run test:integration
npm run typecheck
```

The integration runner creates an unpredictable `arcana_test_*` database and private temporary storage per file, applies migrations twice, runs the tests and drops only that database. It preserves child exit status. No Docker dependency is required. A CREATEDB failure requires a test-role grant or an appropriate `TEST_DATABASE_ADMIN_URL`; do not grant broad permissions to a deployed API account. Interrupted test runners can leave disposable `arcana_test_*` databases; verify ownership and that no test process is active before removing them.

## Payout recovery and review

```bash
npm run payouts:reconcile
```

This worker-side command only records a found wallet submission whose destination and amount exactly match the durable payout UUID. It never resends `sending` payouts. A missing or unknown lookup remains unresolved: inspect wallet history independently before any manual recovery. `attempts` and privacy-safe failure codes remain auditable.

The optional `/api/admin/payouts/stuck` endpoint is disabled without a strong `ADMIN_TOKEN` and only accepts loopback connections, using constant-time secret comparison. Prefer the reconciliation command; the endpoint cannot spend or modify state and omits destinations, memos and transaction IDs.

Settled reorgs, changed confirmed totals or inconsistent output identities enter review. Queued payouts are cancelled, delivery is frozen for affected paid orders, and sending/sent payouts require reconciliation. There is deliberately no automatic "unfreeze" or ambiguous-send retry. These cases are a blocker to production custody until operator recovery is independently verified.

## Real-wallet infrastructure diagnosis

`npm run zallet:probe` performs supported read-only RPC checks through a loopback endpoint configured in `.env.worker`. It cannot generate addresses, create accounts, spend or enable real mode. See [ZALLET_GAP.md](ZALLET_GAP.md) for binding setup, exactly what is sampled and the live acceptance requirements. A passing probe is not a verified Zcash payment.

## Runnable mock acquisition demo

Configure the optional simulator as described above, then run `npm run demo:mock` from the checkout. It loads the shared/worker config, requires loopback mock/test services and the simulator token, creates two new demo identities and an unlisted original, negotiates an offer, funds the invoice through the mock, independently checks downloaded bytes/digest, confirms delivery and verifies the signed proof offline. It prints result flags, not credentials or invoice data. It creates application records and is not a blockchain transaction. Automated HTTP tests run it against their disposable database.

## Dispute operation

Admin dispute list/resolution require a strong `ADMIN_TOKEN`, direct loopback and `X-Admin-Token`, with the normal CSRF header on mutations. Keep all `/api/admin/*` routes out of external reverse-proxy routing; a proxy can make remote traffic appear loopback. Tokens provide shared operator authorization, not individual operator identity. Each successful release/refund has an immutable-kind/timestamp acquisition event, but there is no independent tamper-proof audit service. Review confidential reasons privately; release signs `operator_release`, refund queues all received funds. Concurrent/repeated decisions cannot allocate both ways. Payment-review orders require separate wallet reconciliation and cannot be resolved through this endpoint.

## v0.5 upgrade and client package

Stop old API/worker processes, preserve keys/backups, then run `npm ci`, `npm run crypto:build`, `npm run migrate`, and the existing legacy digest backfill. Migrations 008–010 add identities, ciphertext metadata/envelopes, conversations, reviewer evidence/append-only decisions, invitations, passport issuer history/revocation and independent control observations. Existing migrations and server-encrypted orders stay intact. New code must run against the latest schema; no real-wallet/mainnet flag is enabled by migration.

The root npm workspace builds `@gallery-arcana/client-crypto@1.0.0` to browser ESM/declarations. `npm run journey:capsule` exercises the local encrypted-product/conversation purchase and passport journey through the same optional authenticated mock simulator as `demo:mock`. It creates local records and prints result flags only. Real-browser interoperability is not established by Node tests; require independent review before deployment.

Use trusted-channel initial fingerprint comparison. Back up client identities with separate random recovery keys and retain old identities plus delivered key envelopes. The server cannot restore lost client keys. After rotation, create a new conversation; after recovery reset, counterparts must explicitly accept the new trust root. Purchased envelopes retain their original buyer key and routing association after financial cleanup.

## Passport issuer rotation and compromise

Run `npm run keys -- /secure/new-directory` to provision a separate pair without overwriting current material, then update `ATTESTATION_SIGNING_KEY_FILE`/`ATTESTATION_VERIFY_KEY_FILE` and restart the API. The API registers the new issuer and preserves public key history. Stop/revoke the compromised old issuer through the protected `/api/admin/passport-issuers/{keyId}/revoke` endpoint. A revoked current key makes readiness/new issuance/release fail closed until configured paths are rotated. Retain historical public keys independently. Offline signatures alone do not reveal revocation; counterparties need the online check plus fresh holder-possession nonce verification where appropriate. Existing v1 receipt proofs are historical and keep their legacy endpoint contract.

## Reviewer consent and retention

Assign a reviewer only on a disputed order. Participants must pin its public identity and submit selected encrypted evidence; an administrator cannot automatically obtain plaintext. Explicit reassignment (`replaceAssignment:true`) needs new participant encryption/consent and cannot revoke previously disclosed copies. Review evidence privately; the operator's release/refund remains an explicit custody decision. The decision hash list records submitted packages, not a certified review or legal finding. Hourly privacy cleanup removes expired evidence/conversations/invites/passports; run the worker and monitor cleanup failures. Purchased envelope routing/key history and append-only decisions have longer recovery/audit retention and are not anonymous.

## External control verifier operations

DNS TXT uses the host resolver. Public GitHub challenge retrieval uses only `raw.githubusercontent.com`, fixed main-branch paths, 4 KiB responses, five-second timeout and no redirects; inherited proxy and CA settings are preserved. A restricted environment must permit that hostname through its normal approved network configuration. No private repository credentials or OAuth scopes are requested. EVM EIP-191 signature control is local cryptographic verification and does not query chain state. Observation outages fail closed and do not establish asset control. See ASSET_CONTROL.md.

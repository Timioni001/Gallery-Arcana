# Executed validation — v0.4 integrated build

Executed on 2026-10-24 in Linux cloud: Node.js **22.23.4** and **24.19.0**, PostgreSQL **16.15**. The local PostgreSQL service uses the optional container; test scripts use PostgreSQL protocol connections only. Native Ubuntu/WSL setup is documented but a WSL host was not available to execute directly.

| Command/check | Executed result |
| --- | --- |
| Baseline `npm run test:all` before integration | Passed on the existing hardened v0.3 backend. |
| `npm install --package-lock-only --ignore-scripts` | Passed; version/scripts updated without adding dependencies. |
| `npm ci` | Passed, 79 packages. |
| `npm test` | 25 passed, 0 failed; 3 database entrypoints intentionally skipped in the database-free command. |
| `npm run test:integration` | Original journey: 1 pass. Marketplace/recovery: 26 subtests plus parent, 27 reported passes. Private acquisitions: 10 subtests plus parent, 11 reported passes. Total 37 scenarios / 39 reported passes, 0 failures/skips. |
| `npm run typecheck` | Passed, full TypeScript checking. |
| `npm run test:all` | Passed on Node 22.23.4 and 24.19.0. |
| `npm run keys` equivalent generation script | Created the ignored local Ed25519 pair; private file mode 0600. Existing material was not overwritten. |
| `npm run migrate` twice | Passed against the application database; checksummed migrations 001–007 current. Fresh/adopted schema, repetition and checksum rejection also tested. |
| `npm run assets:backfill` | Passed against the application database, 0 missing hashes. Integration fixture: 1 legacy original backfilled, second run 0, and checkout enabled only after backfill. |
| `npm run demo:mock` script | Executed by the real HTTP acceptance scenario against its isolated API/worker: upload, offer, funding, digest verification, explicit acceptance and offline proof verification passed. It does not submit blockchain transactions. |
| Updated cloud installer | Executed successfully: npm ci, preserved encryption/signing config, key validation, existing PostgreSQL readiness, migrations and digest backfill. Docker fallback was not needed. |
| `npm audit --omit=dev --audit-level=high` | Zero known production dependency vulnerabilities reported. Not a security certification. |
| `git diff --check` | Passed. |
| API/worker startup | Readiness returned 200 in mock/test mode with current schema/key configuration. |

## Coverage and isolation

Each database test file receives an unpredictable, separate `arcana_test_*` database and temporary private storage/key material. Migrations run twice before the file. Cleanup drops only that disposable database/storage and preserves failures. No tests were deleted to hide failures.

Retained marketplace coverage includes identity/session races and revocation; CSRF and IDOR rejection; owner revisions, unlisted/paused/search/pagination; offer/counter roles and stale versions; checkout contention and rollback; expired/partial/excess/late payments; duplicate/cross-invoice outputs and sync gates; payout claims, lost responses and refusal to resend unknown submissions; reorganization freezes; storage MIME/EXIF/traversal/symlinks; shared rate limits; migration adoption/checksums; metadata retention and worker recovery.

New acquisition coverage includes seller holds before acceptance, authenticated downloads, exact SHA-256, strict/private proof retrieval and offline Ed25519 verification, rejection of unsigned extra claims, concurrent acceptance/dispute/refund/release, confidential dispute access, full excess-inclusive refunds, operator/buyer outcome distinction, rollback on missing signing keys, immutable digest/payout snapshots despite listing/fee changes, funded/disputed reorganization freezes, private-key permissions/public-key mismatch, legacy settlement without invented proofs, and safe idempotent original backfill. Resolved acquisition refunds remove dispute reasons after retention; settled late-payment refunds also lose buyer/payment links. Unresolved holds are retained.

The real HTTP scenario starts separate API/worker processes, terminates the advisory-lock connection (exit 1), verifies replacement ownership/readiness, and exercises the full offer-to-file-acceptance journey through a SIGKILL/restart after durable mock receive. It executes the demo script too, checks private response/log boundaries and graceful exit 0. These are actual HTTP/process/database tests with mock payments, not blockchain tests.

During integration, PostgreSQL caught inconsistent timestamp parameter inference; explicit casts repaired it. The adapted HTTP journey initially omitted the now-required buyer cookie on a later download; the request was corrected. Key tests also caught private PEM misuse in the public verification configuration; public-key validation/export now rejects it. The final complete runs pass.

## Separate live acceptance gate

Real Zcash remains blocked and disabled. Earlier read-only configured RPC evidence was `ECONNREFUSED`/redacted `UNAVAILABLE`; no executable/node/account/funded synchronized testnet infrastructure was available. Official pinned source and synthetic response/transport contracts do not establish deployed binary interoperability, full-chain history, real receives, payouts or reorg recovery. Current probe evidence and prerequisites are in [ZALLET_GAP.md](ZALLET_GAP.md).

GitHub CI is configured for Node 22/24 and PostgreSQL 16.15 with SHA-pinned actions; hosted results are separate from these local runs. Production custody, fresh FX, independent security review, per-operator authentication, key-history/revocation and tested backup/vault recovery remain outstanding. The complete available inventory is [CAPABILITIES.md](CAPABILITIES.md).

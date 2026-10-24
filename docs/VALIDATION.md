# Executed validation

Complete runs: Node.js **22.23.4** and **24.19.0**, PostgreSQL **16.15**, Linux cloud environment, 2026-10-24. PostgreSQL in this instance is supplied by the optional local container; the test runner itself uses only PostgreSQL protocol connections and does not require Docker. Ubuntu/WSL native setup is documented, but a WSL host was not available for direct execution.

| Command | Final result |
| --- | --- |
| `npm install` | Passed at baseline; subsequent declared dependencies were installed normally with verification enabled. |
| `npm ci` | Passed from package-lock.json under Node 22.23.4. |
| `npm test` | 21 passed, 0 failed. Two database test entrypoints intentionally skipped in this database-free command. |
| `npm run test:integration` | Original journey: 1 passed. Expanded file: 26 acceptance subtests plus its parent, 27 reported passes. Total: 28 reported passes, 0 failed/skipped, representing 27 integration scenarios. Each file uses a separate disposable PostgreSQL database/storage directory. |
| `npm run typecheck` | Passed. |
| `npm run test:all` | Passed under Node 22.23.4 and 24.19.0. Executes unit/security tests, isolated PostgreSQL tests and typecheck. |
| `npm run migrate` repeated | Both runs passed against the application database; checksummed migrations 001–005 current. Fresh install, repetition, checksum tampering and original unversioned-schema adoption also exercised by the database suite. |
| `npm audit --omit=dev --audit-level=high` | Zero known vulnerabilities reported after upgrading the vulnerable Zod dependency to 4.6.7. This is a dependency advisory check, not a security certification. |
| `git diff --check` | Passed. |
| API/worker smoke startup | API health/ready and worker ready returned 200 with mock/test readiness after the current application migrations. |
| `npm run payouts:reconcile` | Passed on the application database; no unresolved submissions. |
| `node --import tsx --test test/zalletProbe.test.ts` | 8 passed against local synthetic JSON-RPC contracts/servers; no blockchain activity. |
| `npm run zallet:probe` | Expected blocked result, exit 1, redacted `UNAVAILABLE` code against the configured local endpoint. No live settlement claim. |
| GitHub workflow | Added SHA-pinned checkout/setup actions and Node 22/24 + PostgreSQL 16.15 matrix; YAML parsed locally. Hosted execution is separate from the local results above. |

## Database acceptance coverage

The original tests are retained. Expanded tests verify session rotation races/expiry/revocation, including a blocked rotation racing revoke-all; replacement-worker heartbeat ownership; CSRF and default-admin rejection; seller edits and stale revisions; unlisted/paused visibility, filtering and pagination; offer/counter roles and stale-counter rejection; private order/payment/sale responses; receipt replacement and authorized download; ciphertext at rest; two-buyer checkout races; transactional rollback after invoice-quote failure; stale reservation recovery and delayed deposits; expired underpayments and excess refunds; repeated/duplicate/cross-invoice output observations; synchronization refusal; concurrent payout claims; deterministic reorganization freezes; lost-send-response reconciliation; refusal to retry unknown submissions; image decoding/metadata stripping, traversal/symlinks; shared rate limits; migration repetition/checksums/adoption; and metadata retention, including removal of completed mock submission destinations/transaction IDs.

The HTTP acceptance scenario launches separate real API and worker processes against the isolated database. It terminates the worker's advisory-lock connection, verifies exit code 1/readiness failure, and starts a replacement with a new instance UUID. It then signs up seller and buyer, uploads the original, creates a listing, makes and accepts a private offer, checks out, authenticates to the mock simulator, kills the worker after its durable receive acknowledgement, restarts it, verifies payment/payout state, issues a private receipt and downloads the original over HTTP. SIGTERM shutdown of both processes completes with exit code 0. Logs are checked for simulator/session-token and invoice-memo leakage.

## Diagnosed baseline failures and limits

The initial `npm run migrate` failed with `relation settings already exists`; the versioned migration runner repairs this. Initial units/typecheck and the original database journey passed. New harness issues encountered during implementation were repaired; no failing tests were deleted or assertions disabled.

Live Zcash acceptance is **blocked**. The read-only configured Zallet RPC probe returned `ECONNREFUSED`; binaries, persistent wallet/account configuration, synchronization and funded testnet transactions were unavailable. Official tagged documentation/source and synthetic RPC-contract fixtures were inspected/tested. No genuine shielded receive, payout, blockchain reorganization, binary interoperability or live wallet restart recovery is claimed.

Review states deliberately require operator reconciliation. No automatic unfreeze or ambiguous payout retry is enabled. Production custody, live quote feeds, vault/backup recovery, external security review and malware scanning remain outside the verified local workflow. See ZALLET_GAP.md, INVARIANTS.md and THREAT_MODEL.md.

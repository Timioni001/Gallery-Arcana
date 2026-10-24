# Executed validation — v0.5 private commerce

Executed 2026-10-24 on Linux cloud, Node **22.23.4** and **24.19.0**, PostgreSQL **16.15**. PostgreSQL is supplied here by the optional container; scripts use PostgreSQL protocol connections and do not require Docker. Native Ubuntu/WSL instructions remain, but an actual WSL host was unavailable.

## Baseline and complete runs

The unchanged v0.4 baseline at `a04aa5e` passed `npm run test:all`: 25 unit/security/RPC tests and 37 integration scenarios. Existing tests were retained; none were removed or disabled to conceal failures.

| Executed command / check | Actual result |
| --- | --- |
| `npm ci` | Passed, 92 packages, pinned root lockfile/workspace dependencies. |
| `npm run crypto:build` | Passed; separate DOM/WebCrypto browser-target ESM/declarations build. |
| `npm test` | 29 passed, 0 failed; 4 database entrypoints deliberately skipped here and executed by the isolated DB runner. |
| `npm run test:integration` | Original journey 1; private acquisitions 10 subtests + parent (11 reported); marketplace/recovery 26 + parent (27); v0.5 privacy/trading/control 10 + parent (11). Total 47 scenarios / 50 reported passes, 0 failures/skips. |
| `npm run typecheck` | Passed for services, scripts, tests and client package source. |
| `npm run test:all` | Passed on Node 22.23.4 and 24.19.0, including SDK build and all unit/database/process checks. |
| Compiled SDK consumer | Imported `@gallery-arcana/client-crypto` through its compiled ESM export, encrypted/decrypted bytes successfully; added as a GitHub CI step. |
| `npm pack --workspace=@gallery-arcana/client-crypto` | Passed; local SDK archive contains the compiled ESM, type declarations, package metadata and README. No registry publication. |
| `npm run migrate` twice | Passed on application database, migrations 001–010 current. Fresh schema, baseline adoption, repeatability and checksum rejection also exercised by DB tests. |
| Final API/worker startup and readiness | Passed on Node 22 after regression tests: root reports 0.5.0, `/api/ready` and worker `/ready` return 200 in explicitly mock/test mode. |
| `npm run payouts:reconcile` | Passed on the application database; mock mode, no unresolved submissions. Not live-chain reconciliation evidence. |
| `npm audit --omit=dev --audit-level=high` | Zero known production dependency vulnerabilities reported. Not a security/protocol certification. |
| `git diff --check` | Passed. |
| GitHub workflow | YAML parsed, SHA-pinned actions and Node 22/24 + PostgreSQL matrix retained; SDK package-consumer check added. Same local commands pass. |
| `gh run list --repo Timioni001/Gallery-Arcana ...` | GitHub API returned `Forbidden`; hosted Actions outcomes could not be inspected. No hosted success is claimed. |
| `npm run zallet:probe` | Exit 1, redacted `UNAVAILABLE`, live payments false. Official Zallet tag and peeled Zebra commit rechecked; no blockchain transaction evidence. |

## New security and journey coverage

- Client AES-GCM chunks: wrong keys, changed metadata/header/length/order, truncation and distinct fresh keys; HPKE signatures, wrong recipient/pins/context/origin, expiration and encrypted recovery backup restoration/wrong recovery key.
- Encrypted registration challenge, authenticated account binding, replay rejection, old-key rotation signature, timestamp-inverted history with monotonic revisions and explicit recovery continuity break.
- Capsule upload/owned listing, encrypted conversation/offer, prepared buyer envelope, checkout refusal without current preparation, denied pre-funding/outsider envelope access, durable mock funding, local-only decryption/integrity, explicit buyer acceptance, signed proof and exact-once payout authorization.
- Encrypted dual-recipient conversations/attachments, sender authentication, UUID replay/injection/membership rejection, expiry/deletion and no plaintext in persisted messages.
- Reviewer-only consent-based encrypted evidence, ciphertext tampering rejection, operator-without-reviewer denial and application append-only decision records.
- Private invitation recipient/body-capability checks, public metadata gating, immutable price, expiration/revocation and one successful concurrent redemption. Losers can fail initial inspection (404) or the later locked checkout state (409).
- Minimal Trade Passport facts, omitted transaction identifiers, audience/holder binding and fresh-nonce presentation, expiry/owner revocation, issuer rotation/history/compromise and payment-review revocation.
- EVM EIP-191 local key signatures, nonce/expiry/recipient/replay controls; synthetic DNS TXT/GitHub marker observations and invalid target rejection. No live domain/repository control or EVM transaction is claimed.

Each integration file owns a separate disposable database and storage/key directory. Test cleanup drops only that generated database/storage. The existing real HTTP scenario terminates a wallet-lock connection, checks failure exit/replacement ownership, kills/restarts a worker after durable mock receive, verifies delivery/payout and graceful shutdown. It executes both `scripts/demo-mock.ts` and `scripts/journey-capsule.ts` as separate client processes against the API/worker; the latter verifies encrypted negotiation, local capsule decryption and passport/holder proofs. Logs/utility output are checked for simulator/session/invoice-secret leakage. These are actual HTTP/process/PostgreSQL journeys using mock payment observations.

## Limits and separate acceptance gates

No actual browser runtime/interoperability test or independent crypto/application audit was available; DOM compilation and Node WebCrypto execution are not substitutes. External DNS/GitHub observation success used injected test transports, not fabricated live claims. Hosted CI observation was forbidden. No genuine Zcash receive, payout, refund, blockchain reorganization, wallet binary interoperability or funded restart test is verified. See evidence/zcash-testnet-v05.json and ZALLET_GAP.md.

The internal review/remediations and residual risks are documented in V05_AUDIT.md and THREAT_MODEL.md. Production custody, real-wallet spending isolation, fresh FX, per-operator identities, key vault/backup restore and monitoring/load/security acceptance remain outstanding. CAPSULE metadata/routing is not anonymous or entirely erased by financial retention; no legal ownership, ZK, Signal-style forward secrecy or unlinkability claim is made.

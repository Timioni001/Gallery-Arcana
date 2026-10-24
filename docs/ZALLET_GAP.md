# Real Zcash acceptance gate: blocked

The public application can run only `WALLET_DRIVER=mock`, `ZCASH_NETWORK=test` and non-production mode. No mainnet or real-money acceptance is enabled. The old executable reference driver has been replaced by an unconditional gate: it used an unsupported receive RPC, recreated accounts in memory and converted amounts through floating point.

## Official source inspection and investigation pins

[docs/zcash-versions.json](zcash-versions.json) pins Zallet `v0.1.0-beta.3` at `987382f67e622915228686e9f956c6a9c9a7514c` and Zebra `v6.2.3` at `7121c82ba6795a151523d5b308a19743f4a1ade7`. The Zallet backend lockfile and Zebra tagged manifests agree on `zebra-rpc 15.0.0` and `zebra-state 12.0.1`. This establishes a source-compatible investigation cohort, **not verified binary interoperability**. The wallet backend requires Rust 1.95, a co-located Zebra built with `indexer`, configured gRPC indexer access and a matching state-cache format.

Inspected official references:

- [Zallet tagged RPC methods](https://github.com/zcash/zallet/blob/987382f67e622915228686e9f956c6a9c9a7514c/book/src/rpc/methods.md)
- [Altered JSON-RPC semantics](https://github.com/zcash/zallet/blob/987382f67e622915228686e9f956c6a9c9a7514c/book/src/zcashd/json_rpc.md)
- [Zallet backend setup](https://github.com/zcash/zallet/blob/987382f67e622915228686e9f956c6a9c9a7514c/book/src/guide/setup.md)
- [View-transaction response source](https://github.com/zcash/zallet/blob/987382f67e622915228686e9f956c6a9c9a7514c/zallet-core/src/components/json_rpc/methods/view_transaction.rs)
- [Zallet backend lockfile](https://github.com/zcash/zallet/blob/987382f67e622915228686e9f956c6a9c9a7514c/backends/zebra/Cargo.lock)
- [Pinned Zebra RPC manifest](https://github.com/ZcashFoundation/zebra/blob/7121c82ba6795a151523d5b308a19743f4a1ade7/zebra-rpc/Cargo.toml) and [state manifest](https://github.com/ZcashFoundation/zebra/blob/7121c82ba6795a151523d5b308a19743f4a1ade7/zebra-state/Cargo.toml)
- [ZIP-321](https://zips.z.cash/zip-0321)

The hosted Zallet documentation destination returned an access denial in this environment; the corresponding official tagged documentation and implementation were inspected through GitHub instead.

## Supported RPC evidence

- `z_getnewaccount` takes an account name and supports persistent account UUID identity. Account creation must be an explicit one-time provisioning step, not a worker-start action.
- `z_getaddressforaccount` accepts an account UUID. Defaults can add a transparent receiver. Explicit receiver types such as `["orchard"]`, persisted diversifier selection and `z_listunifiedreceivers` validation must be verified against the running release.
- `z_listunspent` returns `valueZat`, pool/outindex, account UUID, address and memo, but its unified-account address filter can return notes for other diversifiers. It omits spent outputs, so it cannot serve as the complete receipt history by itself.
- `z_listtransactions` plus `z_viewtransaction` can supply transaction discovery and per-output detail. `z_viewtransaction` includes output pool/index, account UUID, address, `walletInternal`, outgoing direction, integer `valueZat`, memo, transaction status, confirmations and block hash. A correct scanner must persist discovery cursors/tx identities and re-read known transactions, including spent notes and reorganizations.
- `z_sendmany` supports `FullPrivacy`, asynchronous operation lookup, multiple resulting `txids` and a `broadcast` result flag. Operation success does not prove broadcast when broadcasting is disabled. A real submission/reconciliation key must survive worker crashes before any retry is considered.
- `getwalletstatus` reports `locked`, node/wallet tips and fully scanned height. The pinned implementation of `getwalletinfo` is still a TODO returning placeholder version/balances; those fields cannot establish binary identity, synchronization or payment.

`src/wallet/zalletNotes.ts` implements an offline normalizer for the supported `z_viewtransaction` response contract: exact account/address/memo matching, integer zatoshis, stable Orchard action identity, internal/outgoing exclusion and conservative rejection of transparent/mixed pools. Synthetic contract fixtures test it. It performs no RPC calls and is not a live adapter or whole-transaction privacy proof.

## Read-only infrastructure probe

`npm run zallet:probe` loads worker-only configuration and uses `src/wallet/zalletProbe.ts`. Configure a loopback `ZALLET_RPC_URL`, optional paired `ZALLET_RPC_USER`/`ZALLET_RPC_PASS`, and an already-provisioned `ZALLET_ACCOUNT_ID`/`ZALLET_RECEIVE_ADDRESS` in `.env.worker`. No account or address is generated. Without a binding it checks synchronization only and exits nonzero.

The transport permits only five supported read methods, enforces response/request IDs, a 5-second deadline and 1 MiB response limit, refuses redirects and remote endpoints, and never retries. The probe checks sync lock, matching tip heights/hashes and fully scanned height; exact persistent account/known-address binding; Orchard-only receiver decoding; up to five historical transaction summaries and corresponding view contracts; and an unchanged synchronized tip afterward. It never uses balance deltas. Output contains flags/counts and redacted failure codes, excluding account IDs, addresses, transaction IDs, memos, credentials and remote error text.

Exit zero means only that this bounded diagnostic passed. It does **not** establish complete history, snapshot consistency, independent network verification, deployed binary identity, whole-transaction privacy or live settlement. The probe cannot return settlement observations to the worker, and real-wallet configuration remains rejected. Tests use a local synthetic JSON-RPC server, including authentication, malformed responses, response limits, timeouts, redirects, incorrect binding and chain changes. They are not blockchain tests.

## Current environment evidence

Neither a Zallet nor a Zebra executable is available. No configured persistent account binding or RPC credential binding was present. A read-only `getwalletinfo` request through the existing local RPC configuration returned `ECONNREFUSED`. No synced testnet wallet, genuine shielded transaction, funded testnet account, live payout or blockchain restart/reorg behavior has been verified. No mainnet authorization was supplied.

## Required before enabling real testnet mode

1. Build and run the pinned cohort with verified artifacts, testnet chain parameters and matching backend state/indexer configuration. Verify RPC schemas against those actual binaries, synchronization and chain-tip readiness.
2. Provision and back up an encrypted persistent wallet account, record its UUID, validate shielded-only receiving addresses/receiver types and retain unique invoice attribution across diversified addresses.
3. Implement complete historical discovery with durable cursors and exact outputs, including spent notes, snapshots at a coherent chain tip, missed blocks, restart and reorg recovery. Verify memo bytes and receiver normalization using genuine transactions; never use account balances or address filters alone.
4. Verify raw whole-transaction shielded privacy, confirmation policy, invoice expiry/late behavior, partial/excess handling and negative attribution with genuine fully shielded testnet transfers.
5. Prove payout/refund submission, operation IDs, broadcast status, multi-tx results and exact destination/value reconciliation after lost responses/crashes. Unknown results must remain manual; the database UUID used by the mock is not a verified Zallet idempotency feature.
6. Replace the fixed demo FX quote with an integer, fresh, failure-aware quote source. Add independently verified vault/seed backup recovery, process/database identities, custody review and operator resolution procedures.
7. Run the full live testnet acceptance journey and retain real transaction/operation evidence privately. Mock unit/integration results cannot satisfy this gate.

Mainnet and production custody require separate explicit authorization and security verification after these prerequisites.

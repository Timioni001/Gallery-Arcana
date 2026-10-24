# Real Zcash/Zallet wallet integration: deliberately gated

The old `src/wallet/zallet.ts` used `z_listreceivedbyaddress`, a method NOT found in the current Zallet generated RPC catalogue. The driver is retained for technical exploration but intentionally NOT loadable through `src/wallet/index.ts`.

Official documentation:
- https://zcash.github.io/zallet/rpc/index.html
- https://zcash.github.io/zallet/zcashd/json_rpc.html
- https://zips.z.cash/zip-0321

## Requirements before enabling real testnet payments

1. Pin Zallet version, connect to Zebra on Zcash testnet, and confirm wallet sync readiness; back up seeds and restrict RPC to localhost.
2. Implement a durable wallet account ID, avoid calling `z_getnewaccount` on every worker restart. Generate shielded-only receiving addresses. Unified addresses may include transparent receivers when using default `z_getaddressforaccount` arguments; request only approved shielded receiver types and verify response.
3. Implement an exact per-checkout receipt scanner. Current Zallet supports `z_listunspent`, but for Unified Accounts its address filter can include **all** notes for the account independent of the diversifier. Therefore matching just on an address string or aggregated account balance is UNSAFE. Verify memo and per-output attribution with a pinned supported API and unique invoice tokens; account for spent notes and note IDs.
4. Verify values in integer zatoshis, never float-derived money values; handle reorgs, partial payment, duplicate notes, overpayment, expiration, and long-delayed deposits.
5. Enforce the appropriate network and shielded-only receiver validation. A prefix regex is not sufficient. ZIP-321 payment URI encodes memo as base64url without padding, and ZEC amounts with at most 8 decimal places.
6. Payout from wallet through a protocol-supported and testnet-verified call with a strict FullPrivacy policy. Reconcile ambiguous send outcomes before retrying; protect against double-payout.
7. Replace demo fixed USD/ZEC exchange rate with a verifiable price feed with freshness, spread, failure handling, and rate expiry.
8. Run full local Postgres and live testnet integration tests: two users, three offers, checkout, actual shielded ZEC receive, multiple confirmations, delivery, payout, late payment, refund, and worker restart.
9. Complete production controls: vault or HSM key custody, least-privilege RPC, anti-abuse, transaction monitoring, security review, backups, data-retention policy, legal review and dispute resolution.

**Current status:** mock transaction paths only. The real-wallet adapter must be built and validated before any funds are accepted. Mainnet and production remain blocked in `src/config.ts`.

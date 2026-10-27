# Settlement evidence

Gallery Arcana can settle in four modes. Evidence is only ever claimed for the mode that produced it.

| Mode | Value-bearing | Chain | How to produce evidence |
| --- | --- | --- | --- |
| Mock wallet | No | None. A database ledger stands in for the wallet. | `npm run test:integration` (results in [VALIDATION.md](VALIDATION.md)) |
| Hosted demo | No | None. The API runs in the browser. | Not evidence of settlement; a product demo only |
| Local regtest | No | Private chain, real Zebra + Zallet binaries | **Verified 2026-10-27**: [settlement-regtest-2026-10-27T23-55-54-663Z.json](evidence/settlement-regtest-2026-10-27T23-55-54-663Z.json) |
| Public testnet | No (testnet ZEC) | Public Zcash testnet | In progress; see [TESTNET_RUNBOOK.md](TESTNET_RUNBOOK.md) |

Mainnet is disabled.

## Producing local-regtest evidence

Follow [REGTEST.md](REGTEST.md) to start the Zcash Foundation Z3 regtest stack and run `setup` and `fund`. Start the API and worker with `WALLET_DRIVER=zallet` and `ZCASH_NETWORK=regtest`, then:

```bash
npm run regtest -- journey
```

The journey drives one complete purchase through the running API and worker:

1. A seller lists a file and a buyer checks out.
2. The buyer pays the invoice from Zallet with a shielded `z_sendmany` carrying the invoice memo.
3. Blocks are mined until the worker marks the order `funded`.
4. The buyer downloads the file and its SHA-256 is checked against the listing.
5. The buyer accepts; the worker sends the seller payout.

It then reads back what the worker recorded, not what the script sent, and writes `docs/evidence/settlement-regtest-<timestamp>.json`:

| Field | Meaning |
| --- | --- |
| `settlementMode` | Always `local-regtest`, with `notPublicTestnet: true` and `valueBearing: false` |
| `chain` | Zebra chain name and tip height, Zallet's synced tip |
| `invoice` | Order ID, invoice address, memo, expected and received zatoshis |
| `buyerPayment` | The buyer's transaction IDs and the notes the worker observed for this invoice |
| `delivery` | The file fingerprint and that the downloaded bytes matched it |
| `escrow` | Funded, release-deadline and paid timestamps, final status and the signed proof outcome |
| `sellerPayout` | Payout records with transaction IDs, and the seller's balance increase |
| `verified` | `true` only if the order is `paid`, the observed note matches the buyer's txid, and the seller payout was sent with a txid |

The command exits non-zero if `verified` is false. Commit the file to `docs/evidence/` to publish it.

## Verified run — 2026-10-27

Environment: Zcash Foundation Z3 regtest stack in Docker, `zfnd/zebra:6.2.3` and `zodlinc/zallet:v0.1.0-beta.1` (digest `sha256:1849b446…`), network upgrades through NU6.3 active, Gallery Arcana API and worker with `WALLET_DRIVER=zallet` on a fresh database. Zebra reports regtest's chain name as `test`; the activation heights and the `uregtest` addresses identify it as regtest.

| Step | Result |
| --- | --- |
| Invoice | 12,500,000 zat (0.125 ZEC) to a fresh `uregtest1…` address with memo `GA-SV76-…` |
| Buyer payment | `796661ddbdcc9e30b87088ad23cf3ef2fe0c46dd29717d498988817f88e6c066` (shielded Action pool to shielded Action pool) |
| Funding | Worker matched address, memo and exact value; 6 confirmations observed; order `funded` |
| Delivery | File downloaded, SHA-256 matched the checkout snapshot; release on verification (`buyer_accepted`) |
| Seller payout | `5240770fc148faf7ca32a117114194e930b487ba03e09c6292c6cbc37b66df80`, 12,500,000 zat, recorded `sent` only after the transaction was mined and its output verified |
| Evidence | [settlement-regtest-2026-10-27T23-55-54-663Z.json](evidence/settlement-regtest-2026-10-27T23-55-54-663Z.json), `verified: true` |

### Contract differences found and fixed

Running against the real binaries surfaced three differences that mocks hadn't, plus one quirk of the regtest setup. Each is fixed and covered by an integration test.

1. **Pool name.** With NU6.3 active, Zallet reports shielded Action outputs to Orchard receivers under the pool name `ironwood`. The adapter now treats `orchard` and `ironwood` as the shielded Action pools for funding and balances.
2. **`locked` omitted.** `getwalletstatus` no longer includes `locked`. It is now optional; a locked wallet still rejects `z_sendmany`, which requeues the payout.
3. **`broadcast` omitted.** Completed `z_sendmany` operations no longer include `broadcast`. When it's absent, a payout counts as sent only after its transaction is mined and the exact output is verified.
4. **Same-wallet payee (regtest only).** In this setup the seller's account lives in the same Zallet wallet as the merchant, so the payout output is labelled incoming to the seller's account rather than `outgoing`. Payout verification accepts that case only when the output belongs to a different account than the merchant's and pays the exact address and amount.

In an earlier run, before fix 3 and a related same-wallet labelling case, the seller's payout was confirmed on chain but the adapter could not verify it, so it **held the payout for manual reconciliation instead of resending** — the intended safety behaviour. That run's evidence was superseded by the verified run above.

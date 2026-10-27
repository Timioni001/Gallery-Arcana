# Settlement evidence

Gallery Arcana can settle in four modes. Evidence is only ever claimed for the mode that produced it.

| Mode | Value-bearing | Chain | How to produce evidence |
| --- | --- | --- | --- |
| Mock wallet | No | None. A database ledger stands in for the wallet. | `npm run test:integration` (results in [VALIDATION.md](VALIDATION.md)) |
| Hosted demo | No | None. The API runs in the browser. | Not evidence of settlement; a product demo only |
| Local regtest | No | Private chain, real Zebra + Zallet binaries | `npm run regtest -- journey` (below) |
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

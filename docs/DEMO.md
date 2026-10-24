# Hackathon demonstration script

This script shows one private digital acquisition with three parties: a **seller**, a **buyer** and an **unrelated observer**. It labels every step as **MOCK** or **LIVE**. While the Zcash testnet gate is blocked (see [ZALLET_GAP.md](ZALLET_GAP.md) and [TESTNET_RUNBOOK.md](TESTNET_RUNBOOK.md)), payment steps are MOCK and the nav badge says so.

## Setup (Ubuntu / WSL)

```bash
npm run setup:wsl     # once
npm run dev           # worker + API + web on http://localhost:5173
```

Use three browser profiles, or one normal window and two private windows: Seller, Buyer and Observer.

## Script

| # | Who | Action | What it proves | Mode |
| --- | --- | --- | --- | --- |
| 1 | Seller | Create an alias, then go to Studio → Keys → **Create my keys** → **Download backup** | Pseudonymous account. Private keys are generated on the device, and recovery is held offline. | local |
| 2 | Seller | Studio → Settings: enter a testnet payout address. Then **New listing** with Protection **Arcana Capsule** and a file. | The file is encrypted in the browser. The server stores ciphertext only. | local |
| 3 | Observer | Open `/observer` | Listings are public. Offers, orders, sales, files and receipts are refused (401/404). | live API |
| 4 | Buyer | Create an alias and keys. On the listing, click **Message privately** and send a question. | End-to-end encrypted negotiation. The operator sees only that a message exists. | local |
| 5 | Buyer | **Request to buy** | A confidential offer. There's no public bidding history. | live API |
| 6 | Seller | Studio → Offers → **Seal key & accept**. Compare the fingerprint and trust it. | The content key is sealed to this buyer's key only. | local |
| 7 | Buyer | **Checkout** | Unique invoice, ZIP-321 request and integer zatoshi quote | live API |
| 8 | Operator | `npm run mock:pay -- <memo>` | Funds the invoice through the simulator. **This is not a blockchain transaction.** | **MOCK** |
| 9 | Buyer | **Decrypt locally & verify** | The key is released only after funding. The ciphertext hash and the seller's signature are checked, and the file is decrypted locally. | local |
| 10 | Buyer | **Accept delivery**, then **Fetch & verify** the signed receipt | Buyer-controlled release. The Ed25519 receipt is verified. | live API |
| 11 | Buyer → Observer | Studio → Proofs: issue a Trade Passport for audience `demo`. The Observer opens `/verify`, shares the nonce, and the Buyer signs it. | Selective disclosure. The holder is bound to the passport, with no history exposed. | live API |
| 12 | Observer | Run `/observer` again | Still sees nothing about the trade. The listing shows only that it is sold. | live API |

## What the platform still handles (say this out loud)

- The operator can see prices, offer amounts, order states and timestamps, which settlement needs.
- Shielded ZEC protects onchain payment details. It doesn't anonymize application metadata or external asset transfers.
- Receipts and passports prove platform facts. They do not prove legal title.

## Automated version

`npm run e2e` in `web/` runs steps 1–11 and the private-invitation, dispute-evidence and vault-restore journeys in headless Chromium against your running services.

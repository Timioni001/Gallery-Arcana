# Verify the live adapter on local regtest (no node sync)

Regtest is a private Zcash network on your machine. Blocks are mined on demand and the coins have no value. It runs the **real** Zebra and Zallet binaries from the Zcash Foundation [Z3](https://github.com/ZcashFoundation/z3) Docker stack, so it shows that the Zallet adapter interoperates with them. The brief still requires a public **testnet** demonstration afterwards (see [TESTNET_RUNBOOK.md](TESTNET_RUNBOOK.md)).

## 1. Start Z3 regtest

```bash
sudo apt install -y docker.io docker-compose-v2 git openssl   # or Docker Desktop with WSL integration
sudo usermod -aG docker $USER                                 # reopen the terminal afterwards
git clone https://github.com/ZcashFoundation/z3 ~/z3 && cd ~/z3
./scripts/regtest-init.sh
docker compose --env-file .env.regtest up -d
```

Endpoints are Zebra RPC `http://127.0.0.1:29232` and Zallet RPC `http://127.0.0.1:50232`. Z3 uses the regtest credentials `zebra` / `zebra` unless you set `Z3_REGTEST_RPC_ROUTER_PASSWORD`. Confirm the Zallet RPC user with `grep -n -B2 -A3 pwhash ~/z3/config/regtest/zallet.toml`.

## 2. Point the app at it

In the repository, add to `.env.worker`:

```bash
ZALLET_RPC_URL=http://127.0.0.1:50232
ZALLET_RPC_USER=zebra
ZALLET_RPC_PASS=zebra
```

Then run:

```bash
npm run regtest -- status    # Zebra height and Zallet sync status
npm run regtest -- setup     # creates merchant / buyer / seller accounts and prints the next steps
```

`setup` prints the exact lines to add to `.env.worker` (merchant account and address) and `.env` (`WALLET_DRIVER=zallet`, `ZCASH_NETWORK=regtest`, `PRICE_SOURCE=fixed` and the acknowledgement). It also prints the buyer's transparent address for Zebra's miner. Find the miner setting with `grep -rn miner_address ~/z3/config/regtest/`, set it to that address, and restart Zebra (`docker compose --env-file .env.regtest restart zebra`).

## 3. Fund and run the journey

```bash
npm run regtest -- fund      # mines 110 blocks, shields the coinbase to the buyer, sends the merchant a 1 ZEC fee float
npm run migrate
npm run dev                  # API + worker + web, now on regtest with the Zallet adapter
npm run regtest -- journey   # in a second terminal
```

The journey runs a real flow through the API and worker, with every payment made by Zallet:

1. Sign up a seller and a buyer, and list a file.
2. The buyer checks out, and the buyer account pays the invoice with `z_sendmany`.
3. Mine blocks until the worker funds the order.
4. Verify the file and approve.
5. Wait for the worker to pay the seller account through the adapter.

The summary includes the payment txids and the amount the seller received. You can also buy through the browser at http://localhost:5173. The badge reads "Local regtest · real Zallet, no value".

## If something fails

- **`Zallet … failed (RPC_REJECTED)` on setup:** check the RPC user and password. If `z_getaddressforaccount` is refused because the seed backup is unconfirmed, follow the Zallet message to confirm the mnemonic backup, then rerun `setup`.
- **`fund` shield fails:** the coinbase is immature or went elsewhere. Check that Zebra's miner address matches the one `setup` printed, then rerun `fund 110`.
- **Journey times out at funding:** check the worker log for `zallet_scan_discarded` or scan errors, and run `npm run admin -- disputes` and `npm run admin -- submissions`.
- Send the full output to Claude. Real-binary mismatches are exactly what this step is meant to find.

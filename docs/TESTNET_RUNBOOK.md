# Zcash testnet runbook (Ubuntu / WSL)

**Priority 1** in the brief is verified Zcash testnet settlement. It needs a synced Zebra node and a Zallet wallet running on a machine you control. Real-wallet mode stays disabled in the app until the gate in [ZALLET_GAP.md](ZALLET_GAP.md) passes. This runbook gets the infrastructure ready and produces the evidence needed to build and verify the live adapter.

Pinned versions come from [zcash-versions.json](zcash-versions.json): Zebra `v6.2.3` and Zallet `v0.1.0-beta.3`. Zallet is beta software, so read its setup guide at the pinned tag before each step.

## 0. Machine

- WSL2 Ubuntu 24.04. Keep all data in the Linux filesystem (`~/`), not under `/mnt/c`.
- Free disk: allow at least 60 GB for the testnet state, plus room to grow.
- `sudo apt install -y build-essential clang libclang-dev pkg-config protobuf-compiler git curl`
- Rust: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh` and accept the defaults. Then run `source ~/.cargo/env`.

## 1. Zebra (full node) with the indexer feature

```bash
cargo install --locked --features indexer --git https://github.com/ZcashFoundation/zebra --tag v6.2.3 zebrad
mkdir -p ~/.config && zebrad generate -o ~/.config/zebrad.toml
```

Edit `~/.config/zebrad.toml`:

```toml
[network]
network = "Testnet"

[rpc]
listen_addr = "127.0.0.1:18232"
indexer_listen_addr = "127.0.0.1:8230"
enable_cookie_auth = true
```

Start it in its own terminal and leave it running until it has synced (this can take many hours):

```bash
zebrad -c ~/.config/zebrad.toml start
```

Note the state cache directory that it logs (usually `~/.cache/zebra`) and the cookie file path.

## 2. Zallet (wallet)

Download `zallet-v0.1.0-beta.3-linux-x86_64.tar.gz` and its signature from the zcash/zallet GitHub release, verify the signature, and put `zallet` and `zallet-zebra` on your `PATH`. Then:

```bash
mkdir -p ~/.zallet && cat > ~/.zallet/zallet.toml <<'TOML'
[builder.limits]
[consensus]
network = "test"
[database]
[external]
[features]
as_of_version = "0.0.0"
[features.deprecated]
[features.experimental]
[indexer]
validator_address = "127.0.0.1:18232"
validator_cookie_path = "/home/YOU/.cache/zebra/.cookie"
[indexer.read_state_service]
grpc_address = "127.0.0.1:8230"
zebra_state_path = "/home/YOU/.cache/zebra"
[keystore]
[note_management]
[rpc]
bind = ["127.0.0.1:28232"]
TOML
zallet -d ~/.zallet generate-encryption-identity -p   # keep the passphrase offline
zallet -d ~/.zallet init-wallet-encryption
zallet -d ~/.zallet generate-mnemonic                  # run ONCE; back it up offline
zallet -d ~/.zallet start                              # own terminal
```

Replace `YOU` with your Linux user, and adjust the cookie path to the one Zebra logged. Keep `rpc.bind` on loopback.

## 3. Provision the receiving account once

Use the RPC user and password you configured for Zallet (see its `[rpc]` auth options), or its cookie:

```bash
rpc() { curl -s -u "$ZU:$ZP" -H 'content-type: application/json' --data "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$1\",\"params\":$2}" http://127.0.0.1:28232; echo; }
rpc getwalletstatus '[]'
rpc z_getnewaccount '["gallery-arcana-receive"]'          # note the account UUID
rpc z_getaddressforaccount '["<ACCOUNT_UUID>", ["orchard"]]'   # Orchard-only unified address
```

## 4. Point the probe at it

Add these lines to `.env.worker` in the repository (never to `.env`):

```bash
ZALLET_RPC_URL=http://127.0.0.1:28232
ZALLET_RPC_USER=...
ZALLET_RPC_PASS=...
ZALLET_ACCOUNT_ID=<ACCOUNT_UUID>
ZALLET_RECEIVE_ADDRESS=<utest1… address>
```

Then run:

```bash
npm run zallet:probe
```

The probe is read-only and its output is redacted. It checks sync, tip agreement, the account and address binding, and Orchard-only receivers.

## 5. Generate genuine evidence

1. Fund the receive address from a Zcash testnet faucet with a small amount of TAZ.
2. Send two more fully shielded transfers to it: one exact and one with a memo string you choose.
3. Re-run `npm run zallet:probe` after a few confirmations.

## 6. Hand back

Share the redacted probe output and the transaction ids (txids only, never keys, seeds or passwords). The live adapter is built and tested against these real responses. The gate checklist in ZALLET_GAP.md (discovery cursors, reorgs, payouts and fresh FX) is then worked through, and the app keeps showing **MOCK** until every item passes.

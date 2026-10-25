#!/usr/bin/env bash
# Creates deploy/.env and deploy/.env.worker with fresh secrets. Never overwrites.
set -euo pipefail
cd "$(dirname "$0")"
command -v openssl >/dev/null || { echo "openssl is required"; exit 1; }
if [ -f .env ]; then echo ".env already exists; leaving it untouched."; else
  read -rp "Public URL (e.g. https://arcana.example.com): " origin
  read -rp "Cloudflare Tunnel token (Zero Trust → Networks → Tunnels → your tunnel): " token
  cat > .env <<EOT
PUBLIC_ORIGIN=${origin%/}
CLOUDFLARE_TUNNEL_TOKEN=$token
POSTGRES_PASSWORD=$(openssl rand -hex 24)
# Encrypts server-encrypted originals at rest. Back this up; losing it loses those files.
ASSET_ENCRYPTION_KEY=$(openssl rand -hex 32)
# Operator console: docker compose exec api arcana-entrypoint admin disputes
ADMIN_TOKEN=$(openssl rand -hex 32)
ZCASH_NETWORK=test
WALLET_DRIVER=mock
PRICE_SOURCE=fixed
ZEC_USD_FIXED=40
MIN_CONFIRMATIONS=2
ESCROW_REVIEW_HOURS=72
ESCROW_DISPUTE_DAYS=14
SESSION_DAYS=30
SESSION_ABSOLUTE_DAYS=90
EOT
  chmod 600 .env; echo "Wrote deploy/.env"
fi
if [ ! -f .env.worker ]; then
  cat > .env.worker <<EOT
WORKER_POLL_MS=5000
# Mock payments: docker compose exec worker arcana-entrypoint mock-pay <memo>
MOCK_SIMULATOR_TOKEN=$(openssl rand -hex 32)
# Live testnet later: ZALLET_RPC_URL / ZALLET_RPC_USER / ZALLET_RPC_PASS / ZALLET_ACCOUNT_ID / ZALLET_RECEIVE_ADDRESS
EOT
  chmod 600 .env.worker; echo "Wrote deploy/.env.worker"
fi
mkdir -p backups
echo "Next: docker compose up -d --build"

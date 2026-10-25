#!/usr/bin/env bash
# Public demo from your own machine: no VPS, no domain, no Cloudflare account.
# Starts the full stack in simulated-payment mode and exposes it through a free
# Cloudflare Quick Tunnel (https://<random>.trycloudflare.com).
#   ./demo.sh          start (or restart) and print the public link
#   ./demo.sh stop     stop everything (data is kept)
# Optional: DEMO_URL=https://arcana.example.com ./demo.sh  uses your own named tunnel/URL instead.
set -euo pipefail
cd "$(dirname "$0")"
TUNNEL=arcana-quicktunnel
NET=gallery-arcana_arcana
CORE="db init api worker web backup"

if [ "${1:-}" = "stop" ]; then
  docker rm -f "$TUNNEL" >/dev/null 2>&1 || true
  docker compose stop; echo "Stopped. Run ./demo.sh to start again (you'll get a new link)."; exit 0
fi
command -v docker >/dev/null || { echo "Docker is required (see docs/DEPLOY_CLOUDFLARE.md)"; exit 1; }
docker compose version >/dev/null || { echo "Docker Compose v2 is required"; exit 1; }

# Secrets on first run; demo mode simulates every payment after 20 seconds.
if [ ! -f .env ]; then
  cat > .env <<EOT
PUBLIC_ORIGIN=http://localhost:8088
CLOUDFLARE_TUNNEL_TOKEN=unused-in-quick-tunnel-demo
POSTGRES_PASSWORD=$(openssl rand -hex 24)
ASSET_ENCRYPTION_KEY=$(openssl rand -hex 32)
ADMIN_TOKEN=$(openssl rand -hex 32)
ZCASH_NETWORK=test
WALLET_DRIVER=mock
PRICE_SOURCE=fixed
ZEC_USD_FIXED=40
MIN_CONFIRMATIONS=2
DEMO_AUTOPAY_SECONDS=20
EOT
  chmod 600 .env; echo "Created deploy/.env (demo mode)."
fi
grep -q '^DEMO_AUTOPAY_SECONDS=' .env || echo 'DEMO_AUTOPAY_SECONDS=20' >> .env
if [ ! -f .env.worker ]; then printf 'WORKER_POLL_MS=3000\nMOCK_SIMULATOR_TOKEN=%s\n' "$(openssl rand -hex 32)" > .env.worker; chmod 600 .env.worker; fi
mkdir -p backups

docker compose up -d db >/dev/null   # creates the private network
url="${DEMO_URL:-}"
if [ -z "$url" ]; then
  docker rm -f "$TUNNEL" >/dev/null 2>&1 || true
  # Fixed IP: the web server trusts Cf-Connecting-Ip only from this address.
  docker run -d --name "$TUNNEL" --network "$NET" --ip 172.30.0.11 cloudflare/cloudflared:2025.10.0 \
    tunnel --no-autoupdate --url http://web:80 >/dev/null
  echo -n "Opening Cloudflare Quick Tunnel"
  for _ in $(seq 1 60); do
    url=$(docker logs "$TUNNEL" 2>&1 | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | head -1 || true)
    [ -n "$url" ] && break; echo -n "."; sleep 2
  done; echo
  [ -n "$url" ] || { echo "No tunnel URL yet. Check: docker logs $TUNNEL"; exit 1; }
fi
sed -i "s#^PUBLIC_ORIGIN=.*#PUBLIC_ORIGIN=${url%/}#" .env

if [ "${DEMO_NO_BUILD:-}" = "1" ]; then docker compose up -d --no-build $CORE; else docker compose up -d --build $CORE; fi
echo -n "Waiting for the API"
for _ in $(seq 1 90); do
  [ "$(docker inspect -f '{{.State.Health.Status}}' gallery-arcana-api-1 2>/dev/null)" = healthy ] && break; echo -n "."; sleep 2
done; echo
cat <<EOT

  Gallery Arcana demo is live:  ${url%/}

  Payments are SIMULATED (mock wallet, auto-paid ~20s after checkout).
  Keep this machine on while people use the link. A new link is issued each time you run ./demo.sh.
  Operator console:  docker compose exec api arcana-entrypoint admin disputes
  Stop:              ./demo.sh stop
EOT

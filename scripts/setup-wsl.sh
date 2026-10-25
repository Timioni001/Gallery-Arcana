#!/usr/bin/env bash
# One-time local setup for Ubuntu (including WSL2). Safe to re-run: it never
# overwrites an existing .env, .env.worker, database or signing key.
set -euo pipefail
cd "$(dirname "$0")/.."

need_node=22
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt "$need_node" ]; then
  echo "Node.js $need_node+ is required. Install it with nvm:"
  echo "  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash && nvm install 22"
  exit 1
fi

if ! command -v psql >/dev/null; then
  echo "Installing PostgreSQL (sudo)…"
  sudo apt-get update -qq && sudo apt-get install -y -qq postgresql
fi
# WSL has no systemd by default; the service wrapper works either way.
sudo service postgresql start >/dev/null

if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='arcana'" | grep -q 1; then
  sudo -u postgres psql -qc "CREATE ROLE arcana LOGIN PASSWORD 'arcana' CREATEDB"
fi
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='arcana'" | grep -q 1; then
  sudo -u postgres createdb -O arcana arcana
fi

if [ ! -f .env ]; then
  cp .env.example .env
  sed -i "s/^ASSET_ENCRYPTION_KEY=$/ASSET_ENCRYPTION_KEY=$(openssl rand -hex 32)/" .env
  sed -i "s/^ADMIN_TOKEN=$/ADMIN_TOKEN=$(openssl rand -hex 32)/" .env
  echo "Created .env with a fresh ASSET_ENCRYPTION_KEY. Back it up: files encrypted with it are unreadable without it."
fi
if [ ! -f .env.worker ]; then
  cp .env.worker.example .env.worker
  echo "MOCK_SIMULATOR_TOKEN=$(openssl rand -hex 32)" >> .env.worker
  echo "Created .env.worker with a local mock-payment simulator token."
fi

npm ci
npm run crypto:build
[ -f secrets/arcana_ed25519_private.pem ] || npm run keys
npm run migrate
npm ci --prefix web
# Headless Chromium for `npm run e2e` (browser journeys); skip if it fails.
(cd web && npx playwright install --with-deps chromium) || echo "Playwright browser install skipped; npm run e2e will need it."

echo
echo "Setup complete. Start everything with:  npm run dev"
echo "Operator console: npm run admin -- disputes   |   Demo script: docs/DEMO.md"
echo "Then open http://localhost:5173 in your Windows browser."

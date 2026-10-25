#!/usr/bin/env bash
# Runs worker, API and web dev server together; Ctrl+C stops all three.
set -euo pipefail
cd "$(dirname "$0")/.."
command -v service >/dev/null && (service postgresql status >/dev/null 2>&1 || sudo service postgresql start >/dev/null)
trap 'kill 0' EXIT INT TERM
npm run worker 2>&1 | sed -u 's/^/[worker] /' &
npm run api 2>&1 | sed -u 's/^/[api]    /' &
npm run dev --prefix web 2>&1 | sed -u 's/^/[web]    /' &
wait

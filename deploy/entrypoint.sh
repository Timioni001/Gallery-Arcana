#!/bin/sh
# One image, several roles. Secrets and data live in mounted volumes.
set -eu
run() { exec node --import tsx "$@"; }
case "${1:-api}" in
  init)
    # One-shot: create attestation signing keys on first boot (never overwrites), then migrate.
    if [ ! -f "$ATTESTATION_SIGNING_KEY_FILE" ]; then node --import tsx scripts/generate-signing-key.ts "$(dirname "$ATTESTATION_SIGNING_KEY_FILE")"; fi
    run scripts/migrate.ts ;;
  api)     run src/main.ts ;;
  worker)  run src/worker.ts ;;
  admin)   shift; run scripts/admin.ts "$@" ;;
  mock-pay) shift; run scripts/mock-pay.ts "$@" ;;
  *) exec "$@" ;;
esac

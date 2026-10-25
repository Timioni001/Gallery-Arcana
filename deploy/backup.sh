#!/bin/sh
# Nightly compressed pg_dump into ./backups, pruned after KEEP_DAYS.
# File storage and signing keys are Docker volumes; see docs/DEPLOY_CLOUDFLARE.md.
set -eu
sleep 120 # let migrations land before the first dump
while true; do
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  if pg_dump -h db -U arcana -d arcana -Fc -f "/backups/arcana-$stamp.dump.tmp"; then
    mv "/backups/arcana-$stamp.dump.tmp" "/backups/arcana-$stamp.dump"
    echo "backup ok $stamp"
  else
    rm -f "/backups/arcana-$stamp.dump.tmp"; echo "backup FAILED $stamp" >&2
  fi
  find /backups -name 'arcana-*.dump' -mtime +"$KEEP_DAYS" -delete
  sleep 86400
done

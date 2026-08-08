#!/usr/bin/env bash
# Dump the ichi database before a migration, and prove the dump is readable.
#
# Runs ON the server (deploy.sh calls it over ssh).
#
# An unverified backup is a belief, not a backup: pg_dump can exit 0 and leave
# a truncated file if the disk fills, so this restores the dump into a scratch
# database and counts a table before declaring success.
set -euo pipefail

DIR="${ICHI_DIR:-/opt/ichi}"
OUT="${ICHI_BACKUP_DIR:-/var/backups/ichi}"
KEEP="${ICHI_BACKUP_KEEP:-14}"

mkdir -p "$OUT"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
file="$OUT/ichi-$stamp.sql.gz"

cd "$DIR"
compose() { docker compose -f docker-compose.prod.yml "$@"; }

compose exec -T db pg_dump -U ichi -d ichi | gzip -9 > "$file"

# Verify by restoring, not by looking at the file size.
scratch="ichi_restorecheck_$$"
compose exec -T db psql -U ichi -d postgres -c "create database $scratch" >/dev/null
trap 'compose exec -T db psql -U ichi -d postgres -c "drop database if exists $scratch" >/dev/null 2>&1 || true' EXIT

gzip -dc "$file" | compose exec -T db psql -q -U ichi -d "$scratch" >/dev/null
rows=$(compose exec -T db psql -tAU ichi -d "$scratch" -c "select count(*) from ichi" | tr -d '[:space:]')

echo "  backup $file · restored ok · $rows ichi"

# Keep the last N, drop the rest.
ls -1t "$OUT"/ichi-*.sql.gz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm --

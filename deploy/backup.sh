#!/usr/bin/env bash
# Dump the ichi database before a migration, and prove the dump is readable.
#
# Runs ON the server (deploy.sh calls it over ssh).
#
# An unverified backup is a belief, not a backup: pg_dump can exit 0 and leave
# a truncated file if the disk fills, so this restores the dump into a scratch
# database and counts a table before declaring success.
#
# ichi has no Postgres of its own any more: its tables live in an `ichi` schema
# of mozg's database. So this dumps that schema only — mozg's nightly backup
# already covers everything in public, and a second full dump of a 259 MB
# database every night would be waste, not safety.
set -euo pipefail

DIR="${ICHI_DIR:-/opt/ichi}"
OUT="${ICHI_BACKUP_DIR:-/var/backups/ichi}"
KEEP="${ICHI_BACKUP_KEEP:-14}"

mkdir -p "$OUT"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
file="$OUT/ichi-$stamp.sql.gz"

cd "$DIR"
SCHEMA="${ICHI_SCHEMA:-ichi}"
DB_CONTAINER="${ICHI_DB_CONTAINER:-mozg-db-1}"
DB_USER="${ICHI_DB_USER:-mozg}"
DB_NAME="${ICHI_DB_NAME:-mozg}"

pg() { docker exec -i "$DB_CONTAINER" "$@"; }

pg pg_dump -U "$DB_USER" -d "$DB_NAME" --schema="$SCHEMA" | gzip -9 > "$file"

# Verify by restoring, not by looking at the file size. The scratch database
# is created beside the real one and dropped whatever happens.
scratch="ichi_restorecheck_$$"
pg psql -qU "$DB_USER" -d postgres -c "create database $scratch" >/dev/null
trap 'docker exec -i "'"$DB_CONTAINER"'" psql -qU "'"$DB_USER"'" -d postgres -c "drop database if exists '"$scratch"'" >/dev/null 2>&1 || true' EXIT

gzip -dc "$file" | pg psql -q -U "$DB_USER" -d "$scratch" >/dev/null
rows=$(pg psql -tAU "$DB_USER" -d "$scratch" -c "select count(*) from $SCHEMA.ichi" | tr -d '[:space:]')

echo "  backup $file · restored ok · $rows ichi"

# Keep the last N, drop the rest.
ls -1t "$OUT"/ichi-*.sql.gz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm --

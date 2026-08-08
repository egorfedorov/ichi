#!/usr/bin/env bash
# Deploy the current origin/main to ichi.mozg.sh.
#
#   ICHI_HOST=<ssh-host> ./deploy/deploy.sh
#
# Runs from a laptop over ssh. Everything is idempotent, so re-running after a
# failure is safe. Same shape as mozg's deploy.sh — same box, same habits.
set -euo pipefail

HOST="${ICHI_HOST:?set ICHI_HOST to the ssh host that serves mozg.sh}"
DIR="${ICHI_DIR:-/opt/ichi}"
URL="${ICHI_URL:-https://ichi.mozg.sh}"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

say "1/6  local checks"
npm run typecheck
npm run lint
npm test 2>&1 | tail -3

if [ -n "$(git status --porcelain)" ]; then
  echo "✗ working tree is dirty — commit or stash first"
  exit 1
fi
git push -q origin main
echo "  pushed $(git rev-parse --short HEAD)"

say "2/6  pulling on $HOST"
ssh "$HOST" "cd $DIR && git fetch -q origin && git reset -q --hard origin/main && git log --oneline | head -1"

sha=$(git rev-parse HEAD)

say "3/6  building the new image"
# Build without swapping. The order matters: the new app must not take traffic
# before the schema it expects exists.
ssh "$HOST" "cd $DIR && GIT_SHA=$sha docker compose -f docker-compose.prod.yml build app worker"

say "4/6  backup + migrations, before the swap"
# Never migrate against the only copy of the data.
ssh "$HOST" "$DIR/deploy/backup.sh"
# A one-off container from the image just built, not the running one: that is
# what lets the schema move first. Migrations here are additive or guarded
# renames, so the old app keeps serving against the new schema meanwhile.
ssh "$HOST" "cd $DIR && GIT_SHA=$sha docker compose -f docker-compose.prod.yml run --rm --no-deps -T app node dist/migrate.mjs 2>&1 | tail -3"

say "5/6  swapping"
ssh "$HOST" "cd $DIR && GIT_SHA=$sha docker compose -f docker-compose.prod.yml up -d"

say "6/6  checking it answers"
# Both surfaces, because they fail independently: the console can render while
# /mcp is broken, and an agent noticing before you do is the bad version.
for i in $(seq 1 20); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$URL/api/health" || true)
  [ "$code" = "200" ] && break
  sleep 3
done
if [ "$code" != "200" ]; then
  echo "✗ /api/health answered $code after 60s"
  ssh "$HOST" "cd $DIR && docker compose -f docker-compose.prod.yml logs --tail=40 app"
  exit 1
fi
mcp=$(curl -s -o /dev/null -w '%{http_code}' "$URL/mcp" || true)
echo "  health 200 · /mcp $mcp · $URL"
echo "✓ deployed $(git rev-parse --short HEAD)"

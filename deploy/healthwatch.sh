#!/usr/bin/env bash
# Alert by mail when ichi.mozg.sh stops answering, and when it recovers.
# Cron, every 5 minutes:
#
#   */5 * * * *  /opt/ichi/deploy/healthwatch.sh >> /var/log/ichi-health.log 2>&1
#
# Mail goes through the Resend key mozg already keeps on this box — same
# owner, same machine, no new account and no new secret.
#
# Alerts fire on state *transitions* plus an hourly reminder while down,
# because a mail every five minutes trains its reader to delete mail every
# five minutes.
set -u

ENV_FILE="${ICHI_ENV:-/opt/ichi/.env}"
MOZG_ENV_FILE="${MOZG_ENV:-/opt/mozg/.env}"
URL="${ICHI_URL:-https://ichi.mozg.sh}"
STATE_FILE="/var/tmp/ichi-healthwatch.state"

# Parsed rather than sourced: the env file is not a shell script, and quoting
# inside it must not be able to break the cron.
pluck() { sed -n "s/^$1=//p" "$2" 2>/dev/null | tr -d '"'; }

RESEND_API_KEY=$(pluck RESEND_API_KEY "$ENV_FILE")
[ -z "$RESEND_API_KEY" ] && RESEND_API_KEY=$(pluck RESEND_API_KEY "$MOZG_ENV_FILE")
EMAIL_FROM=$(pluck EMAIL_FROM "$ENV_FILE")
[ -z "$EMAIL_FROM" ] && EMAIL_FROM=$(pluck EMAIL_FROM "$MOZG_ENV_FILE")
ALERT_TO="${OPERATOR_EMAIL:-$(pluck OPERATOR_EMAIL "$ENV_FILE")}"
[ -z "$ALERT_TO" ] && ALERT_TO=$(pluck OPERATOR_EMAIL "$MOZG_ENV_FILE")

if [ -z "$RESEND_API_KEY" ] || [ -z "$EMAIL_FROM" ] || [ -z "$ALERT_TO" ]; then
  echo "$(date -Is)  no mail credentials in $ENV_FILE or $MOZG_ENV_FILE — cannot alert"
  exit 1
fi

# ── the two checks ─────────────────────────────────────────────────────────
# They fail independently, and the second is the one that matters: the console
# can render perfectly while /mcp is broken, and then the first person to find
# out is somebody's agent mid-task.

health_code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$URL/api/health")

# The agent's-eye check. No token needed: an unauthenticated POST must answer
# 401, and anything else — 502, 504, a hang — means the MCP path is down even
# though the page is up. A wrong answer here is as bad as no answer.
mcp_code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 25 \
  -X POST "$URL/mcp" \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}')

if [ "$health_code" = "200" ] && [ "$mcp_code" = "401" ]; then
  now="up"
  detail="health 200 · mcp 401 (correctly refusing anonymous)"
else
  now="down"
  detail="health $health_code · mcp $mcp_code (expected 200 / 401)"
fi

was=$(cat "$STATE_FILE" 2>/dev/null || echo "up")
last_alert=$(stat -c %Y "$STATE_FILE" 2>/dev/null || echo 0)
age=$(( $(date +%s) - last_alert ))

send() {
  curl -s -X POST https://api.resend.com/emails \
    -H "Authorization: Bearer $RESEND_API_KEY" \
    -H 'Content-Type: application/json' \
    -d "$(printf '{"from":"%s","to":["%s"],"subject":"%s","text":"%s"}' \
          "$EMAIL_FROM" "$ALERT_TO" "$1" "$2")" >/dev/null
}

if [ "$now" = "down" ] && [ "$was" = "up" ]; then
  send "ichi is down" "$URL stopped answering.\\n\\n$detail\\n\\nLook: ssh <server> 'cd /opt/ichi && docker compose -f docker-compose.prod.yml logs --tail 50 app worker'"
  echo "$now" > "$STATE_FILE"
  echo "$(date -Is)  DOWN — alerted · $detail"
elif [ "$now" = "down" ] && [ "$age" -ge 3600 ]; then
  # Still down an hour later. One reminder an hour, not one every run.
  send "ichi is still down" "$URL has been down for at least an hour.\\n\\n$detail"
  touch "$STATE_FILE"
  echo "$(date -Is)  DOWN — hourly reminder · $detail"
elif [ "$now" = "up" ] && [ "$was" = "down" ]; then
  send "ichi is back" "$URL is answering again.\\n\\n$detail"
  echo "$now" > "$STATE_FILE"
  echo "$(date -Is)  RECOVERED · $detail"
else
  echo "$now" > "$STATE_FILE"
  echo "$(date -Is)  $now · $detail"
fi

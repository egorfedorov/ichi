#!/bin/sh
# SessionStart: fetch the ichchi's brief once per session, cache it, and hand
# it to the agent as additionalContext.
#
# With --refresh (ichchi-prompt.sh runs it in the background) only the cache
# is rewritten and nothing is printed.
#
# Any failure — no token, no curl, no network, a server error — exits 0
# silently. A hook exists to colour the session, never to block it.
set -u

# The event JSON on stdin is not needed here, but consume it anyway.
cat >/dev/null 2>&1 || true

ROOT=${CLAUDE_PLUGIN_ROOT:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}
# shellcheck source=ichchi-common.sh
. "$ROOT/hooks/ichchi-common.sh" || exit 0

[ -n "${ICHI_TOKEN:-}" ] || exit 0
command -v curl >/dev/null 2>&1 || exit 0

REFRESH=0
[ "${1:-}" = "--refresh" ] && REFRESH=1

# A brief fetched moments ago is still this session's brief — a restored
# session must not cost another round trip.
_age=$(ichchi_age "$ICHI_CACHE" 2>/dev/null || echo 999999)
if [ "$_age" -lt "$ICHI_CACHE_MIN_AGE" ]; then
  if [ "$REFRESH" -eq 0 ]; then
    ichchi_cache_text | ichchi_emit_context SessionStart
  fi
  exit 0
fi

# Which ichchi — ichchi_list names them, the first one is the one riding along.
_list=$(ichchi_call ichchi_list '{}') || exit 0
_slug=$(printf '%s' "$_list" | ichchi_text | ichchi_first)

if [ -z "$_slug" ]; then
  # No ichchi adopted yet: cache the emptiness so UserPromptSubmit stays quiet
  # instead of re-asking the server on every prompt.
  printf '\n' | ichchi_cache_write ""
  exit 0
fi

_brief=$(ichchi_call ichchi_brief "{\"ichchi\":\"$_slug\"}") || exit 0
_text=$(printf '%s' "$_brief" | ichchi_text)
[ -n "$_text" ] || exit 0

printf '%s\n' "$_text" | ichchi_cache_write "$_slug"

if [ "$REFRESH" -eq 0 ]; then
  printf '%s\n' "$_text" | ichchi_emit_context SessionStart
fi
exit 0

#!/bin/sh
# SessionStart: fetch the ichi's brief once per session, cache it, and hand
# it to the agent as additionalContext.
#
# With --refresh (ichi-prompt.sh runs it in the background) only the cache
# is rewritten and nothing is printed.
#
# Any failure — no token, no curl, no network, a server error — exits 0
# silently. A hook exists to colour the session, never to block it.
set -u

# The event JSON on stdin is not needed here, but consume it anyway.
cat >/dev/null 2>&1 || true

ROOT=${CLAUDE_PLUGIN_ROOT:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}
# shellcheck source=ichi-common.sh
. "$ROOT/hooks/ichi-common.sh" || exit 0

[ -n "${ICHI_TOKEN:-}" ] || exit 0
command -v curl >/dev/null 2>&1 || exit 0

REFRESH=0
[ "${1:-}" = "--refresh" ] && REFRESH=1

# A brief fetched moments ago is still this session's brief — a restored
# session must not cost another round trip.
_age=$(ichi_age "$ICHI_CACHE" 2>/dev/null || echo 999999)
if [ "$_age" -lt "$ICHI_CACHE_MIN_AGE" ]; then
  if [ "$REFRESH" -eq 0 ]; then
    ichi_cache_text | ichi_emit_context SessionStart
  fi
  exit 0
fi

# Which ichi — ichi_list names them, the first one is the one riding along.
_list=$(ichi_call ichi_list '{}') || exit 0
_slug=$(printf '%s' "$_list" | ichi_text | ichi_first)

if [ -z "$_slug" ]; then
  # No ichi adopted yet: cache the emptiness so UserPromptSubmit stays quiet
  # instead of re-asking the server on every prompt.
  printf '\n' | ichi_cache_write ""
  exit 0
fi

_brief=$(ichi_call ichi_brief "{\"ichi\":\"$_slug\"}") || exit 0
_text=$(printf '%s' "$_brief" | ichi_text)
[ -n "$_text" ] || exit 0

printf '%s\n' "$_text" | ichi_cache_write "$_slug"

if [ "$REFRESH" -eq 0 ]; then
  printf '%s\n' "$_text" | ichi_emit_context SessionStart
fi
exit 0

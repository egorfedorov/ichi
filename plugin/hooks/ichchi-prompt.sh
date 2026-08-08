#!/bin/sh
# UserPromptSubmit: mix the cached ichchi brief into every prompt, and refresh
# the cache in the background when it has gone stale. The prompt itself is
# never made to wait for the network — the refresh finishes for the *next*
# prompt, not this one.
set -u

cat >/dev/null 2>&1 || true

ROOT=${CLAUDE_PLUGIN_ROOT:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}
# shellcheck source=ichchi-common.sh
. "$ROOT/hooks/ichchi-common.sh" || exit 0

[ -n "${ICHI_TOKEN:-}" ] || exit 0
command -v curl >/dev/null 2>&1 || exit 0

# Stale or missing cache → refresh in the background, detached, so a slow or
# dead server cannot hold the prompt. stdin is /dev/null: ichchi-start.sh
# would otherwise sit reading the hook's event stream.
_age=$(ichchi_age "$ICHI_CACHE" 2>/dev/null || echo 999999)
if [ "$_age" -ge "$ICHI_CACHE_STALE" ]; then
  ( "$ROOT/hooks/ichchi-start.sh" --refresh </dev/null >/dev/null 2>&1 & )
fi

ichchi_cache_text | ichchi_emit_context UserPromptSubmit
exit 0

#!/bin/sh
# UserPromptSubmit: mix the cached ichi brief into every prompt, and refresh
# the cache in the background when it has gone stale. The prompt itself is
# never made to wait for the network — the refresh finishes for the *next*
# prompt, not this one.
set -u

cat >/dev/null 2>&1 || true

ROOT=${CLAUDE_PLUGIN_ROOT:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}
# shellcheck source=ichi-common.sh
. "$ROOT/hooks/ichi-common.sh" || exit 0

[ -n "${ICHI_TOKEN:-}" ] || exit 0
command -v curl >/dev/null 2>&1 || exit 0

# Stale or missing cache → refresh in the background, detached, so a slow or
# dead server cannot hold the prompt. stdin is /dev/null: ichi-start.sh
# would otherwise sit reading the hook's event stream.
_age=$(ichi_age "$ICHI_CACHE" 2>/dev/null || echo 999999)
if [ "$_age" -ge "$ICHI_CACHE_STALE" ]; then
  ( "$ROOT/hooks/ichi-start.sh" --refresh </dev/null >/dev/null 2>&1 & )
fi

ichi_cache_text | ichi_emit_context UserPromptSubmit
exit 0

#!/bin/sh
# Stop: leave a session summary in the ichchi's memory — once per session, in
# the background, fire-and-forget.
#
# ichchi_feedback is deliberately NOT sent from here: praise and scolding must
# come from the user (that is what makes the signal worth learning from),
# and a hook cannot tell them apart. What a hook *can* attest is that the
# session happened, so that is what gets remembered.
set -u

_event=$(cat 2>/dev/null) || true

ROOT=${CLAUDE_PLUGIN_ROOT:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}
# shellcheck source=ichchi-common.sh
. "$ROOT/hooks/ichchi-common.sh" || exit 0

[ -n "${ICHI_TOKEN:-}" ] || exit 0
command -v curl >/dev/null 2>&1 || exit 0

# A Stop hook firing inside another Stop hook's continuation loops forever.
printf '%s' "$_event" | grep -q '"stop_hook_active"[[:space:]]*:[[:space:]]*true' && exit 0

# Once per session: Stop fires after every response, and the ichchi needs the
# session's end, not a dozen copies of it.
_session=$(printf '%s' "$_event" |
  sed -n 's/.*"session_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)
[ -n "$_session" ] || _session="unknown"
_mark=$ICHI_STOP_DIR/ichchi-stop-$(ichchi_hash "${ICHI_TOKEN}@$_session")
[ -f "$_mark" ] && exit 0
: > "$_mark" 2>/dev/null || exit 0

# No ichchi, nothing to tell. The cached slug is the one ichchi-start.sh chose.
_slug=$(ichchi_cache_slug)
[ -n "$_slug" ] || exit 0

_cwd=$(printf '%s' "$_event" |
  sed -n 's/.*"cwd"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)
_dir=${_cwd##*/}
[ -n "$_dir" ] || _dir="a project"

_reason=$(printf 'Session in %s wrapped up.' "$_dir" | ichchi_json_escape)

# Detached and short-fused: the CLI is closing, the ichchi can wait its turn.
(
  ichchi_call ichchi_remember \
    "{\"ichchi\":\"$_slug\",\"kind\":\"event\",\"text\":\"$_reason\"}" \
    "$ICHI_STOP_TIMEOUT" >/dev/null 2>&1
) &
exit 0

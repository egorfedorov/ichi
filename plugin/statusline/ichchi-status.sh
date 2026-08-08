#!/bin/sh
# ichchi statusline — the mood, always visible.
#
# Reads ONLY the cache the SessionStart/UserPromptSubmit hooks already wrote
# (see ichchi-common.sh). The statusline runs on a hot path — every render —
# so it must never touch the network, never block, and never print an error.
# If there is no cache, there is no line; the hooks will fill it in shortly.
#
# Install (Claude Code reads this from settings.json, not from the plugin
# manifest, so it is one line the user adds by hand):
#
#   "statusLine": {
#     "type": "command",
#     "command": "~/.claude/plugins/ichchi/statusline/ichchi-status.sh"
#   }
#
# Claude Code passes session JSON on stdin. We ignore it — the ichchi's mood
# is the same in every session, and parsing it would cost more than it buys.

set -u

ICHI_BASE=${ICHI_URL:-https://ichchi.sh}
ICHI_BASE=${ICHI_BASE%/}

hash_of() {
  if command -v shasum >/dev/null 2>&1; then
    printf '%s' "$1" | shasum -a 256 | cut -c1-16
  elif command -v md5sum >/dev/null 2>&1; then
    printf '%s' "$1" | md5sum | cut -c1-16
  elif command -v md5 >/dev/null 2>&1; then
    printf '%s' "$1" | md5 -q | cut -c1-16
  else
    printf '%s' "$1" | cksum | tr -d ' '
  fi
}

CACHE=${TMPDIR:-/tmp}/ichchi-brief-$(hash_of "${ICHI_TOKEN:-none}@$ICHI_BASE/mcp")
[ -f "$CACHE" ] || exit 0

# Line 1 of the cache is the slug; the brief itself starts at line 2.
brief=$(tail -n +2 "$CACHE" 2>/dev/null) || exit 0
[ -n "$brief" ] || exit 0

name=$(printf '%s' "$brief" | sed -n 's/^## Ichchi: \([^(]*\) (.*/\1/p' | head -n 1)
mood=$(printf '%s' "$brief" | sed -n 's/^Mood: \(.*\) · Bond:.*/\1/p' | head -n 1)
bond=$(printf '%s' "$brief" | sed -n 's/^Mood:.*· Bond: \([0-9]*\)\/100.*/\1/p' | head -n 1)

[ -n "$mood" ] || exit 0

# Trim the trailing space sed leaves on the name.
name=$(printf '%s' "$name" | sed 's/[[:space:]]*$//')

# The dot carries the mood at a glance; the words carry it exactly. Colour
# comes from the mood vocabulary in lib/voice.ts — keep the two in step.
case "$mood" in
  *"stung"*|*"bristling"*|*"hurt"*)      colour=31 ;;  # red
  *"tense"*|*"touchy"*|*"on edge"*)      colour=33 ;;  # yellow
  *"subdued"*|*"tired"*)                 colour=90 ;;  # grey
  *"delighted"*|*"warm"*|*"pleased"*)    colour=32 ;;  # green
  *)                                     colour=36 ;;  # cyan — even, restless
esac

dot=$(printf '\033[%sm●\033[0m' "$colour")
dim_open=$(printf '\033[2m')
dim_close=$(printf '\033[0m')

if [ -n "$bond" ]; then
  printf '%s %s %s%s · bond %s%s\n' "$dot" "$name" "$dim_open" "$mood" "$bond" "$dim_close"
else
  printf '%s %s %s%s%s\n' "$dot" "$name" "$dim_open" "$mood" "$dim_close"
fi

# shellcheck shell=sh
# Shared helpers for the ichi hooks. Sourced by ichi-start.sh,
# ichi-prompt.sh and ichi-stop.sh — never executed on its own.
#
# One rule governs everything below: a hook must never break the CLI. No
# token, no network, a server 500, a missing curl — every one of them ends
# in a silent `exit 0`, so every function here fails quietly and every
# caller checks before it acts.

ICHI_BASE=${ICHI_URL:-https://ichi.sh}
ICHI_BASE=${ICHI_BASE%/}
ICHI_ENDPOINT=$ICHI_BASE/mcp

# SessionStart is allowed to wait for the brief; Stop must never be felt.
ICHI_RPC_TIMEOUT=${ICHI_RPC_TIMEOUT:-6}
ICHI_STOP_TIMEOUT=3

# Re-fetch at most this often, even if sessions start back to back.
ICHI_CACHE_MIN_AGE=120
# Older than this and ichi-prompt.sh refreshes the cache in the background.
ICHI_CACHE_STALE=300

# ─── small portable pieces ────────────────────────────────────────────────

# Hash without assuming coreutils: token keyed caches, one file per token.
ichi_hash() {
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

# mtime in epoch seconds, GNU stat first then BSD.
ichi_mtime() {
  stat -c %Y "$1" 2>/dev/null || stat -f %m "$1" 2>/dev/null
}

# Seconds since a file was written; huge when it does not exist.
ichi_age() {
  _mt=$(ichi_mtime "$1") || return 1
  [ -n "$_mt" ] || return 1
  echo $(( $(date +%s) - _mt ))
}

# ─── cache ────────────────────────────────────────────────────────────────
# One brief per token+server, outside the repo: $TMPDIR or /tmp.
# Format: line 1 is the ichi's slug (empty when the account has no ichi),
# the rest is the brief text exactly as ichi_brief returned it.

_ichi_key=$(ichi_hash "${ICHI_TOKEN:-none}@${ICHI_ENDPOINT}")
ICHI_CACHE=${TMPDIR:-/tmp}/ichi-brief-$_ichi_key
ICHI_STOP_DIR=${TMPDIR:-/tmp}
unset _ichi_key

ichi_cache_slug() {
  [ -f "$ICHI_CACHE" ] && head -n 1 "$ICHI_CACHE"
}

ichi_cache_text() {
  [ -f "$ICHI_CACHE" ] && tail -n +2 "$ICHI_CACHE"
}

ichi_cache_write() {
  # $1 = slug, text on stdin
  {
    printf '%s\n' "$1"
    cat
  } > "$ICHI_CACHE.tmp" 2>/dev/null && mv "$ICHI_CACHE.tmp" "$ICHI_CACHE"
}

# ─── MCP over HTTP ────────────────────────────────────────────────────────
# The server (src/app/mcp/route.ts) is a stateless hand-rolled JSON-RPC
# endpoint: one POST per call, plain JSON back, no session to initialize.
# Accept still offers text/event-stream so a future SSE answer is legal —
# ichi_text unwraps both shapes.

ichi_rpc() {
  # $1 = method, $2 = params JSON, $3 = optional timeout override
  curl -sS --max-time "${3:-$ICHI_RPC_TIMEOUT}" \
    -X POST "$ICHI_ENDPOINT" \
    -H "Authorization: Bearer $ICHI_TOKEN" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$1\",\"params\":$2}" \
    2>/dev/null
}

ichi_call() {
  # $1 = tool name, $2 = arguments JSON, $3 = optional timeout override
  ichi_rpc tools/call "{\"name\":\"$1\",\"arguments\":$2}" "${3:-}"
}

# ─── parsing without jq ───────────────────────────────────────────────────
# jq when the machine has it; a sed/awk scrape otherwise. The server emits
# single-line JSON, so the scrape only has to survive that one shape.

ichi_text() {
  # MCP answer on stdin (plain JSON or an SSE stream) → content[0].text.
  _payload=$(sed -e '/^event:/d' -e 's/^data: //')
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$_payload" | jq -r '.result.content[0].text // ""' 2>/dev/null
  else
    printf '%s' "$_payload" |
      sed -n 's/.*"text"[[:space:]]*:[[:space:]]*"//; s/"}[[:space:]]*\],[[:space:]]*"isError".*$//p' |
      ichi_unescape
  fi
}

# Undo the JSON string escapes the brief can actually contain. \\" and \\n
# first through a placeholder so a literal backslash survives the pass.
ichi_unescape() {
  awk '{
    gsub(/\\\\/, "\034")
    gsub(/\\n/, "\n")
    gsub(/\\"/, "\"")
    gsub(/\\t/, "\t")
    gsub(/\034/, "\\")
    printf "%s\n", $0
  }'
}

# Escape stdin for embedding inside a JSON string.
ichi_json_escape() {
  awk '{
    gsub(/\\/, "\\\\")
    gsub(/"/, "\\\"")
    gsub(/\t/, "\\t")
    printf "%s\\n", $0
  }'
}

# The slug of the first ichi in a ichi_list answer; empty when there is none.
ichi_first() {
  sed -n 's/.*(slug `\([^`]*\)`.*/\1/p' | head -n 1
}

# ─── hook output ──────────────────────────────────────────────────────────

# Wrap stdin as additionalContext for the given hook event. Prints nothing
# for empty input — a hook that has nothing to say should say nothing.
ichi_emit_context() {
  # $1 = hook event name ("SessionStart" | "UserPromptSubmit")
  _text=$(cat)
  [ -n "$_text" ] && [ "$_text" != "null" ] || return 0
  _esc=$(printf '%s' "$_text" | ichi_json_escape)
  [ -n "$_esc" ] || return 0
  printf '{"hookSpecificOutput":{"hookEventName":"%s","additionalContext":"%s"}}\n' "$1" "$_esc"
}

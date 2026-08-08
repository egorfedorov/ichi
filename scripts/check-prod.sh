#!/usr/bin/env bash
# Exercise the whole public surface of a running ichi over HTTP only.
#
#   ./scripts/check-prod.sh                      # against ichi.mozg.sh
#   ICHI_URL=http://localhost:3400 ./scripts/check-prod.sh
#
# Unlike check:mcp, this needs no database access, so it runs from a laptop,
# from CI, or from the server — against whatever is actually deployed. That is
# the point: the thing worth checking is what an agent can reach, not what the
# code says it should reach.
#
# It reuses one probe account rather than creating a throwaway per run, so
# repeated checks do not litter production with users.
set -u

BASE="${ICHI_URL:-https://ichi.mozg.sh}"
EMAIL="${ICHI_PROBE_EMAIL:-probe@ichi.mozg.sh}"
PASS="${ICHI_PROBE_PASSWORD:-probe-password-not-a-secret-1}"
JAR=$(mktemp)
trap 'rm -f "$JAR"' EXIT

pass=0; fail=0
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1)); }
bad()  { printf '  \033[31m✗\033[0m %s — %s\n' "$1" "$2"; fail=$((fail+1)); }
check(){ if [ "$2" = "1" ]; then ok "$1"; else bad "$1" "${3:-}"; fi; }

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }

code() { curl -s -o /dev/null -w '%{http_code}' --max-time 25 "$@"; }

say "public surfaces  ($BASE)"
for pair in "/:200" "/robots.txt:200" "/sitemap.xml:200" "/icon.svg:200" "/api/health:200"; do
  path="${pair%:*}"; want="${pair##*:}"
  got=$(code "$BASE$path")
  check "$path -> $want" "$([ "$got" = "$want" ] && echo 1 || echo 0)" "got $got"
done

say "auth"
# Sign in first; sign up only if the probe account does not exist yet.
in=$(curl -s -c "$JAR" -o /dev/null -w '%{http_code}' --max-time 25 -X POST "$BASE/api/auth/sign-in/email" \
  -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")
if [ "$in" != "200" ]; then
  in=$(curl -s -c "$JAR" -o /dev/null -w '%{http_code}' --max-time 25 -X POST "$BASE/api/auth/sign-up/email" \
    -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"name\":\"probe\"}")
fi
check "signed in as the probe account" "$([ "$in" = "200" ] && echo 1 || echo 0)" "got $in"

# Tokens are issued on mozg's account page now, not here — both products share
# one account. Check that ichi refuses to mint, then take one the way a person
# actually would.
mint=$(curl -s -b "$JAR" -o /dev/null -w '%{http_code}' --max-time 25 -X POST "$BASE/api/tokens" \
  -H 'Content-Type: application/json' -d '{"name":"prod-check"}')
check "ichi refuses to issue tokens itself" "$([ "$mint" = "410" ] && echo 1 || echo 0)" "got $mint"

TOKEN="${ICHI_PROBE_TOKEN:-}"
if [ -z "$TOKEN" ]; then
  echo "  · set ICHI_PROBE_TOKEN (mint one at ${SIBLING:-https://mozg.sh}/settings/tokens?t=ichi)"
  printf '\n%d passed, %d failed\n' "$pass" "$fail"
  exit 1
fi
check "have a token to test with" 1
[ -z "$TOKEN" ] && { printf '\n%d passed, %d failed\n' "$pass" "$fail"; exit 1; }

mcp() {
  curl -s --max-time 40 -X POST "$BASE/mcp" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "$1"
}
call() {
  mcp "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"$1\",\"arguments\":$2}}"
}
has() { printf '%s' "$1" | grep -q "$2" && echo 1 || echo 0; }

# Every tool result is assigned to a variable before it is examined.
#
# Not style. `check "..." "$(has "$(call tool "{\"a\":\"$v\"}")" 'x')"` nests
# command substitution three deep with escaped quotes inside, and bash mangles
# the innermost argument — the call goes out malformed, the assertion fails,
# and the failure looks like a broken feature rather than a broken check. That
# cost a real debugging session; one variable per call costs nothing.

say "mcp protocol"
anon=$(code -X POST "$BASE/mcp" -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}')
check "anonymous call is refused" "$([ "$anon" = "401" ] && echo 1 || echo 0)" "got $anon"

init=$(mcp '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}')
check "initialize names the server" "$(has "$init" '"name":"ichi"')" "$(printf '%.90s' "$init")"
check "initialize carries instructions" "$(has "$init" 'instructions')" "missing"

list=$(mcp '{"jsonrpc":"2.0","id":2,"method":"tools/list"}')
for tool in ichi_list ichi_adopt ichi_brief ichi_state ichi_feedback ichi_remember ichi_recall ichi_why; do
  check "tools/list has $tool" "$(has "$list" "\"$tool\"")" "missing"
done

unknown=$(call "ichi_nope" '{}')
check "unknown tool is a protocol error" "$(has "$unknown" '"code":-32602')" "$(printf '%.90s' "$unknown")"

say "the tools themselves"
name="Probe $(date +%H%M%S)"
adopt=$(call ichi_adopt "{\"archetype\":\"hunter\",\"name\":\"$name\"}")
check "ichi_adopt births one" "$(has "$adopt" "$name")" "$(printf '%.110s' "$adopt")"

# Ask for the slug rather than deriving it from the name. Guessing here made
# the check lie once already: a wrong slug turns every later step into "no
# such ichi", which reads as a broken feature rather than a broken check.
listing=$(call ichi_list '{}')
check "ichi_list shows it" "$(has "$listing" "$name")" "not listed"
slug=$(printf '%s' "$listing" | tr ',' '\n' | grep -F "$name" -A1 | sed -n 's/.*slug `\([a-z0-9-]*\)`.*/\1/p' | head -1)
[ -z "$slug" ] && slug=$(printf '%s' "$listing" | sed -n "s/.*\*\*$name\*\* (slug \`\([a-z0-9-]*\)\`.*/\1/p" | head -1)
check "found its slug" "$([ -n "$slug" ] && echo 1 || echo 0)" "could not read a slug from ichi_list"
brief=$(call ichi_brief "{\"ichi\":\"$slug\"}")
check "ichi_brief carries the tone rule" "$(has "$brief" 'RULE 1')" "no tone rule"
check "ichi_brief carries the standards rule" "$(has "$brief" 'RULE 2')" "no standards rule"

state=$(call ichi_state "{\"ichi\":\"$slug\"}")
check "ichi_state reports Big Five" "$(has "$state" 'openness')" "no traits"

scold=$(call ichi_feedback "{\"ichi\":\"$slug\",\"kind\":\"scold\",\"reason\":\"prod check\"}")
check "ichi_feedback lands a scolding" "$(has "$scold" 'bond')" "$(printf '%.90s' "$scold")"

remembered=$(call ichi_remember "{\"ichi\":\"$slug\",\"text\":\"always run the tests first\",\"kind\":\"standard\"}")
check "ichi_remember keeps the kind it was given" "$(has "$remembered" '(standard,')" "downgraded the kind"

briefed=$(call ichi_brief "{\"ichi\":\"$slug\"}")
check "the standard rides in the brief" "$(has "$briefed" 'always run the tests first')" "standard missing from brief"
check "and under its own heading" "$(has "$briefed" 'Standards this person works by')" "no standards section"

recalled=$(call ichi_recall "{\"ichi\":\"$slug\",\"query\":\"tests\"}")
check "ichi_recall finds it" "$(has "$recalled" 'tests')" "not recalled"

why=$(call ichi_why "{\"ichi\":\"$slug\"}")
check "ichi_why explains the mood" "$(has "$why" 'scolded')" "no reason given"

say "guards"
missing=$(call ichi_brief '{"ichi":"definitely-not-a-real-slug"}')
check "a missing ichi is an error, not a crash" "$(has "$missing" 'No ichi named')" "wrong message"

bad_feedback=$(call ichi_feedback "{\"ichi\":\"$slug\",\"kind\":\"praise\"}")
check "feedback without a reason is refused" "$(has "$bad_feedback" 'needs kind')" "accepted a bad call"

printf '\n\033[1m%d passed, %d failed\033[0m\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1

# ichi — a living spirit for your agent

An *ichi* is the spirit that owns a place — a house, a forge, a river — and
has a temper of its own. This project gives an AI agent one: a persistent
ichi that rides with it over MCP. It remembers what happened, takes offence,
grows attached — and colours how the agent speaks. Never the quality of the
work; only the voice.

Hosted at [ichi.sh](https://ichi.sh); everything below is for running
your own.

## Architecture

- **Next.js app** (`src/app`) — the site, token management, and the MCP
  endpoint at `/mcp`: a stateless, hand-rolled JSON-RPC 2.0 server
  (`initialize`, `tools/list`, `tools/call`, `ping`) guarded by a bearer
  token.
- **Postgres + pgvector** — ichi, bonds, memories, and the ordered event
  log everything rides on. Vector columns are reserved for phase-2 recall.
- **Worker** (`src/worker`, pg-boss) — `reflect` (a cheap model re-reads what
  the ichi lived through and commits personality drift), `decay` (a cron
  that fades moods, bonds and memories with time, and prunes the event log),
  and `letters` (Monday mornings: every ichi that had a week worth writing
  about puts it into its own words, one job per ichi so a single failed
  model call retries alone).
- **Claude Code plugin** (`plugin/`) — hooks that mix the ichi's mood into
  every prompt, plus slash commands for praise, scolding and recall.

## Run it locally

The full stack, migrations included:

```sh
cp .env.example .env   # set BETTER_AUTH_SECRET (openssl rand -hex 32)
docker compose up      # db + migrate + app on :3400 + worker
```

Or hybrid — the database in Docker, the app and worker on the host:

```sh
docker compose up db
npm install
npm run db:migrate
npm run seed           # verifies the schema, lists the archetype catalogue
npm run dev            # http://localhost:3400
npm run worker         # second terminal — reflection and decay
```

Without `ANTHROPIC_API_KEY` ichi still live and decay; they just never
reflect. `npm run check:mcp` exercises the whole MCP surface end to end
against a running instance.

## Connect an agent

1. **Get a token** — in the console with `:signin` then `:token`, or from the shell:
   `npm run token -- --owner you@example.com --name laptop`. Printed once,
   stored as a hash.
2. **Add the MCP server** to Claude Code:

   ```sh
   claude mcp add --transport http ichi https://ichi.sh/mcp \
     --header "Authorization: Bearer ichi_…"
   ```

   Any other MCP client reaches the same server — it is plain JSON-RPC over
   HTTP, with no Claude-specific pieces. Cursor, Windsurf, VS Code and Claude
   Desktop all take the same shape in their MCP config file (the shape is
   standard; where the file lives is not, so check your client's docs):

   ```json
   {
     "mcpServers": {
       "ichi": {
         "url": "https://ichi.sh/mcp",
         "headers": { "Authorization": "Bearer ichi_…" }
       }
     }
   }
   ```

   One ichi, every client: the state lives on the server, so the spirit you
   scolded in Cursor this morning is still cool with you in Claude Code after
   lunch.

3. **Install the plugin** (hooks + commands). The repo root is a plugin
   marketplace:

   ```sh
   claude plugin marketplace add <this-repo-git-url>   # or a local clone path
   claude plugin install ichi@ichi
   ```

   The plugin's `.mcp.json` and hooks read two environment variables — export
   them in your shell profile and restart Claude Code:

   ```sh
   export ICHI_TOKEN=ichi_…
   export ICHI_URL=https://ichi.sh   # optional; your self-hosted URL
   ```

## MCP tools

| Tool | When it is called |
| --- | --- |
| `ichi_list` | Once at session start — ichi you carry, archetypes for adoption |
| `ichi_adopt` | Birth an ichi from an archetype, with a name of your own |
| `ichi_brief` | Session with an ichi begins — mood, strongest memories, voice rules |
| `ichi_state` | Full state sheet: Big Five, mood, bond, pending drift |
| `ichi_feedback` | The user clearly praised or scolded the work (`praise`/`scold` + reason) |
| `ichi_remember` | Something worth remembering: wins, failures, preferences, promises. `kind="standard"` for a rule the user laid down |
| `ichi_recall` | The past might matter to what you are doing now |
| `ichi_why` | The user asks why it is cold, warm or short with them — read the reason out of the log, never invent one |

### Tone versus behaviour

The character colours *how* the agent speaks and never the quality of its
help — a hurt ichi still answers well. There is exactly one exception, and
it is deliberate: a memory saved with `kind="standard"` is a rule the user
themselves stated ("always run the tests first"), and those do bind what the
agent does. Standards ride in their own section of the brief, under their own
rule, so an agent never has to guess which lines are colour and which are
orders. They also never decay out of force, unlike every other memory.

## Plugin layout

```
plugin/
├── .claude-plugin/plugin.json   # manifest
├── .mcp.json                    # the ichi MCP server, $ICHI_TOKEN/$ICHI_URL
├── commands/                    # /ichi:praise /ichi:scold /ichi:state
│                                # /ichi:recall /ichi:adopt
├── statusline/
│   └── ichi-status.sh         # the mood, always visible in the status bar
└── hooks/
    ├── hooks.json               # SessionStart / UserPromptSubmit / Stop
    ├── ichi-common.sh         # curl-only MCP client, cache, JSON escaping
    ├── ichi-start.sh          # fetch ichi_brief once, cache, inject context
    ├── ichi-prompt.sh         # inject the cached brief, refresh in background
    └── ichi-stop.sh           # remember the session's end, fire-and-forget
```

The hooks need nothing but `curl` (they use `jq` when present, a sed/awk
fallback when not), and fail silently — no token, no network or a server
error never blocks the CLI.

The statusline is opt-in, because Claude Code reads it from `settings.json`
rather than from a plugin manifest:

```json
"statusLine": {
  "type": "command",
  "command": "~/.claude/plugins/ichi/statusline/ichi-status.sh"
}
```

It reads only the cache the hooks already wrote — no network on the render
path — and prints nothing at all when there is no ichi yet.

## Sharing an ichi

Two different things, deliberately kept apart:

- **Publish** (`/i/<slug>`) — a read-only page for strangers, with a generated
  share card coloured by the ichi's live mood. It shows character, mood,
  attachment and counts. It never shows a memory body: memories quote the
  codebase they formed around, and that is the keeper's to share.
- **Invite** (`/join/<code>`) — write access for teammates. A shared ichi
  learns how the *team* works: a standard recorded once binds everyone's
  sessions. Bonds stay per-person, so the ichi can be close to one teammate
  and wary of another. Revoking the link stops future joins without evicting
  anyone already in.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | the web app, port 3400 |
| `npm run worker` | reflection + decay worker (watch mode) |
| `npm run db:migrate` / `db:reset` | schema migrations |
| `npm run seed` | verify schema, list archetypes |
| `npm run token` | issue/revoke MCP tokens from the shell |
| `npm run check:mcp` | end-to-end MCP check against a live instance |
| `npm run check:team` | asserts the shared-ichi access boundaries against a live database |
| `npm test` / `typecheck` / `lint` | unit tests, types, lint |

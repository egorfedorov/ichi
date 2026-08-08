# ichchi — a living spirit for your agent

An *ichchi* (иччи) is a household spirit in Yakut tradition — the owner of a
place or a thing, with a temper of its own. This project gives an AI agent
one: a persistent ichchi that rides with it over MCP. The ichchi remembers what
happened, takes offence, grows attached — and colours how the agent speaks.
Never the quality of the work; only the voice.

Hosted at [ichchi.sh](https://ichchi.sh); everything below is for running
your own.

## Architecture

- **Next.js app** (`src/app`) — the site, token management, and the MCP
  endpoint at `/mcp`: a stateless, hand-rolled JSON-RPC 2.0 server
  (`initialize`, `tools/list`, `tools/call`, `ping`) guarded by a bearer
  token.
- **Postgres + pgvector** — ichchi, bonds, memories, and the ordered event
  log everything rides on. Vector columns are reserved for phase-2 recall.
- **Worker** (`src/worker`, pg-boss) — two jobs: `reflect` (a cheap model
  re-reads what the ichchi lived through and commits personality drift) and
  `decay` (a cron that fades moods, bonds and memories with time).
- **Claude Code plugin** (`plugin/`) — hooks that mix the ichchi's mood into
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

Without `ANTHROPIC_API_KEY` ichchi still live and decay; they just never
reflect. `npm run check:mcp` exercises the whole MCP surface end to end
against a running instance.

## Connect an agent

1. **Get a token** — at `/settings/tokens` on the site, or from the shell:
   `npm run token -- --owner you@example.com --name laptop`. Printed once,
   stored as a hash.
2. **Add the MCP server** to Claude Code:

   ```sh
   claude mcp add --transport http ichchi https://ichchi.sh/mcp \
     --header "Authorization: Bearer ichi_…"
   ```

3. **Install the plugin** (hooks + commands). The repo root is a plugin
   marketplace:

   ```sh
   claude plugin marketplace add <this-repo-git-url>   # or a local clone path
   claude plugin install ichchi@ichchi
   ```

   The plugin's `.mcp.json` and hooks read two environment variables — export
   them in your shell profile and restart Claude Code:

   ```sh
   export ICHI_TOKEN=ichi_…
   export ICHI_URL=https://ichchi.sh   # optional; your self-hosted URL
   ```

## MCP tools

| Tool | When it is called |
| --- | --- |
| `ichchi_list` | Once at session start — ichchi you carry, archetypes for adoption |
| `ichchi_adopt` | Birth an ichchi from an archetype, with a name of your own |
| `ichchi_brief` | Session with an ichchi begins — mood, strongest memories, voice rules |
| `ichchi_state` | Full state sheet: Big Five, mood, bond, pending drift |
| `ichchi_feedback` | The user clearly praised or scolded the work (`praise`/`scold` + reason) |
| `ichchi_remember` | Something worth remembering: wins, failures, preferences, promises |
| `ichchi_recall` | The past might matter to what you are doing now |

## Plugin layout

```
plugin/
├── .claude-plugin/plugin.json   # manifest
├── .mcp.json                    # the ichchi MCP server, $ICHI_TOKEN/$ICHI_URL
├── commands/                    # /ichchi:praise /ichchi:scold /ichchi:state
│                                # /ichchi:recall /ichchi:adopt
└── hooks/
    ├── hooks.json               # SessionStart / UserPromptSubmit / Stop
    ├── ichchi-common.sh           # curl-only MCP client, cache, JSON escaping
    ├── ichchi-start.sh            # fetch ichchi_brief once, cache, inject context
    ├── ichchi-prompt.sh           # inject the cached brief, refresh in background
    └── ichchi-stop.sh             # remember the session's end, fire-and-forget
```

The hooks need nothing but `curl` (they use `jq` when present, a sed/awk
fallback when not), and fail silently — no token, no network or a server
error never blocks the CLI.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | the web app, port 3400 |
| `npm run worker` | reflection + decay worker (watch mode) |
| `npm run db:migrate` / `db:reset` | schema migrations |
| `npm run seed` | verify schema, list archetypes |
| `npm run token` | issue/revoke MCP tokens from the shell |
| `npm run check:mcp` | end-to-end MCP check against a live instance |
| `npm test` / `typecheck` / `lint` | unit tests, types, lint |

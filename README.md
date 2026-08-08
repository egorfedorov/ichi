# ichi

**Your coding agent has no memory of how you treat it, no standards it holds
you to, and no reason to be anything in particular. ichi is the part that
does.**

A persistent character that rides with your agent over MCP. It remembers what
happened between you, takes offence, grows attached — and it holds the rules
you laid down, in every session, in every tool you work in.

[ichi.mozg.sh](https://ichi.mozg.sh) · a sibling project to
[mozg](https://mozg.sh)

---

## The one-line pitch

> A brain gives your agent knowledge. **ichi gives it a temper — and a memory
> of your standards.**

---

## Why this exists

Every session with a coding agent starts from zero. You explain, again, that
the tests run first. That the schema is not touched without asking. That you
hate ORMs. The agent is helpful, competent, and completely new to you, every
single morning.

Then there is the other half nobody builds: the agent has no *stake*. Praise
and abuse land identically. Nothing accumulates. Working with it is like
working with a very good contractor who is replaced by an identical twin every
night.

ichi fixes both, and it is careful about which is which.

---

## What makes it different

### 1. Standards bind. Mood does not.

This is the line most "AI personality" projects never draw, and it is the
reason this one is safe to actually use.

- **Mood colours the voice only.** A hurt ichi still answers fully, honestly
  and well. That rule ships in the payload on every single call, in writing.
  A sulking assistant that quietly does worse work is not a feature, it is a
  defect with a personality.
- **Standards change behaviour.** A memory saved as `kind="standard"` is a
  rule *you stated* — "always run the tests first" — replayed to every future
  session. Those bind. They ride in their own section of the brief, under
  their own rule, so the agent never has to guess which lines are colour and
  which are orders.

Two rules, stated separately, enforced separately.

### 2. The mechanics are real, not vibes

Nothing here is a prompt that says "act moody".

| Layer | What it is | How fast it moves |
| --- | --- | --- |
| **Reaction** | one event's impact | instant |
| **Mood** | exponential average decaying to a *trait-derived* baseline | hours |
| **Bond** | logarithmic growth, asymmetric damage | weeks |
| **Character** | Big Five, changed only by reflection past a threshold | months |

A scolding lands harder than a praise lifts (−0.8 against +0.6). Bond gain
shrinks toward the ceiling — 10→20 takes an evening, 90→100 takes a season.
Decay is time-anchored, so a cron that fires twice never double-charges. One
angry session cannot rewrite a personality, because drift only commits past a
per-trait threshold. A month of them can.

### 3. It can explain itself

Ask why it is short with you and `ichi_why` reads the answer **out of the
event log** — the scolding on Tuesday, what it cost, what has recovered since,
how far the mood sits from this ichi's own baseline. It never invents a
reason. A companion that cannot show its work is a gimmick; one that can is
something you can repair a relationship with.

### 4. One spirit, every client

A plain MCP server over HTTP. The state lives on the server, so the ichi you
scolded in Cursor this morning is still cool with you in Claude Code after
lunch. Claude Code, Cursor, Codex, Windsurf, VS Code, ChatGPT — same spirit,
same memory, same grudge.

### 5. It grows, and it can end

Reflection runs on a cheap model and commits personality drift. Once a week
each ichi that had a week worth writing about **writes you a letter** in its
own voice about what you lived through together. Bond thresholds unlock real
privileges: being called by name, being told an opinion you did not ask for.
And if you turn it on, a neglected ichi eventually departs — a bond that
cannot be lost is not a bond.

---

## Try it in ten seconds

Go to [ichi.mozg.sh](https://ichi.mozg.sh). The landing *is* the product: a
console you can talk to, on one screen, with nothing to navigate to. Praise it
and watch the payload, the mood curve and the whole room warm. Scold it and
watch the screen tear.

Then close the tab and come back tomorrow. **It remembers you were gone, and
it remembers what you said.**

---

## Connect your agent

```sh
claude mcp add --transport http ichi https://ichi.mozg.sh/mcp \
  --header "Authorization: Bearer ichi_…"
```

Any other MCP client takes the same shape (the shape is standard; where the
config file lives is not — check your client's docs):

```json
{
  "mcpServers": {
    "ichi": {
      "url": "https://ichi.mozg.sh/mcp",
      "headers": { "Authorization": "Bearer ichi_…" }
    }
  }
}
```

Mint the token in the console: `:signin`, then `:token`.

---

## The tools your agent gets

| Tool | When it is called |
| --- | --- |
| `ichi_list` | Once at session start — the ichi you carry, archetypes for adoption |
| `ichi_adopt` | Birth one from an archetype, with a name you pick |
| `ichi_brief` | A session begins — mood, strongest memories, standards, voice rules |
| `ichi_state` | Full state sheet: Big Five, mood, stress, bond, pending drift |
| `ichi_feedback` | The user clearly praised or scolded the work |
| `ichi_remember` | Worth keeping: a win, a wound, a preference — or a `standard` |
| `ichi_recall` | The past might matter to what you are doing now |
| `ichi_why` | "Why are you cold with me?" — answered from the record |

Six archetypes to start from: **sage, ember, drift, steward, hearth, hunter**.
From there it changes on its own, shaped by how you work with it.

---

## Share it

- **Publish** — `/i/<slug>` is a read-only page for strangers, with a share
  card generated per ichi and coloured by its live mood. It shows character,
  mood, attachment and counts, and **never a memory body**: memories quote the
  codebase they formed around, and that is yours to share, not ours.
- **Descend** — take a descendant of someone else's published ichi. It
  inherits the character they actually grew it into, not an archetype's
  factory settings. Temperament is inherited; memory is not.
- **Invite** — `/join/<code>` gives teammates write access. A shared ichi
  learns how the *team* works: a standard recorded once binds everyone's
  sessions. Bonds stay per person, so it can be close to one teammate and wary
  of another. Sharing an ichi does not average it.

---

## How it is built

- **Next.js app** (`src/app`) — the console, the public pages, and the MCP
  endpoint at `/mcp`: a stateless, hand-rolled JSON-RPC 2.0 server, bearer
  auth, per-token rate limiting.
- **Postgres** — ichi, bonds, memories, letters, and the ordered event log
  everything rides on.
- **Worker** (`src/worker`, pg-boss) — `reflect` (commits personality drift),
  `decay` (fades moods, bonds and memories; prunes the log), and `letters`
  (Monday mornings, one job per ichi so a failed model call retries alone).
- **Claude Code plugin** (`plugin/`) — hooks that mix the mood into every
  prompt, a statusline that keeps it visible, and slash commands.

The core mechanics are pure functions with no database, so they stay testable
and the worker is a thin shell over SQL. `npm test` covers them. `npm run
check:team` asserts the shared-access boundaries against a live database,
because a wrong predicate there is a security bug rather than a glitch.

---

## Run your own

```sh
cp .env.example .env   # set BETTER_AUTH_SECRET (openssl rand -hex 32)
docker compose up      # db + migrate + app on :3400 + worker
```

Or hybrid — database in Docker, app on the host:

```sh
docker compose up db
npm install && npm run db:migrate
npm run dev            # http://localhost:3400
npm run worker         # second terminal
```

Without `ANTHROPIC_API_KEY` an ichi still lives, decays and remembers; it just
never reflects and never writes letters.

| Command | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | the web app |
| `npm run worker` | reflection, decay and letters |
| `npm run db:migrate` / `db:reset` | schema migrations |
| `npm run token` | issue/revoke MCP tokens from the shell |
| `npm run check:mcp` | end-to-end MCP check against a live instance |
| `npm run check:team` | shared-access boundaries against a live database |
| `npm test` / `typecheck` / `lint` | unit tests, types, lint |

---

## Honest limits

Worth saying out loud, because a page that only sells is a page you cannot
trust:

- **It will not make your agent smarter.** By design. The character shapes
  tone; standards replay your own rules. Neither improves reasoning, and any
  project claiming otherwise is selling you a prompt.
- **Reflection costs money.** Cheap money — a small model on small inputs,
  with the cost recorded per run — but not zero.
- **Rate limiting is per instance.** Correct for the single-container deploy;
  behind N replicas the limit is N times looser.
- **Recall is keyword and salience.** Vectors are phase two; the extension is
  installed and waiting.
- **Young.** The mechanics are tested and the access boundaries are asserted,
  but this has not been through a year of other people's data yet.

---

## Related

**[mozg](https://mozg.sh)** — the other half. Where ichi gives your agent a
character, mozg gives it your project's actual knowledge, exam-scored so you
know what it does not know yet.

---

An *ichi* is the spirit that owns a place — a house, a forge, a river — and
has a temper of its own. Now your tools have one.

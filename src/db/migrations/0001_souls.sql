-- ═══════════════════════════════════════════════════════════════════════════
-- 0001 — souls: the domain core
--
-- A soul is a server-side, evolving personality state owned by a user and
-- shared with their agents over MCP. Traits are typed columns with CHECK
-- constraints, not a JSONB blob: the database should refuse a personality
-- the mechanics would never produce.
--
-- Three time layers of state, all stored here:
--   reaction   — applied on the request path, lives only inside a call
--   mood       — mood_valence / mood_arousal / stress / energy, decays to a
--                trait-derived baseline (worker cron)
--   traits     — OCEAN columns, change only via pending_drift committed by
--                reflection, so one angry session cannot rewrite a character
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists vector;

create table if not exists souls (
  id                uuid primary key default gen_random_uuid(),
  owner_id          text not null references "user"(id) on delete cascade,
  slug              text not null,
  name              text not null,
  archetype         text not null,

  -- Big Five, 0..100. Typed columns per trait: queries and constraints stay
  -- honest, and a malformed drift commit fails loudly instead of nesting
  -- inside a JSON document.
  openness          smallint not null check (openness between 0 and 100),
  conscientiousness smallint not null check (conscientiousness between 0 and 100),
  extraversion      smallint not null check (extraversion between 0 and 100),
  agreeableness     smallint not null check (agreeableness between 0 and 100),
  neuroticism       smallint not null check (neuroticism between 0 and 100),

  -- Current mood, -1..1. Real, not smallint: decay integrates in fractions.
  mood_valence      real not null default 0 check (mood_valence between -1 and 1),
  mood_arousal      real not null default 0 check (mood_arousal between -1 and 1),
  stress            real not null default 0 check (stress between 0 and 1),
  energy            real not null default 0.7 check (energy between 0 and 1),

  -- Personality mutations accumulated from events but not yet committed by
  -- reflection: {trait: points}. Committed only past a threshold, so a single
  -- session of flattery or abuse cannot rewrite the character.
  pending_drift     jsonb not null default '{}',

  -- Mannerisms and beliefs the soul formed in reflection, rendered into the
  -- voice block. Free text, not a list: reflection rewrites it whole.
  voice_notes       text,

  interactions      int not null default 0,
  reflected_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint souls_slug_format check (slug ~ '^[a-z0-9][a-z0-9_-]{0,38}$'),
  unique (owner_id, slug)
);

-- ─── bonds ──────────────────────────────────────────────────────────────────
-- Multi-user from day one: a soul relates to each person it works with
-- separately. (soul_id, user_id) is the natural key.

create table if not exists bonds (
  soul_id             uuid not null references souls(id) on delete cascade,
  user_id             text not null references "user"(id) on delete cascade,
  trust               smallint not null default 30 check (trust between 0 and 100),
  bond                smallint not null default 10 check (bond between 0 and 100),
  last_interaction_at timestamptz,
  primary key (soul_id, user_id)
);

-- ─── memories ───────────────────────────────────────────────────────────────
-- Retrieval in MVP is salience × recency with an ILIKE match; pgvector
-- columns are phase 2, which is why the extension exists but no vector
-- column does yet.

create table if not exists memories (
  id               uuid primary key default gen_random_uuid(),
  soul_id          uuid not null references souls(id) on delete cascade,
  body             text not null,
  kind             text not null
                   check (kind in ('event', 'insult', 'praise', 'belief', 'fact')),
  -- Emotional charge, -1..1. Kept separate from salience: a memory can be
  -- important because it hurt, not because it mattered much at the time.
  valence          real not null default 0 check (valence between -1 and 1),
  -- How strongly it was stamped, 0..1. Decays on the worker cron.
  salience         real not null default 0.5 check (salience between 0 and 1),
  recall_count     int not null default 0,
  created_at       timestamptz not null default now(),
  last_recalled_at timestamptz
);

create index if not exists memories_soul_idx on memories (soul_id, salience desc);

-- ─── soul events ────────────────────────────────────────────────────────────
-- The visible log of what the soul lived through: every MCP call, every
-- explicit feedback, every reflection and decay pass. Reflection reads this
-- table; the soul page renders it.

create table if not exists soul_events (
  id         uuid primary key default gen_random_uuid(),
  soul_id    uuid not null references souls(id) on delete cascade,
  user_id    text references "user"(id) on delete set null,
  kind       text not null check (kind in ('call', 'feedback', 'reflect', 'decay')),
  tool       text,
  -- Trimmed at the writer (a few hundred chars): the log exists so a person
  -- can read what shaped the soul, not to mirror whole conversations.
  text       text,
  -- 'praise' | 'scold' | null — the explicit signal when there was one.
  signal     text,
  -- What the event changed: {mood: {…}, drift: {…}, bond: n}. jsonb because
  -- the shape evolves with the mechanics and is read by humans, not joined on.
  delta      jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists soul_events_soul_idx on soul_events (soul_id, created_at desc);

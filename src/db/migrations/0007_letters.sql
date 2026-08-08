-- ═══════════════════════════════════════════════════════════════════════════
-- 0007 — the weekly letter
--
-- Reflection already reads what an ichchi lived through, but it writes for the
-- machine: drift numbers, memory rows, a voice note. Nothing it produces is
-- addressed to the person.
--
-- The letter is. Once a week the ichchi writes to its keeper in its own voice
-- about the week they had — what it noticed, what stung, what it is still
-- pleased about. That is the reason to come back to the site at all: state
-- pages are checked once and then never again, but something that wrote to you
-- gets read.
--
-- One letter per ichchi per period, enforced by the unique index rather than
-- by the job being careful, because a retried job must never produce two.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists letters (
  id          uuid primary key default gen_random_uuid(),
  ichchi_id   uuid not null references ichchi(id) on delete cascade,
  -- The Monday that starts the week this letter covers, in UTC.
  period_start date not null,
  body        text not null,
  -- What the week actually contained, for the page to show beside the prose:
  -- {events, praise, scold, memories, costCents}.
  stats       jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

create unique index if not exists letters_period_idx
  on letters (ichchi_id, period_start);

create index if not exists letters_recent_idx
  on letters (ichchi_id, period_start desc);

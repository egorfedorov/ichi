-- ═══════════════════════════════════════════════════════════════════════════
-- 0006 — an ichchi a team shares
--
-- The hard part was already done in 0001: `bonds` is keyed (ichchi_id,
-- user_id), so one ichchi relating to several people differently has been the
-- data model from the first migration. What was missing was permission — only
-- the owner could reach it. This table is that, and nothing more.
--
-- Why a team ichchi is worth having: a personal one learns how *you* work, a
-- shared one learns how the *team* works. "We always write the test first"
-- stops being folklore a new hire absorbs over months and becomes a standard
-- every agent on the repo is handed on its first call.
--
-- Note what is NOT shared: each member keeps their own bond row, so the ichchi
-- can be close to the person who has been kind to it and wary of the one who
-- has not, inside the same team. Sharing an ichchi is not averaging it.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists ichchi_members (
  ichchi_id  uuid not null references ichchi(id) on delete cascade,
  user_id    text not null references "user"(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (ichchi_id, user_id)
);

create index if not exists ichchi_members_user_idx on ichchi_members (user_id);

-- The invitation. Null until the owner opens the ichchi up, and clearing it
-- revokes every future join without touching the people who already joined —
-- a link that leaked should be cancellable without evicting the team.
alter table ichchi add column if not exists join_code text;

create unique index if not exists ichchi_join_code_idx
  on ichchi (join_code)
  where join_code is not null;

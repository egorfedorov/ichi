-- ═══════════════════════════════════════════════════════════════════════════
-- 0003 — rename the domain from "soul" to "ichchi"
--
-- "soul" is a crowded name in this space; the product is called ichchi, and
-- mixed naming is worse than either choice. 0001/0002 are left exactly as
-- they were applied — a migration that already ran is history, not a draft —
-- so a fresh database creates the old names and this file renames them one
-- step later. Every statement is guarded, so the file is a no-op on a
-- database that has already been through it.
--
-- The MCP tool names changed in step with this (soul_* → ichchi_*), which is
-- a breaking change for any already-connected client: they must reconnect to
-- pick up the new tools/list.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
begin
  if to_regclass('public.souls') is not null then
    alter table souls rename to ichchi;
  end if;
  if to_regclass('public.soul_events') is not null then
    alter table soul_events rename to ichchi_events;
  end if;
  if to_regclass('public.soul_tokens') is not null then
    alter table soul_tokens rename to ichchi_tokens;
  end if;
end $$;

-- The foreign-key columns. information_schema is the portable way to ask
-- "does this column still carry the old name".
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'bonds' and column_name = 'soul_id'
  ) then
    alter table bonds rename column soul_id to ichchi_id;
  end if;

  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'memories' and column_name = 'soul_id'
  ) then
    alter table memories rename column soul_id to ichchi_id;
  end if;

  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'ichchi_events' and column_name = 'soul_id'
  ) then
    alter table ichchi_events rename column soul_id to ichchi_id;
  end if;
end $$;

-- Indexes and constraints carry the old word in their names too. Cosmetic,
-- but a schema dump is documentation and half-renamed documentation lies.
do $$
begin
  if to_regclass('public.memories_soul_idx') is not null then
    alter index memories_soul_idx rename to memories_ichchi_idx;
  end if;
  if to_regclass('public.soul_events_soul_idx') is not null then
    alter index soul_events_soul_idx rename to ichchi_events_ichchi_idx;
  end if;
  if to_regclass('public.soul_tokens_user_idx') is not null then
    alter index soul_tokens_user_idx rename to ichchi_tokens_user_idx;
  end if;

  if exists (
    select 1 from pg_constraint where conname = 'souls_slug_format'
  ) then
    alter table ichchi rename constraint souls_slug_format to ichchi_slug_format;
  end if;
end $$;

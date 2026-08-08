-- ═══════════════════════════════════════════════════════════════════════════
-- 0010 — ichchi → ichi
--
-- Four letters instead of six, and it matches what the codebase already used
-- everywhere it mattered: the token prefix has been `ichi_` since migration
-- 0002, and the plugin has read $ICHI_TOKEN / $ICHI_URL from the start. The
-- long spelling was the odd one out.
--
-- Same discipline as 0003: applied migrations are history, not drafts, so the
-- earlier files keep their names and this one moves the schema forward.
-- Guarded throughout, so it is a no-op on a database already at this shape.
--
-- Breaking for connected clients again: the MCP tools are ichi_* now, so
-- anything already talking to /mcp has to reconnect to pick up tools/list.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
begin
  if to_regclass('ichchi') is not null then
    alter table ichchi rename to ichi;
  end if;
  if to_regclass('ichchi_events') is not null then
    alter table ichchi_events rename to ichi_events;
  end if;
  if to_regclass('ichchi_tokens') is not null then
    alter table ichchi_tokens rename to ichi_tokens;
  end if;
  if to_regclass('ichchi_members') is not null then
    alter table ichchi_members rename to ichi_members;
  end if;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array['bonds', 'memories', 'ichi_events', 'ichi_members'] loop
    if exists (
      select 1 from information_schema.columns
       where table_schema = current_schema() and table_name = t and column_name = 'ichchi_id'
    ) then
      execute format('alter table %I rename column ichchi_id to ichi_id', t);
    end if;
  end loop;

  if exists (
    select 1 from information_schema.columns
     where table_schema = current_schema() and table_name = 'letters' and column_name = 'ichchi_id'
  ) then
    alter table letters rename column ichchi_id to ichi_id;
  end if;
end $$;

-- Index and constraint names carry the old spelling too. A schema dump is
-- documentation, and half-renamed documentation lies.
do $$
begin
  if to_regclass('ichchi_public_slug_idx') is not null then
    alter index ichchi_public_slug_idx rename to ichi_public_slug_idx;
  end if;
  if to_regclass('ichchi_join_code_idx') is not null then
    alter index ichchi_join_code_idx rename to ichi_join_code_idx;
  end if;
  if to_regclass('ichchi_living_idx') is not null then
    alter index ichchi_living_idx rename to ichi_living_idx;
  end if;
  if to_regclass('ichchi_parent_idx') is not null then
    alter index ichchi_parent_idx rename to ichi_parent_idx;
  end if;
  if to_regclass('ichchi_members_user_idx') is not null then
    alter index ichchi_members_user_idx rename to ichi_members_user_idx;
  end if;
  if to_regclass('ichchi_events_ichchi_idx') is not null then
    alter index ichchi_events_ichchi_idx rename to ichi_events_ichi_idx;
  end if;
  if to_regclass('ichchi_tokens_user_idx') is not null then
    alter index ichchi_tokens_user_idx rename to ichi_tokens_user_idx;
  end if;
  if to_regclass('memories_ichchi_idx') is not null then
    alter index memories_ichchi_idx rename to memories_ichi_idx;
  end if;

  if exists (select 1 from pg_constraint where conname = 'ichchi_slug_format') then
    alter table ichi rename constraint ichchi_slug_format to ichi_slug_format;
  end if;
  if exists (select 1 from pg_constraint where conname = 'ichchi_public_slug_format') then
    alter table ichi rename constraint ichchi_public_slug_format to ichi_public_slug_format;
  end if;
end $$;

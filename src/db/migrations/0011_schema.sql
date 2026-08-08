-- ═══════════════════════════════════════════════════════════════════════════
-- 0011 — move ichi's tables into their own schema
--
-- A no-op unless DB_SCHEMA is set to something other than "public", which is
-- what every existing install and the current production database use.
--
-- The point is sharing a database with a sibling product without sharing a
-- namespace: ichi's tables move into `ichi`, while user/session/account stay
-- in public owned by whoever migrates them. That keeps the thing that actually
-- causes outages — two migration runners touching the same table names —
-- impossible, while still allowing one account and one plan across both.
--
-- Runs against `current_schema()` rather than a hardcoded name because the
-- schema comes from the environment; the runner has already put it first on
-- the search_path.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  t text;
  target text := current_schema();
begin
  if target = 'public' then
    return;  -- nothing to move; this install is not sharing a database
  end if;

  foreach t in array array[
    'ichi', 'ichi_events', 'ichi_tokens', 'ichi_members',
    'bonds', 'memories', 'letters'
  ] loop
    -- Only move a table that is still in public AND has no namesake already
    -- waiting in the target: re-running this must never clobber live data.
    if to_regclass('public.' || t) is not null
       and to_regclass(target || '.' || t) is null then
      execute format('alter table public.%I set schema %I', t, target);
    end if;
  end loop;
end $$;

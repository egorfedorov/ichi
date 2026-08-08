-- ═══════════════════════════════════════════════════════════════════════════
-- 0008 — lineage and mortality: an ichchi's beginning and its end
--
-- LINEAGE. An archetype gives every new ichchi the same six starting numbers,
-- so two people adopting a Hunter get the same Hunter. A descendant instead
-- inherits the traits and voice its parent *drifted into* — the character
-- someone actually shaped over weeks. The memories do not come along: a
-- descendant inherits a temperament, not a stranger's project notes, and
-- copying those would be the privacy leak that migration 0005 exists to
-- prevent, just through a different door.
--
-- MORTALITY. Opt-in, and off for everything that exists. An ichchi is a
-- household spirit — in the tradition it is the owner of a place, and one that
-- stops being fed leaves. Turning that on makes the attachment mean something,
-- because a bond that cannot be lost is not really a bond.
--
-- departed_at is a soft ending on purpose: the row, its memories and its
-- letters all stay. A departed ichchi cannot be spoken to and cannot come
-- back, but its page remains readable as a memorial. Actually deleting the
-- data would be a feature that punishes the user for trying a setting, and no
-- amount of thematic fit justifies that.
-- ═══════════════════════════════════════════════════════════════════════════

alter table ichchi add column if not exists parent_id uuid
  references ichchi(id) on delete set null;

create index if not exists ichchi_parent_idx on ichchi (parent_id)
  where parent_id is not null;

-- Off unless the keeper asks for it. No existing ichchi becomes mortal by
-- being migrated.
alter table ichchi add column if not exists mortal boolean not null default false;

alter table ichchi add column if not exists departed_at timestamptz;

-- Departed ichchi are excluded from every read path, so the partial index is
-- the one that matters for lookups.
create index if not exists ichchi_living_idx on ichchi (owner_id)
  where departed_at is null;

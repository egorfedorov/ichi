-- ═══════════════════════════════════════════════════════════════════════════
-- 0004 — standards: the memory kind that is allowed to change behaviour
--
-- Every other kind of memory is colour. A 'standard' is a rule the person
-- works by ("always write the test first", "never touch the schema without
-- asking") and it is the one thing an ichchi remembers that may legitimately
-- change WHAT the agent does, not merely how it sounds.
--
-- The split matters for safety: mood must never lower the quality of help, so
-- a sulking ichchi still answers well. A standard is not mood — it is the
-- user's own instruction, replayed. Keeping them in separate kinds is what
-- lets the voice block state one rule for each.
--
-- Standards also decay differently: see STANDARD_SALIENCE_FLOOR in
-- lib/memory.ts. A rule the user stated once should still be in force a month
-- later, so it never fades below the floor.
-- ═══════════════════════════════════════════════════════════════════════════

alter table memories drop constraint if exists memories_kind_check;

alter table memories add constraint memories_kind_check
  check (kind in ('event', 'insult', 'praise', 'belief', 'fact', 'standard'));

-- Standards are read on every brief, filtered by kind. Without this the
-- brief's standards query is a sequential scan over the whole memory table.
create index if not exists memories_standards_idx
  on memories (ichchi_id, salience desc)
  where kind = 'standard';

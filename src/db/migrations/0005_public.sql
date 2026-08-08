-- ═══════════════════════════════════════════════════════════════════════════
-- 0005 — a public face for an ichchi
--
-- An ichchi is private by default and stays that way until its owner says
-- otherwise: public_slug is null for every existing row and only a deliberate
-- publish fills it.
--
-- The slug is separate from `slug` on purpose. `slug` is unique per owner, so
-- two people may both have a "hunter" — fine for /ichchi/hunter behind a
-- session, useless as a public address. public_slug is globally unique and
-- carries a random suffix, which also means a published page cannot be found
-- by guessing names.
--
-- What the public page may show is a product decision enforced here in the
-- comment and in the query that feeds it: character, mood, bond and counts —
-- never memory bodies. A memory reads "the user hates ORMs" or worse, quotes
-- the project. Publishing a temperament must never publish a codebase.
-- ═══════════════════════════════════════════════════════════════════════════

alter table ichchi add column if not exists public_slug text;

create unique index if not exists ichchi_public_slug_idx
  on ichchi (public_slug)
  where public_slug is not null;

alter table ichchi drop constraint if exists ichchi_public_slug_format;
alter table ichchi add constraint ichchi_public_slug_format
  check (public_slug is null or public_slug ~ '^[a-z0-9][a-z0-9-]{2,46}$');

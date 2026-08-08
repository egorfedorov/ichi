-- ═══════════════════════════════════════════════════════════════════════════
-- 0002 — MCP access tokens
--
-- Bearer tokens (`ichi_...`) that let Claude Code / Kimi Code reach the MCP
-- endpoint as a specific user. Only the SHA-256 hash is stored — a database
-- dump must not hand anyone a working key.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists soul_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      text not null references "user"(id) on delete cascade,
  token_hash   text not null unique,
  prefix       text not null,          -- first 12 chars, for display
  name         text,
  last_used_at timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists soul_tokens_user_idx on soul_tokens (user_id)
  where revoked_at is null;

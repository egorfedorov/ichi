import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { maybeOne, query } from "@/db";

/**
 * MCP access tokens.
 *
 * Stored as a SHA-256 hash — a database dump must not hand anyone a working
 * key. The plaintext is shown once, at creation, and never again.
 */

const PREFIX = "ichi_";

export interface IssuedToken {
  /** Plaintext. Shown once. */
  token: string;
  id: string;
  prefix: string;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function issueToken(userId: string, name?: string): Promise<IssuedToken> {
  const token = PREFIX + randomBytes(24).toString("base64url");
  const prefix = token.slice(0, 12);

  const row = await maybeOne<{ id: string }>(
    `insert into ichi_tokens (user_id, token_hash, prefix, name)
     values ($1, $2, $3, $4) returning id`,
    [userId, hashToken(token), prefix, name ?? null],
  );

  return { token, id: row!.id, prefix };
}

export interface TokenOwner {
  userId: string;
  tokenId: string;
}

/** Resolve a bearer token to its owner, or null. Also stamps last_used_at. */
export async function verifyToken(raw: string | null): Promise<TokenOwner | null> {
  if (!raw) return null;
  const token = raw.replace(/^Bearer\s+/i, "").trim();
  if (!token.startsWith(PREFIX)) return null;

  const hash = hashToken(token);
  const row = await maybeOne<{
    id: string;
    user_id: string;
    token_hash: string;
  }>(
    `select id, user_id, token_hash
       from ichi_tokens
      where token_hash = $1 and revoked_at is null`,
    [hash],
  );
  if (!row) return null;

  // The lookup already matched on the hash; this is belt-and-braces against a
  // future change that makes the comparison non-constant-time.
  const a = Buffer.from(row.token_hash, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  // Fire-and-forget: a failed timestamp update must not fail the tool call.
  void query(`update ichi_tokens set last_used_at = now() where id = $1`, [row.id]).catch(
    () => {},
  );

  return { userId: row.user_id, tokenId: row.id };
}

export async function revokeToken(userId: string, tokenId: string): Promise<void> {
  await query(
    `update ichi_tokens set revoked_at = now() where id = $1 and user_id = $2`,
    [tokenId, userId],
  );
}

/** Live tokens per account. A cap, so a stuck button cannot mint hundreds. */
const MAX_ACTIVE_TOKENS = 20;

export async function issueLimitReached(userId: string): Promise<boolean> {
  const rows = await query<{ n: number }>(
    `select count(*)::int as n from ichi_tokens
      where user_id = $1 and revoked_at is null`,
    [userId],
  );
  return rows[0].n >= MAX_ACTIVE_TOKENS;
}

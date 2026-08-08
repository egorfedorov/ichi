import { Pool, type PoolClient } from "pg";
import { env } from "@/lib/env";

/**
 * One pool for the whole process. Next dev-mode reloads modules, so stash it on
 * globalThis or you leak a pool per hot reload until Postgres runs out of slots.
 */
const globalForDb = globalThis as unknown as { _ichiPool?: Pool };

export const pool =
  globalForDb._ichiPool ??
  new Pool({
    connectionString: env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    // Set per connection rather than per query: pg hands out pooled
    // connections, so a search_path set once at startup would apply to
    // whichever connection happened to run that statement and to no other.
    //
    // `<schema>, public` and not the reverse — ichi's own tables must win over
    // anything of the same name in the shared namespace, while `user` and
    // `session` still resolve to the shared ones.
    options: `-c search_path=${env.DB_SCHEMA},public`,
  });

if (process.env.NODE_ENV !== "production") globalForDb._ichiPool = pool;

export async function query<T extends object = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await pool.query<T>(text, params as never[]);
  return res.rows;
}

/** Exactly-zero-or-one row. Throws if the query returned more than one. */
export async function maybeOne<T extends object = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  if (rows.length > 1) {
    throw new Error(`Expected at most 1 row, got ${rows.length}`);
  }
  return rows[0] ?? null;
}

/** Exactly one row. Throws if zero. */
export async function one<T extends object = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T> {
  const row = await maybeOne<T>(text, params);
  if (!row) throw new Error("Expected 1 row, got 0");
  return row;
}

export async function tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

/** pgvector wants '[1,2,3]' as a string literal, not a JS array. (Phase 2.) */
export function toVector(values: number[]): string {
  return `[${values.join(",")}]`;
}

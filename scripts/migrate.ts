/**
 * SQL migration runner. Applies src/db/migrations/*.sql in filename order,
 * once each, inside a transaction.
 *
 *   npm run db:migrate          apply pending
 *   npm run db:reset            drop everything, then apply all
 *
 * 0000_auth.sql carries better-auth's own tables. They used to come from its
 * CLI, which does nothing inside a container — see the note in that file.
 */
import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "..", "src", "db", "migrations");

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://ichi:ichi@localhost:5433/ichi";

/**
 * The schema ichi's tables and its own migration ledger live in.
 *
 * The ledger has to move with the tables. Two products sharing a database each
 * keep a `_migrations` table, and in one namespace they would read each
 * other's rows — every migration would look already-applied, and the schema
 * would silently never move.
 */
const SCHEMA = process.env.DB_SCHEMA ?? "public";
if (!/^[a-z_][a-z0-9_]*$/.test(SCHEMA)) {
  throw new Error(`DB_SCHEMA must be a bare identifier, got "${SCHEMA}"`);
}

async function main() {
  const reset = process.argv.includes("--reset");
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    if (reset) {
      console.log(`⚠  dropping schema ${SCHEMA}`);
      await client.query(`drop schema if exists ${SCHEMA} cascade`);
    }

    await client.query(`create schema if not exists ${SCHEMA}`);
    // Every statement below, and every statement inside the migration files,
    // resolves against this. public stays on the path so a migration can still
    // reference the shared identity tables it does not own.
    await client.query(`set search_path to ${SCHEMA}, public`);

    await client.query(`
      create table if not exists _migrations (
        name       text primary key,
        applied_at timestamptz not null default now()
      )
    `);

    const applied = new Set(
      (await client.query<{ name: string }>("select name from _migrations")).rows.map(
        (r) => r.name,
      ),
    );

    const files = (await readdir(migrationsDir))
      .filter((f) => f.endsWith(".sql"))
      .sort();

    let count = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await readFile(join(migrationsDir, file), "utf8");
      process.stdout.write(`→ ${file} `);
      try {
        await client.query("begin");
        await client.query(sql);
        await client.query("insert into _migrations (name) values ($1)", [file]);
        await client.query("commit");
        console.log("ok");
        count++;
      } catch (err) {
        await client.query("rollback");
        console.log("FAILED");
        throw err;
      }
    }

    console.log(count ? `\n✓ applied ${count} migration(s)` : "\n✓ up to date");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("\n" + (err instanceof Error ? err.message : String(err)));
  process.exit(1);
});

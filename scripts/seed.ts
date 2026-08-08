/**
 * Verify the archetype catalogue and the database schema.
 *
 *   npm run seed
 *
 * Archetypes live in code (src/lib/ichi.ts), not in the database — they ship
 * with the release like copy does. So there is nothing to insert; what this
 * script does is fail early on the two ways a fresh install is broken: the
 * database is unreachable, or the migrations never ran.
 */
import { pool, query } from "@/db";
import { ARCHETYPES } from "@/lib/ichi";

async function main() {
  const migrations = await query<{ name: string }>(
    `select name from _migrations order by name`,
  );
  for (const required of ["0000_auth.sql", "0001_souls.sql", "0002_tokens.sql"]) {
    if (!migrations.some((m) => m.name === required)) {
      throw new Error(`migration ${required} has not run — run npm run db:migrate first`);
    }
  }

  const ichi = await query<{ n: number }>(`select count(*)::int as n from ichi`);

  console.log(`✓ schema is current, ${ichi[0].n} ichi(s) adopted so far\n`);
  console.log("Archetype catalogue:");
  for (const a of ARCHETYPES) {
    const t = a.traits;
    console.log(
      `  ${a.id.padEnd(18)} ${a.name.padEnd(24)} O${t.openness} C${t.conscientiousness} E${t.extraversion} A${t.agreeableness} N${t.neuroticism}`,
    );
  }
  console.log("");
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  })
  .finally(() => pool.end());

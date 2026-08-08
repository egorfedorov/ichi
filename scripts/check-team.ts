/**
 * Access-boundary check for shared ichchi (migration 0006).
 *
 * Membership is the one place in this codebase where a wrong SQL predicate is
 * a security bug rather than a glitch: too loose and a stranger reads a team's
 * standards, too tight and the feature silently does nothing. Both failures
 * are invisible in the UI, so they get a script instead of a code review.
 *
 * Needs a live database (docker compose up db && npm run db:migrate).
 * Cleans up after itself.
 */
import { query } from "@/db";
import { adoptIchchi, setJoinCode, joinByCode, getAccessibleIchchi, listAccessibleIchchi } from "@/lib/ichchi";

async function main() {
  const owner = "team-owner", mate = "team-mate", stranger = "team-stranger";
  for (const [id, email] of [[owner,"o@x.io"],[mate,"m@x.io"],[stranger,"s@x.io"]] as [string,string][]) {
    await query(`insert into "user" (id,name,email,"emailVerified","createdAt","updatedAt")
                 values ($1,$1,$2,true,now(),now()) on conflict (id) do nothing`, [id, email]);
  }
  await query(`delete from ichchi where owner_id = $1`, [owner]);
  const i = await adoptIchchi(owner, "steward", "Repo Keeper");

  const before = await getAccessibleIchchi(mate, i.slug);
  console.log("mate before join      :", before ? "ACCESS (BUG)" : "no access  ✓");

  const code = await setJoinCode(owner, i.slug, true);
  const again = await setJoinCode(owner, i.slug, true);
  console.log("code stable on re-issue:", code === again ? "yes ✓" : "NO (BUG)");

  await joinByCode(mate, code!);
  const after = await getAccessibleIchchi(mate, i.slug);
  console.log("mate after join       :", after ? "access ✓" : "NO ACCESS (BUG)");

  const str = await getAccessibleIchchi(stranger, i.slug);
  console.log("stranger              :", str ? "ACCESS (BUG)" : "no access  ✓");

  const mateList = await listAccessibleIchchi(mate);
  const row = mateList.find(x => x.id === i.id);
  console.log("shows in mate's list  :", row ? "yes ✓" : "NO (BUG)");
  console.log("marked as not-owned   :", row && row.owner_id !== mate ? "yes ✓" : "NO (BUG)");

  await setJoinCode(owner, i.slug, false);
  const stillIn = await getAccessibleIchchi(mate, i.slug);
  console.log("revoke keeps members  :", stillIn ? "yes ✓" : "NO (BUG)");
  const lateJoin = await joinByCode(stranger, code!);
  console.log("revoked code rejected :", lateJoin ? "NO (BUG)" : "yes ✓");
  await query(`delete from ichchi where owner_id = $1`, [owner]);
  await query(`delete from "user" where id = any($1::text[])`, [[owner, mate, stranger]]);
  console.log("\ncleaned up.");
  process.exit(0);
}
main();

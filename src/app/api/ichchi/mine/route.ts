import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { bondFor, listAccessibleIchchi } from "@/lib/ichchi";
import { moodWords } from "@/lib/voice";

/**
 * The console's `:mine`. A projection shaped for one line of terminal each —
 * the full state sheet is what ichchi_state is for, and duplicating it here
 * would mean two things to keep in step.
 */
export async function GET(req: Request) {
  let user;
  try {
    user = await requireUser(req);
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rows = await listAccessibleIchchi(user.id);
  const ichchi = await Promise.all(
    rows.map(async (i) => ({
      name: i.name,
      slug: i.slug,
      archetype: i.archetype,
      mood: moodWords(i),
      bond: (await bondFor(i.id, user.id)).bond,
      shared: i.owner_id !== user.id,
    })),
  );

  return NextResponse.json({ ichchi });
}

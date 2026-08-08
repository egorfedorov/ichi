import { NextResponse } from "next/server";
import { query } from "@/db";
import { requireUser } from "@/lib/session";
import { adoptIchi, archetypeById, setJoinCode, setPublic } from "@/lib/ichi";

/**
 * Session-authenticated adopt endpoint for the web form. The MCP server
 * exposes the same action to agents under bearer auth — same adoptIchi,
 * different doorman.
 */
export async function POST(req: Request) {
  let user;
  try {
    user = await requireUser(req);
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    archetype?: string;
    name?: string;
  };

  const archetype = typeof body.archetype === "string" ? body.archetype : "";
  if (!archetypeById(archetype)) {
    return NextResponse.json({ error: "неизвестный архетип" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name.length < 2 || name.length > 40) {
    return NextResponse.json(
      { error: "имя — от 2 до 40 символов" },
      { status: 400 },
    );
  }

  const ichi = await adoptIchi(user.id, archetype, name);
  return NextResponse.json({ slug: ichi.slug }, { status: 201 });
}

/**
 * Publish or unpublish an ichi. Scoped to the caller's own ichi by
 * setPublic(), so one account can never publish another's.
 */
export async function PATCH(req: Request) {
  let user;
  try {
    user = await requireUser(req);
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    slug?: string;
    public?: boolean;
    shared?: boolean;
    mortal?: boolean;
  };
  if (typeof body.slug !== "string") {
    return NextResponse.json({ error: "slug required" }, { status: 400 });
  }

  try {
    const out: { publicSlug?: string | null; joinCode?: string | null; mortal?: boolean } = {};
    if (typeof body.public === "boolean") {
      out.publicSlug = await setPublic(user.id, body.slug, body.public);
    }
    if (typeof body.shared === "boolean") {
      out.joinCode = await setJoinCode(user.id, body.slug, body.shared);
    }
    if (typeof body.mortal === "boolean") {
      // Scoped by owner_id, and refuses to touch an ichi that has already
      // departed — there is nothing to toggle once it is gone.
      await query(
        `update ichi set mortal = $3
          where owner_id = $1 and slug = $2 and departed_at is null`,
        [user.id, body.slug, body.mortal],
      );
      out.mortal = body.mortal;
    }
    return NextResponse.json(out);
  } catch {
    return NextResponse.json({ error: "no such ichi" }, { status: 404 });
  }
}

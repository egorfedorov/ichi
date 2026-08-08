import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { adoptIchchi, archetypeById, setJoinCode, setPublic } from "@/lib/ichchi";

/**
 * Session-authenticated adopt endpoint for the web form. The MCP server
 * exposes the same action to agents under bearer auth — same adoptIchchi,
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

  const ichchi = await adoptIchchi(user.id, archetype, name);
  return NextResponse.json({ slug: ichchi.slug }, { status: 201 });
}

/**
 * Publish or unpublish an ichchi. Scoped to the caller's own ichchi by
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
  };
  if (typeof body.slug !== "string") {
    return NextResponse.json({ error: "slug required" }, { status: 400 });
  }

  try {
    const out: { publicSlug?: string | null; joinCode?: string | null } = {};
    if (typeof body.public === "boolean") {
      out.publicSlug = await setPublic(user.id, body.slug, body.public);
    }
    if (typeof body.shared === "boolean") {
      out.joinCode = await setJoinCode(user.id, body.slug, body.shared);
    }
    return NextResponse.json(out);
  } catch {
    return NextResponse.json({ error: "no such ichchi" }, { status: 404 });
  }
}

import { NextResponse } from "next/server";
import { query } from "@/db";
import type { IchiToken } from "@/db/types";
import { requireUser } from "@/lib/session";
import { issueLimitReached, issueToken, revokeToken } from "@/lib/tokens";

/**
 * Session-authenticated token management for the settings page. The MCP
 * endpoint itself authenticates with these tokens, not with the session.
 */

export async function GET(req: Request) {
  let user;
  try {
    user = await requireUser(req);
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const tokens = await query<IchiToken>(
    `select id, prefix, name, last_used_at, created_at
       from ichi_tokens
      where user_id = $1 and revoked_at is null
      order by created_at desc`,
    [user.id],
  );
  // token_hash is selected into the row type but never leaves the server.
  return NextResponse.json({ tokens });
}

export async function POST(req: Request) {
  let user;
  try {
    user = await requireUser(req);
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (await issueLimitReached(user.id)) {
    return NextResponse.json(
      { error: "too many active tokens — revoke one first" },
      { status: 429 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { name?: string };
  const name = typeof body.name === "string" ? body.name.slice(0, 60) : undefined;

  const issued = await issueToken(user.id, name || undefined);
  // The plaintext goes out in this response and is never retrievable again.
  return NextResponse.json(issued, { status: 201 });
}

export async function DELETE(req: Request) {
  let user;
  try {
    user = await requireUser(req);
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { id?: string };
  if (!body.id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  // revokeToken is scoped by user_id, so one account cannot revoke another's.
  await revokeToken(user.id, body.id);
  return NextResponse.json({ ok: true });
}

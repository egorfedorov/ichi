import { NextResponse } from "next/server";
import { query } from "@/db";
import type { IchiToken } from "@/db/types";
import { requireUser } from "@/lib/session";
import { revokeToken } from "@/lib/tokens";

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

/**
 * Minting moved to mozg's account page.
 *
 * Both products share one account, and credentials for both are managed in one
 * place — /settings/tokens on mozg — so nobody has to remember which product
 * owns which token. Left as an explicit 410 rather than deleted: a route that
 * quietly 404s reads as a bug, and anything still POSTing here deserves to be
 * told where the door moved.
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Tokens are issued at https://mozg.sh/settings/tokens?t=ichi — same account, both products in one place.",
    },
    { status: 410 },
  );
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

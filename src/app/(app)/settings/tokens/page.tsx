import { redirect } from "next/navigation";
import { query } from "@/db";
import type { IchchiToken } from "@/db/types";
import { currentUser } from "@/lib/session";
import TokenManager from "./TokenManager";

export const dynamic = "force-dynamic";

export const metadata = { title: "Tokens — ichchi" };

export default async function TokensPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/settings/tokens");

  const tokens = await query<IchchiToken>(
    `select id, prefix, name, last_used_at, created_at
       from ichchi_tokens
      where user_id = $1 and revoked_at is null
      order by created_at desc`,
    [user.id],
  );

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <p className="text-sm text-snow-3">{user.email}</p>
      <h1 className="mt-1 text-2xl font-semibold">Access tokens</h1>
      <p className="mt-3 text-sm leading-relaxed text-snow-2">
        One token per machine. A token lets Claude Code reach your ichchi over
        MCP as you. Revoking one takes effect on the next call.
      </p>
      <TokenManager tokens={tokens} />
    </main>
  );
}

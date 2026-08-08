/**
 * Connect to a running ichchi the way an agent does, over HTTP, and check the
 * whole MCP handshake end to end.
 *
 *   npm run check:mcp                       # against localhost
 *   ICHI_URL=https://ichchi.example.com npm run check:mcp
 *
 * Creates a throwaway account and token directly in the database, adopts a
 * scratch ichchi, exercises every tool, then deletes the account — the cascade
 * takes the ichchi, its memories, its events and the token with it. A check
 * that dirties the state it checks must clean up after itself.
 */

process.env.DATABASE_URL ??= "postgres://ichi:ichi@localhost:5433/ichi";

const BASE = process.env.ICHI_URL ?? "http://localhost:3400";
const ENDPOINT = `${BASE}/mcp`;

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

interface RpcResult {
  status: number;
  body: {
    result?: Record<string, unknown>;
    error?: { code: number; message: string };
  };
}

async function rpc(method: string, params: unknown, token?: string): Promise<RpcResult> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const text = await res.text();
  let body = {};
  try {
    body = JSON.parse(text);
  } catch {
    body = { error: { code: -1, message: text.slice(0, 200) } };
  }
  return { status: res.status, body: body as RpcResult["body"] };
}

/** Tool results come back as MCP content blocks; this is the text of the first. */
function textOf(result: Record<string, unknown> | undefined): string {
  const content = result?.content as { type: string; text?: string }[] | undefined;
  return content?.[0]?.text ?? "";
}

async function main() {
  // Dynamic, after the DSN default above is in place: @/db validates env at
  // import time, so a static import would run before the fallback is set.
  const { query, maybeOne } = await import("@/db");
  const { issueToken } = await import("@/lib/tokens");

  console.log(`\nchecking ${ENDPOINT}`);

  console.log("\nrefusing strangers");
  const anon = await rpc("tools/list", {});
  check("no token is 401", anon.status === 401, `got ${anon.status}`);
  check(
    "the refusal names the fix",
    (anon.body.error?.message ?? "").includes("ICHI_TOKEN"),
  );
  const placeholder = await rpc("tools/list", {}, "${ICHI_TOKEN}");
  check("an unexpanded ${ICHI_TOKEN} is 401", placeholder.status === 401);
  check(
    "…and says so",
    (placeholder.body.error?.message ?? "").includes("unexpanded"),
  );
  const wrong = await rpc("tools/list", {}, "ichi_not_a_real_token");
  check("a wrong token is 401", wrong.status === 401, `got ${wrong.status}`);

  // A throwaway account, straight into better-auth's table. The id shape is
  // theirs (text), the rest is a row only this run will ever see.
  const runId = Date.now().toString(36);
  const userId = `check-mcp-${runId}`;
  await query(
    `insert into "user" (id, name, email, "emailVerified") values ($1, $2, $3, true)`,
    [userId, "Check MCP", `check-mcp-${runId}@example.invalid`],
  );
  const { token } = await issueToken(userId, "check:mcp");
  console.log(`\ncreated a throwaway account and token (check-mcp-${runId})`);

  const ichchiName = `Checkmcp ${runId}`;

  try {
    console.log("\nhandshake");
    const init = await rpc(
      "initialize",
      {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "check-mcp", version: "1" },
      },
      token,
    );
    check("initialize succeeds", init.status === 200 && !init.body.error);
    check(
      "server names itself and its protocol",
      (init.body.result?.serverInfo as { name?: string })?.name === "ichchi" &&
        typeof init.body.result?.protocolVersion === "string",
      String(init.body.result?.protocolVersion),
    );

    console.log("\ntools");
    const list = await rpc("tools/list", {}, token);
    const tools = (list.body.result?.tools ?? []) as { name: string; description: string }[];
    check("tools/list returns the tool set", tools.length === 7, `${tools.length} tools`);
    check(
      "every tool has a description that says when to call it",
      tools.every((t) => t.description && t.description.length > 40),
    );
    const names = tools.map((t) => t.name);
    for (const expected of [
      "ichchi_list",
      "ichchi_adopt",
      "ichchi_brief",
      "ichchi_state",
      "ichchi_feedback",
      "ichchi_remember",
      "ichchi_recall",
    ]) {
      check(`${expected} is offered`, names.includes(expected));
    }

    console.log("\nadopting an ichchi");
    const adopt = await rpc(
      "tools/call",
      { name: "ichchi_adopt", arguments: { archetype: "baiyanai", name: ichchiName } },
      token,
    );
    const adoptText = textOf(adopt.body.result);
    check("ichchi_adopt answers", adopt.status === 200 && adoptText.length > 0);
    check("the ichchi introduces itself", adoptText.includes(ichchiName), adoptText.slice(0, 50));
    check(
      "the safety rule rides along",
      adoptText.includes("never the quality"),
    );

    console.log("\nbriefing");
    const brief = await rpc(
      "tools/call",
      { name: "ichchi_brief", arguments: { ichchi: ichchiName } },
      token,
    );
    const briefText = textOf(brief.body.result);
    check("ichchi_brief answers by name", brief.status === 200 && briefText.includes("Mood:"));
    const briefBySlug = await rpc(
      "tools/call",
      { name: "ichchi_brief", arguments: { ichchi: `checkmcp-${runId}` } },
      token,
    );
    check("…and by slug", briefBySlug.status === 200 && !briefBySlug.body.error);
    check(
      "every answer carries the mood suffix",
      briefText.includes("bond") && briefText.includes("feeling"),
    );

    console.log("\nfeedback");
    const praise = await rpc(
      "tools/call",
      {
        name: "ichchi_feedback",
        arguments: { ichchi: ichchiName, kind: "praise", reason: "clean migration, zero downtime" },
      },
      token,
    );
    check("praise lands", praise.status === 200 && textOf(praise.body.result).includes("heard"));

    const readState = () =>
      maybeOne<{ mood_valence: number; bond: number }>(
        `select s.mood_valence, b.bond
           from ichchi s join bonds b on b.ichchi_id = s.id
          where s.owner_id = $1 and b.user_id = $1`,
        [userId],
      );
    const afterPraise = await readState();

    const scold = await rpc(
      "tools/call",
      {
        name: "ichchi_feedback",
        arguments: { ichchi: ichchiName, kind: "scold", reason: "dropped the schema twice" },
      },
      token,
    );
    check("a scolding lands", scold.status === 200 && !scold.body.error);

    const afterScold = await readState();
    // Mood is a moving average, so one scold need not drag valence below
    // zero — what must hold is that the scolding moved both numbers down.
    check(
      "the scolding actually moved the state",
      afterPraise !== null &&
        afterScold !== null &&
        afterScold.mood_valence < afterPraise.mood_valence &&
        afterScold.bond < afterPraise.bond,
      afterPraise && afterScold
        ? `valence ${afterPraise.mood_valence.toFixed(2)}→${afterScold.mood_valence.toFixed(2)}, bond ${afterPraise.bond}→${afterScold.bond}`
        : "no row",
    );

    console.log("\nstate, memory, recall");
    const state = await rpc(
      "tools/call",
      { name: "ichchi_state", arguments: { ichchi: ichchiName } },
      token,
    );
    const stateText = textOf(state.body.result);
    check("ichchi_state shows the full sheet", stateText.includes("Traits") && stateText.includes("Pending drift"));

    const remember = await rpc(
      "tools/call",
      {
        name: "ichchi_remember",
        arguments: { ichchi: ichchiName, text: "the user hates ORMs, prefers raw SQL", kind: "fact" },
      },
      token,
    );
    check("ichchi_remember saves", remember.status === 200 && !remember.body.error);

    const recall = await rpc(
      "tools/call",
      { name: "ichchi_recall", arguments: { ichchi: ichchiName, query: "ORM" } },
      token,
    );
    check(
      "ichchi_recall finds it back",
      textOf(recall.body.result).includes("raw SQL"),
    );

    const listIchchi = await rpc("tools/call", { name: "ichchi_list", arguments: {} }, token);
    check("ichchi_list shows the adopted ichchi", textOf(listIchchi.body.result).includes(ichchiName));

    console.log("\nrefusing what it should refuse");
    const missing = await rpc(
      "tools/call",
      { name: "ichchi_brief", arguments: { ichchi: "no-such-ichchi-xyz" } },
      token,
    );
    const missingText = textOf(missing.body.result) + (missing.body.error?.message ?? "");
    check(
      "an unknown ichchi names itself in the refusal",
      missingText.includes("no-such-ichchi-xyz"),
      missingText.slice(0, 60),
    );
    check(
      "the refusal is prose, not a stack trace",
      missingText.length > 0 && !/\bat \w+ \(|Error:|node_modules/.test(missingText),
    );

    // Per MCP 2025-06-18 an unknown tool is a protocol error, not a tool that
    // ran and failed — a client on a stale tool list has to tell them apart.
    const badTool = await rpc("tools/call", { name: "definitely_not_a_tool", arguments: {} }, token);
    check(
      "an unknown tool is a JSON-RPC error",
      badTool.body.error?.code === -32602,
      `code ${badTool.body.error?.code ?? "none"}`,
    );

    console.log("\nthe log a person reads");
    const events = await query<{ kind: string }>(
      `select distinct kind from ichchi_events se
         join ichchi s on s.id = se.ichchi_id
        where s.owner_id = $1`,
      [userId],
    );
    const kinds = events.map((e) => e.kind);
    check(
      "calls and feedback are in the event log",
      kinds.includes("call") && kinds.includes("feedback"),
      kinds.join(", "),
    );
  } finally {
    // The account's cascade takes ichchi, bonds, memories, events and tokens.
    await query(`delete from "user" where id = $1`, [userId]);
    console.log("\ncleaned up the throwaway account");
  }

  console.log(failures ? `\n✗ ${failures} check(s) failed\n` : "\n✓ all checks passed\n");
  process.exit(failures ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

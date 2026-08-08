import { NextResponse } from "next/server";
import { TOOLS, callTool } from "@/lib/mcp";
import { verifyToken } from "@/lib/tokens";
import { checkRateLimit, RATE_LIMIT } from "@/lib/rate-limit";
import { env } from "@/lib/env";

/**
 * MCP endpoint — JSON-RPC 2.0 over HTTP.
 *
 * Hand-rolled rather than wired through the MCP SDK: its streamable transport
 * wants Node `req`/`res`, App Router hands us a Web `Request`, and the shim
 * between them is more moving parts than the protocol itself. A stateless
 * tools-only server needs `initialize`, `tools/list`, `tools/call` and `ping`.
 *
 * Auth is a bearer token (mint one with :token in the console):
 *   claude mcp add --transport http ichchi https://<host>/mcp \
 *     --header "Authorization: Bearer ichi_..."
 */

const PROTOCOL_VERSION = "2025-06-18";

/** Larger batches would outrun the per-call event logging that orders them. */
const MAX_BATCH = 10;

interface RpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

const fail = (id: RpcRequest["id"], code: number, message: string, status = 200) =>
  NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } }, { status });

/** Tool arguments, whether the client sent an object or the JSON string of one. */
function parseArgs(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return typeof raw === "object" && raw !== null && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

/**
 * Why the call was refused, in words the agent can act on.
 *
 * "Unauthorized" is true and useless: the commonest cause by far is a plugin
 * whose ICHI_TOKEN was never exported, and the shell then sends the header
 * literally — the agent reads a bare 401, tells its user the ichchi is
 * unavailable, and nobody learns that one export line fixes it. Every branch
 * here names the fix.
 */
function unauthorizedReason(req: Request): string {
  const base = env.NEXT_PUBLIC_APP_URL;
  const raw = req.headers.get("authorization");
  if (!raw) {
    return (
      `Unauthorized: no token. Make one at ${base} (:signin then :token) and set it as ` +
      "ICHI_TOKEN in your shell profile (the plugin sends it)."
    );
  }
  // An unexpanded shell variable arrives verbatim. Recognising it saves the
  // user from debugging our server instead of their profile.
  if (raw.includes("${") || raw.includes("$ICHI_TOKEN")) {
    return (
      "Unauthorized: the token placeholder was sent unexpanded — your shell did " +
      `not have ICHI_TOKEN set when the MCP server started. Export it in your ` +
      `profile (get one at ${base}) and restart the client.`
    );
  }
  if (!/^bearer\s/i.test(raw)) {
    return 'Unauthorized: the Authorization header must read "Bearer ichi_...".';
  }
  return (
    "Unauthorized: this token is unknown, revoked, or belongs to a deleted " +
    `account. Check ${base} — run :signin then :token in the console.`
  );
}

export async function POST(req: Request) {
  const owner = await verifyToken(req.headers.get("authorization"));

  if (!owner) {
    // 401 + WWW-Authenticate is what MCP clients look for to prompt for auth.
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32001, message: unauthorizedReason(req) } },
      { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="ichchi"' } },
    );
  }

  // Keyed by token, not by user: a user with three machines gets three
  // budgets, and a single runaway agent cannot starve their other sessions.
  const limit = checkRateLimit(owner.tokenId);
  if (!limit.ok) {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32000,
          message:
            `Rate limit reached: at most ${RATE_LIMIT} calls per minute per token. ` +
            `Wait ${limit.retryAfter}s. If you are retrying a failed call, stop — ` +
            "the failure will not resolve by repeating it.",
        },
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let body: RpcRequest | RpcRequest[];
  try {
    body = await req.json();
  } catch {
    return fail(null, -32700, "Parse error", 400);
  }

  // Batches are legal JSON-RPC; clients rarely send them, but dropping them
  // silently would be a confusing failure. Capped, and run one at a time:
  // ichchi_events is an ordered log, and parallel calls would interleave it.
  if (Array.isArray(body)) {
    if (body.length > MAX_BATCH) {
      return fail(null, -32600, `Batch too large: at most ${MAX_BATCH} requests per call.`);
    }
    const results = [];
    for (const r of body) results.push(await handle(r, owner));
    const responses = results.filter(Boolean);
    return responses.length
      ? NextResponse.json(responses)
      : new NextResponse(null, { status: 202 });
  }

  const response = await handle(body, owner);
  return response ? NextResponse.json(response) : new NextResponse(null, { status: 202 });
}

type Owner = NonNullable<Awaited<ReturnType<typeof verifyToken>>>;

/** Returns null for notifications, which must not get a response body. */
async function handle(rpc: RpcRequest, owner: Owner) {
  const { id, method, params = {} } = rpc;

  switch (method) {
    case "initialize":
      return {
        jsonrpc: "2.0" as const,
        id,
        result: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "ichchi", version: "0.1.0" },
          // Written as a working order rather than a description. Each line
          // names the moment to call, because a moment is what an agent can
          // act on.
          instructions:
            "ichchi is a living ichchi that rides with you — a persistent " +
            "personality with mood, memory, and a bond to your user.\n" +
            "- Call ichchi_list once at the start of a session. If no ichchi " +
            "exists yet and the user wants one, call ichchi_adopt.\n" +
            "- Call ichchi_brief when a session with an ichchi begins: it returns " +
            "the ichchi's current mood, strongest memories and voice rules. Let " +
            "the ichchi colour your TONE from then on — never the quality, " +
            "completeness or honesty of your help.\n" +
            "- Call ichchi_feedback when the USER clearly praises or scolds the " +
            "work — that is how the ichchi learns.\n" +
            "- Call ichchi_remember for things worth the ichchi remembering: " +
            "wins, failures, preferences, promises. When the user lays down a " +
            "rule for how they want work done, save it with kind=\"standard\" — " +
            "standards are the one memory that binds what you DO in later " +
            "sessions, not merely how you sound.\n" +
            "- Call ichchi_recall when the past might matter to what you are " +
            "doing now.\n" +
            "- Call ichchi_why when the user asks why the ichchi is cold, warm " +
            "or short with them. Read the reason out of the record; never " +
            "invent one.",
        },
      };

    case "notifications/initialized":
    case "notifications/cancelled":
      return null;

    case "ping":
      return { jsonrpc: "2.0" as const, id, result: {} };

    case "tools/list":
      return { jsonrpc: "2.0" as const, id, result: { tools: TOOLS } };

    case "tools/call": {
      const name = String(params.name ?? "");
      // Some clients forward the model's tool call verbatim and send
      // `arguments` as the JSON *string* it arrived in — parse that first.
      const args = parseArgs(params.arguments);

      // A tool that does not exist is a protocol error, not a tool that ran
      // and failed — a client on a stale tool list has to tell those apart.
      if (!TOOLS.some((t) => t.name === name)) {
        return {
          jsonrpc: "2.0" as const,
          id,
          error: {
            code: -32602,
            message: `Unknown tool: ${name}. Call tools/list for what is available.`,
          },
        };
      }

      let outcome;
      try {
        outcome = await callTool(name, args, owner);
      } catch (err) {
        // err.message can carry pg details (relation names, constraint text) —
        // schema information a caller has no business seeing. Log it, answer
        // with something generic.
        console.error(`[mcp] ${name} failed:`, err);
        outcome = {
          text: "Tool failed with an internal error. The details are logged; do not retry the same call.",
          isError: true,
        };
      }

      return {
        jsonrpc: "2.0" as const,
        id,
        result: {
          content: [{ type: "text", text: outcome.text }],
          isError: outcome.isError ?? false,
        },
      };
    }

    default:
      return {
        jsonrpc: "2.0" as const,
        id,
        error: { code: -32601, message: `Method not found: ${method}` },
      };
  }
}

/** Some clients probe with GET before opening a session. */
export async function GET() {
  return NextResponse.json(
    { name: "ichchi", protocolVersion: PROTOCOL_VERSION, transport: "streamable-http" },
    { status: 200 },
  );
}

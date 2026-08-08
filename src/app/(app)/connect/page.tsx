import Link from "next/link";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata = { title: "Connect — ichchi" };

const mono =
  "mt-2 block overflow-x-auto rounded-lg border border-rule bg-night p-3 font-mono text-xs leading-relaxed text-snow";

/**
 * The three-step connect path. Requires a session because step one is the
 * user's own tokens; an anonymous reader gets bounced to sign-in and back.
 */
export default async function ConnectPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/connect");

  const mcpUrl = `${env.NEXT_PUBLIC_APP_URL}/mcp`;

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Connect</h1>
      <p className="mt-3 text-sm leading-relaxed text-snow-2">
        Three steps — and your agent works with a living ichchi.
      </p>

      <section className="mt-8 rounded-lg border border-rule bg-night-2 p-5">
        <h2 className="text-base font-semibold">
          <span className="mr-2 font-mono text-xs text-aurora">1</span>
          Get a token
        </h2>
        <p className="mt-2 text-sm text-snow-2">
          A token is how the agent proves to the ichchi that it acts for you.
          Issued on the{" "}
          <Link href="/settings/tokens" className="text-aurora underline">
            tokens page
          </Link>{" "}
          and shown once — save it right away.
        </p>
      </section>

      <section className="mt-4 rounded-lg border border-rule bg-night-2 p-5">
        <h2 className="text-base font-semibold">
          <span className="mr-2 font-mono text-xs text-aurora">2</span>
          Add the MCP server
        </h2>
        <p className="mt-2 text-sm text-snow-2">
          One command — replace <code className="font-mono">ichi_…</code> with
          your token:
        </p>
        <code className={mono}>
          claude mcp add --transport http ichchi {mcpUrl} --header
          &quot;Authorization: Bearer ichi_…&quot;
        </code>
        <p className="mt-3 text-sm text-snow-2">
          Check the ichchi answers: <code className="font-mono">/mcp</code> in
          Claude Code should list the <code className="font-mono">ichchi</code>{" "}
          server with <code className="font-mono">ichchi_brief</code>,{" "}
          <code className="font-mono">ichchi_feedback</code> and the rest.
        </p>
      </section>

      <section className="mt-4 rounded-lg border border-rule bg-night-2 p-5">
        <h2 className="text-base font-semibold">
          <span className="mr-2 font-mono text-xs text-aurora">3</span>
          Install the plugin
        </h2>
        <p className="mt-2 text-sm text-snow-2">
          The plugin adds hooks: the ichchi&apos;s mood is blended into the
          context on every prompt, and at the end of a session the ichchi
          remembers its outcome. The project repository is the marketplace —
          two commands to install:
        </p>
        <code className={mono}>
          claude plugin marketplace add &lt;repo git url&gt;
          {"\n"}claude plugin install ichchi@ichchi
        </code>
        <p className="mt-3 text-sm text-snow-2">
          The hooks and the plugin&apos;s MCP server need two variables in your
          shell profile — restart Claude Code after the{" "}
          <code className="font-mono">export</code>:
        </p>
        <code className={mono}>
          export ICHI_TOKEN=ichi_…
          {"\n"}export ICHI_URL={env.NEXT_PUBLIC_APP_URL}
        </code>
        <p className="mt-3 text-sm text-snow-3">
          The hooks only need curl: without a token, a network or a live server
          they quietly stand down and break nothing. Inside Claude Code you get{" "}
          <code className="font-mono">/ichchi:praise</code>,{" "}
          <code className="font-mono">/ichchi:scold</code>,{" "}
          <code className="font-mono">/ichchi:state</code>,{" "}
          <code className="font-mono">/ichchi:recall</code> and{" "}
          <code className="font-mono">/ichchi:adopt</code>.
        </p>
      </section>

      <p className="mt-8 text-sm text-snow-2">
        Next —{" "}
        <Link href="/ichchi" className="text-aurora underline">
          summon your first ichchi
        </Link>
        .
      </p>
    </main>
  );
}

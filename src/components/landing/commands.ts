import type { LandingDict } from "@/lib/landing-i18n";
import { TOOLS } from "@/lib/mcp-tools";

/**
 * The landing, as a command set.
 *
 * The page has to fit one screen with no scroll, and it still has to carry
 * everything the old five-section page carried. The way out is not to cut the
 * copy — it is to stop showing all of it at once. Every section became a
 * command whose output prints into the transcript pane, so the reader pulls
 * what they want in the order they want it, exactly as they would in a shell.
 *
 * Command names and help text stay English in every locale, on the same rule
 * the handshake terminal already follows: this is a command line, and `--help`
 * is not marketing copy. The *content* the commands print comes from the
 * translated dictionary, so a Japanese reader gets Japanese answers to English
 * commands — which is what every CLI they already use does.
 */

export type LineKind = "cmd" | "out" | "dim" | "head" | "accent" | "err";

export interface Line {
  kind: LineKind;
  text: string;
  /** Renders as a link when set. */
  href?: string;
}

const dim = (text: string): Line => ({ kind: "dim", text });
const head = (text: string): Line => ({ kind: "head", text });
const blank = (): Line => ({ kind: "out", text: "" });

export interface Command {
  name: string;
  /** One line, English — this is `--help` output. */
  help: string;
  run: (t: LandingDict) => Line[];
}

/** Numbered list rendered the way a terminal would: aligned, mono, quiet. */
function steps(items: { t: string; d: string }[]): Line[] {
  return items.flatMap((s, i) => [
    { kind: "accent" as const, text: `  ${String(i + 1).padStart(2, "0")}  ${s.t}` },
    dim(`      ${s.d}`),
    blank(),
  ]);
}

export const COMMANDS: Command[] = [
  {
    name: ":help",
    help: "everything this ichchi can do",
    run: () => [
      head("COMMANDS"),
      ...COMMANDS.map((c) => ({
        kind: "out" as const,
        text: `  ${c.name.padEnd(12)} ${c.help}`,
      })),
      blank(),
      dim("  Anything that is not a command is said to the ichchi."),
      dim("  Praise it or scold it and watch the core, the brief and the log move."),
    ],
  },
  {
    name: ":how",
    help: "what actually happens on every prompt",
    run: (t) => [
      head(t.flow.title.toUpperCase()),
      dim(`  ${t.flow.sub}`),
      blank(),
      ...steps(t.flow.steps),
    ],
  },
  {
    name: ":tools",
    help: "the MCP tools your agent gets",
    run: () => [
      head("MCP TOOLS"),
      dim(`  ${TOOLS.length} tools, served at /mcp over JSON-RPC 2.0.`),
      blank(),
      ...TOOLS.map((tool) => ({
        kind: "out" as const,
        // First sentence only: the full description is prompt engineering
        // aimed at a model, and reads like a manual to a person.
        text: `  ${tool.name.padEnd(17)} ${tool.description.split(". ")[0]}.`,
      })),
    ],
  },
  {
    name: ":mechanics",
    help: "how mood, memory and character actually work",
    run: (t) => [
      head(t.mech.title.toUpperCase()),
      dim(`  ${t.mech.sub}`),
      blank(),
      ...t.mech.cards.flatMap((c) => [
        { kind: "accent" as const, text: `  ▸ ${c.t}` },
        dim(`    ${c.d}`),
        blank(),
      ]),
    ],
  },
  {
    name: ":spirits",
    help: "the six archetypes you can summon",
    run: (t) => [
      head(t.ichchi.title.toUpperCase()),
      dim(`  ${t.ichchi.sub}`),
      blank(),
      ...Object.entries(t.ichchi.items).flatMap(([id, v]) => [
        { kind: "accent" as const, text: `  ${id.padEnd(18)} ${v.tagline}` },
        dim(`  ${" ".repeat(18)} ${v.desc}`),
        blank(),
      ]),
      dim("  ichchi_adopt <archetype> — and it is yours, with a name you pick."),
    ],
  },
  {
    name: ":connect",
    help: "three steps to a connected agent",
    run: (t) => [
      head(t.connect.title.toUpperCase()),
      blank(),
      ...steps(t.connect.steps),
      { kind: "accent", text: "  $ claude mcp add --transport http ichchi \\" },
      { kind: "accent", text: "      https://ichchi.sh/mcp \\" },
      { kind: "accent", text: '      --header "Authorization: Bearer ichi_…"' },
      blank(),
      { kind: "out", text: "  → open the connect page", href: "/connect" },
    ],
  },
  {
    name: ":why",
    help: "why an agent should have a temper at all",
    run: (t) => [
      head(t.why.title.toUpperCase()),
      dim(`  ${t.why.body}`),
      blank(),
      dim(`  ${t.why.etym}`),
    ],
  },
  {
    name: ":clear",
    help: "empty the transcript",
    run: () => [],
  },
];

export function findCommand(input: string): Command | null {
  const name = input.trim().toLowerCase();
  return COMMANDS.find((c) => c.name === name) ?? null;
}

/** Longest common completion for Tab, or the single match. */
export function complete(prefix: string): string | null {
  const p = prefix.trim().toLowerCase();
  if (!p.startsWith(":")) return null;
  const hits = COMMANDS.filter((c) => c.name.startsWith(p));
  if (hits.length === 0) return null;
  if (hits.length === 1) return hits[0].name;
  // Extend to the point where the candidates diverge — shell behaviour.
  let i = p.length;
  while (hits.every((h) => h.name[i] && h.name[i] === hits[0].name[i])) i++;
  return hits[0].name.slice(0, i);
}

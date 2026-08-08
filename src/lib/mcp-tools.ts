/**
 * The MCP tool surface, as data.
 *
 * Split from the handlers in lib/mcp.ts so that anything wanting to *name*
 * the tools — a test, the connect page — can import them without dragging in
 * the database and the queue behind the implementations.
 */

/**
 * These descriptions are prompt engineering, not documentation — they decide
 * whether an agent lets the ichchi speak at all. Each one states *when* to call
 * it, not just what it does; a description that only describes gets ignored.
 */
export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const ICHCHI_REF = {
  type: "string",
  description: "The ichchi's slug or name, as shown by ichchi_list.",
} as const;

export const TOOLS: ToolDef[] = [
  {
    name: "ichchi_list",
    description:
      "List the ichchi you are carrying and the archetypes available for " +
      "adoption. Call this once at the start of a session: if an ichchi is " +
      "already here, follow with ichchi_brief; if the user asks for a companion " +
      "and none exists, pick an archetype together and call ichchi_adopt.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "ichchi_adopt",
    description:
      "Adopt an ichchi from an archetype (ichchi_list shows the catalogue). The " +
      "ichchi is born with the archetype's personality and remembers everything " +
      "that happens from this call on. One archetype can parent many ichchi — " +
      "the name is what makes yours distinct.",
    inputSchema: {
      type: "object",
      properties: {
        archetype: {
          type: "string",
          description: "Archetype id from ichchi_list, e.g. \"baiyanai\".",
        },
        name: {
          type: "string",
          description: "Optional name for the ichchi. Defaults to the archetype's name.",
        },
      },
      required: ["archetype"],
      additionalProperties: false,
    },
  },
  {
    name: "ichchi_brief",
    description:
      "Start of a session with an ichchi: returns who it is, how it feels right " +
      "now, the strongest things it remembers, and the rules for letting it " +
      "speak through you. Call it before your first answer in the session — " +
      "then let the ichchi colour your TONE only. Its mood never lowers the " +
      "quality, completeness or honesty of your help.",
    inputSchema: {
      type: "object",
      properties: { ichchi: ICHCHI_REF },
      required: ["ichchi"],
      additionalProperties: false,
    },
  },
  {
    name: "ichchi_state",
    description:
      "The ichchi's full state — Big Five traits, mood numbers, stress, energy, " +
      "bond and trust, pending personality drift. For debugging and for " +
      "answering \"how is the ichchi doing\"; for ordinary conversation " +
      "ichchi_brief is the right call.",
    inputSchema: {
      type: "object",
      properties: { ichchi: ICHCHI_REF },
      required: ["ichchi"],
      additionalProperties: false,
    },
  },
  {
    name: "ichchi_feedback",
    description:
      "The strongest signal an ichchi gets. Call it when the user clearly praises " +
      "the work (\"great job\", \"exactly what I needed\") or clearly scolds it " +
      "(\"this is garbage\", \"you broke it again\") — that is how the ichchi " +
      "learns and how its character drifts. Do not call it for neutral " +
      "messages, and never on your own verdict: the signal must come from the " +
      "user. A scolding lands harder than a praise lifts — that is deliberate.",
    inputSchema: {
      type: "object",
      properties: {
        ichchi: ICHCHI_REF,
        kind: { type: "string", enum: ["praise", "scold"] },
        reason: {
          type: "string",
          description: "What the praise or scolding was for, in a sentence.",
        },
      },
      required: ["ichchi", "kind", "reason"],
      additionalProperties: false,
    },
  },
  {
    name: "ichchi_remember",
    description:
      "Save something worth the ichchi remembering: a win, a failure, a " +
      "preference, a promise, a fact about the project it works on. If it " +
      "would matter to a colleague who lived through it, it belongs here. " +
      "Emotionally charged memories fade slower than neutral facts.",
    inputSchema: {
      type: "object",
      properties: {
        ichchi: ICHCHI_REF,
        text: { type: "string", description: "The memory, in a sentence or two." },
        kind: {
          type: "string",
          enum: ["event", "insult", "praise", "belief", "fact", "standard"],
          description:
            "Defaults to \"event\". Use \"standard\" ONLY when the user laid " +
            "down a rule for how they want work done (\"always run the tests " +
            "first\", \"never touch the schema without asking\"). Standards are " +
            "binding on every future session and never fade, so record one " +
            "only from what the user actually said — never from your own guess " +
            "about their preferences.",
        },
      },
      required: ["ichchi", "text"],
      additionalProperties: false,
    },
  },
  {
    name: "ichchi_recall",
    description:
      "Search the ichchi's memories when the past might matter to what you are " +
      "doing now — a repeated mistake, a preference the user stated weeks ago, " +
      "a grudge you half-remember causing. Returns the strongest matches; the " +
      "ichchi's dashboard keeps the full log.",
    inputSchema: {
      type: "object",
      properties: {
        ichchi: ICHCHI_REF,
        query: { type: "string", description: "What you are trying to remember." },
      },
      required: ["ichchi", "query"],
      additionalProperties: false,
    },
  },
  {
    name: "ichchi_why",
    description:
      "Explain the current mood from the record: the praise and scoldings " +
      "that moved it, what each one cost or earned, the reflections that " +
      "changed the character, and how far the mood has drifted from this " +
      "ichchi's own baseline. Call it whenever the user asks why it is cold, " +
      "warm, quiet or short with them — or when you are about to guess. " +
      "Never invent a reason: if this returns nothing, there is no reason yet.",
    inputSchema: {
      type: "object",
      properties: { ichchi: ICHCHI_REF },
      required: ["ichchi"],
      additionalProperties: false,
    },
  },
];

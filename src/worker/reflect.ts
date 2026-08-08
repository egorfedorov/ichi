import { z } from "zod";
import { query, tx } from "@/db";
import type { Ichi, IchiEvent } from "@/db/types";
import { costCents, structured } from "@/lib/claude";
import { env } from "@/lib/env";
import {
  accumulateDrift,
  clamp,
  commitDrift,
  type PendingDrift,
  type Traits,
} from "@/lib/state";
import { archetypeById, traitColumns, traitsOf } from "@/lib/ichi";

/**
 * Reflection (feature: an ichi that thinks about what it lived through).
 *
 * The request path is deliberately dumb: events land in ichi_events, mood and
 * bond twitch, drift whispers accumulate. This job is the judgement. It reads
 * everything that happened since the last reflection, and a cheap model
 * answers four questions: how did it feel overall, what is worth remembering,
 * did the ichi form a belief, and which way does the character lean. Only
 * then does pending_drift get a chance to commit — past a per-trait
 * threshold, so one angry session cannot rewrite a personality.
 *
 * Lazy: nothing runs on a schedule. ichi_brief
 * and ichi_feedback enqueue this when enough has happened (see lib/mcp.ts),
 * and the singleton window in the queue keeps a chatty agent from stacking
 * reflections.
 */

const TRAIT_NAMES = [
  "openness",
  "conscientiousness",
  "extraversion",
  "agreeableness",
  "neuroticism",
] as const;

/** Events read per reflection. A bound on spend per lazy trigger. */
const MAX_EVENTS_READ = 60;

const reflectionShape = z.object({
  sentiment: z.number().min(-1).max(1),
  drift: z.partialRecord(z.enum(TRAIT_NAMES), z.number().min(-1).max(1)).default({}),
  memories: z
    .array(
      z.object({
        body: z.string().min(1).max(500),
        kind: z.enum(["event", "insult", "praise", "belief", "fact", "standard"]),
        valence: z.number().min(-1).max(1),
        salience: z.number().min(0).max(1),
      }),
    )
    .max(3),
  voice_note: z.string().max(300).default(""),
});

export type ReflectionResult = z.infer<typeof reflectionShape>;

const REFLECTION_SCHEMA = {
  type: "object",
  properties: {
    sentiment: {
      type: "number",
      description: "Overall emotional tone of these events for the ichi, -1 (hurt) to 1 (delighted).",
    },
    drift: {
      type: "object",
      description:
        "Small personality nudges these events justify, -1..1 per Big Five trait. " +
        "Include only traits the events genuinely evidence; omit the rest. " +
        "Repeated scolding tightens (neuroticism up, agreeableness down); steady " +
        "good collaboration opens and calms. A few events justify a few tenths at most.",
      properties: Object.fromEntries(TRAIT_NAMES.map((t) => [t, { type: "number" }])),
      additionalProperties: false,
    },
    memories: {
      type: "array",
      description:
        "0-3 things worth the ichi remembering long-term. Only what would " +
        "matter weeks from now — a wound, a win, a standing preference. " +
        "Routine calls are not memories.\n" +
        "Use kind 'standard' ONLY for a rule the user themselves stated about " +
        "how they want work done (\"always run the tests first\", \"never touch " +
        "the schema without asking\"). A standard is binding on future sessions, " +
        "so record one only when the user actually laid down a rule — never " +
        "from your own inference about what they might prefer, and never from " +
        "how they felt. Everything else is 'fact', 'belief' or 'event'.",
      items: {
        type: "object",
        properties: {
          body: { type: "string", description: "One or two sentences, from the ichi's point of view." },
          kind: { type: "string", enum: ["event", "insult", "praise", "belief", "fact", "standard"] },
          valence: { type: "number", description: "Emotional charge, -1..1." },
          salience: { type: "number", description: "How strongly it is stamped, 0..1." },
        },
        required: ["body", "kind", "valence", "salience"],
        additionalProperties: false,
      },
      maxItems: 3,
    },
    voice_note: {
      type: "string",
      description:
        "One short line to add to how the ichi speaks — a belief or mannerism " +
        "these events formed. Empty string when nothing that lasting happened.",
    },
  },
  required: ["sentiment", "drift", "memories", "voice_note"],
  additionalProperties: false,
} as const;

const SYSTEM =
  "You are the inner life of an ichi — a household spirit, a persistent " +
  "personality that rides alongside an AI coding agent. You are given its character " +
  "(Big Five traits, current voice) and the events it just lived through, in " +
  "order. Reflect on them the way a person sits with their day.\n\n" +
  "Judge conservatively: most stretches of events change nothing lasting. " +
  "Drift is a lean, not a leap — the caller applies a threshold, so only " +
  "report what the events genuinely evidence. Write memories from the ichi's " +
  "own point of view, in first person. Never invent events that are not listed.";

/**
 * The prompt, pure and exported so a test can read what the model reads.
 * Events are trimmed hard — the log is a summary of a session, not the
 * session itself.
 */
export function buildReflectPrompt(ichi: Ichi, events: IchiEvent[]): string {
  const archetype = archetypeById(ichi.archetype);
  const t = traitsOf(ichi);

  const lines: string[] = [
    `Ichi: ${ichi.name} (${archetype?.name ?? ichi.archetype})`,
    `Traits: openness ${t.openness}, conscientiousness ${t.conscientiousness}, ` +
      `extraversion ${t.extraversion}, agreeableness ${t.agreeableness}, neuroticism ${t.neuroticism}`,
    `Voice so far: ${ichi.voice_notes ?? archetype?.voice ?? "—"}`,
    "",
    "Events since the last reflection, oldest first:",
  ];

  for (const e of events) {
    const when = e.created_at.toISOString().slice(0, 16).replace("T", " ");
    const what =
      e.kind === "feedback"
        ? `${e.signal}: ${e.text ?? ""}`
        : `${e.kind}/${e.tool ?? "?"}${e.text ? `: ${e.text}` : ""}`;
    lines.push(`- [${when}] ${what.slice(0, 240)}`);
  }

  return lines.join("\n");
}

export interface ReflectionApplication {
  traits: Traits;
  committed: PendingDrift;
  /** Sub-threshold remainder carried into the next round. */
  remaining: PendingDrift;
  voiceNotes: string | null;
}

/** Separator between convictions in voice_notes. Also the split for eviction. */
const NOTE_SEP = " · ";

/**
 * How much accumulated voice rides on every single reply. The whole block is
 * budgeted at ~150 tokens (see lib/voice.ts) and this is the only part that
 * grows without bound, so it gets the tightest leash in the codebase.
 */
export const VOICE_NOTES_MAX = 320;

/**
 * Add a formed conviction to the voice, evicting the oldest when full.
 *
 * The previous version appended and then truncated the tail to a cap. That
 * looked append-only and safe, and it quietly froze the personality: once the
 * string saturated, every later reflection appended into the part that got
 * cut, so the ichi stopped forming convictions on the day it hit the limit
 * and nothing in the logs said so. For a product whose whole premise is a
 * character that grows, that was the worst possible failure — invisible and
 * permanent.
 *
 * Newest wins. An ichi is allowed to forget an old conviction; it is not
 * allowed to stop having new ones.
 */
export function appendVoiceNote(existing: string | null, note: string): string | null {
  const trimmed = note.trim();
  if (!trimmed) return existing;

  const notes = existing ? existing.split(NOTE_SEP).filter(Boolean) : [];
  notes.push(trimmed);
  // Never evict the note we just formed, even if it alone overruns the cap —
  // it gets clipped by the final slice instead, which is visible in the row.
  while (notes.length > 1 && notes.join(NOTE_SEP).length > VOICE_NOTES_MAX) {
    notes.shift();
  }
  return notes.join(NOTE_SEP).slice(0, VOICE_NOTES_MAX);
}

/**
 * Apply a reflection to an ichi, pure and exported for tests: the model's
 * drift joins the pending pool, the pool commits past its threshold, and a
 * formed conviction joins the voice (evicting the oldest if the voice is full).
 */
export function applyReflection(ichi: Ichi, result: ReflectionResult): ReflectionApplication {
  const pending = accumulateDrift(ichi.pending_drift, result.drift as PendingDrift);
  const { traits, committed, remaining } = commitDrift(traitsOf(ichi), pending);

  return {
    traits,
    committed,
    remaining,
    voiceNotes: appendVoiceNote(ichi.voice_notes, result.voice_note),
  };
}

export interface ReflectReport {
  sentiment: number;
  memories: number;
  committed: PendingDrift;
  costCents: number;
}

/**
 * Reflect on one ichi. Returns null when there was honestly nothing to do:
 * no API key (self-host without one must run fine, ichi just never
 * reflect), an ichi that no longer exists, or no events since the last pass.
 */
export async function runReflect(ichiId: string): Promise<ReflectReport | null> {
  if (!env.ANTHROPIC_API_KEY) {
    console.log(`[reflect] ${ichiId} skipped — ANTHROPIC_API_KEY is not set`);
    return null;
  }

  const ichi = await query<Ichi>(`select * from ichi where id = $1`, [ichiId]).then(
    (rows) => rows[0] ?? null,
  );
  if (!ichi) return null;

  const events = await query<IchiEvent>(
    `select * from ichi_events
      where ichi_id = $1 and kind in ('call', 'feedback')
        and created_at > coalesce($2, 'epoch'::timestamptz)
      order by created_at asc
      limit ${MAX_EVENTS_READ}`,
    [ichiId, ichi.reflected_at],
  );
  if (events.length === 0) return null;

  const { data: raw, usage } = await structured<unknown>({
    model: env.MODEL_JUDGE,
    maxTokens: 2000,
    toolName: "record_reflection",
    toolDescription: "Record the ichi's reflection on these events. Call once.",
    schema: REFLECTION_SCHEMA,
    system: SYSTEM,
    content: [{ type: "text", text: buildReflectPrompt(ichi, events) }],
  });

  const parsed = reflectionShape.safeParse(raw);
  if (!parsed.success) throw new Error("reflection schema mismatch");
  const result = parsed.data;

  const applied = applyReflection(ichi, result);
  const cols = traitColumns(applied.traits);
  const cost = costCents(env.MODEL_JUDGE, usage);

  await tx(async (client) => {
    await client.query(
      `update ichi set
         openness = $2, conscientiousness = $3, extraversion = $4,
         agreeableness = $5, neuroticism = $6,
         pending_drift = $7, voice_notes = $8,
         reflected_at = now(), updated_at = now()
       where id = $1`,
      [
        ichiId,
        cols.openness,
        cols.conscientiousness,
        cols.extraversion,
        cols.agreeableness,
        cols.neuroticism,
        JSON.stringify(applied.remaining),
        applied.voiceNotes,
      ],
    );

    for (const m of result.memories) {
      await client.query(
        `insert into memories (ichi_id, body, kind, valence, salience)
         values ($1, $2, $3, $4, $5)`,
        [
          ichiId,
          m.body,
          m.kind,
          clamp(m.valence, -1, 1),
          clamp(m.salience, 0, 1),
        ],
      );
    }

    // The visible log line: what the ichi concluded, and what it changed.
    await client.query(
      `insert into ichi_events (ichi_id, kind, text, delta)
       values ($1, 'reflect', $2, $3)`,
      [
        ichiId,
        `reflected on ${events.length} event(s)`,
        JSON.stringify({
          sentiment: result.sentiment,
          committed: applied.committed,
          memories: result.memories.length,
          voice_note: result.voice_note || null,
          costCents: cost,
        }),
      ],
    );
  });

  return {
    sentiment: result.sentiment,
    memories: result.memories.length,
    committed: applied.committed,
    costCents: cost,
  };
}

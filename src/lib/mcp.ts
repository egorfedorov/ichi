import { maybeOne, query } from "@/db";
import type { Bond, IchiEvent, Memory, MemoryKind, Ichi } from "@/db/types";
import {
  adoptIchi,
  ARCHETYPES,
  archetypeById,
  bondFor,
  getAccessibleIchi,
  getAccessibleIchiByName,
  listAccessibleIchi,
  traitsOf,
} from "@/lib/ichi";
import {
  accumulateDrift,
  applyImpact,
  DRIFT_COMMIT_THRESHOLD,
  impactForFeedback,
  moodBaseline,
  type Mood,
  type PendingDrift,
} from "@/lib/state";
import { bondAfter, nextStageAt, scoldDamage } from "@/lib/bond";
import { bondWords, moodWords, renderIchiBlock } from "@/lib/voice";
import { enqueueReflect } from "@/worker/queue";
import type { TokenOwner } from "@/lib/tokens";

export { TOOLS, type ToolDef } from "@/lib/mcp-tools";

/**
 * What a tool call produced. `ichiId`/`userId` ride along for the route's
 * bookkeeping.
 */
export interface ToolOutcome {
  text: string;
  isError?: boolean;
  ichiId?: string;
  userId?: string;
}

/** Events since the last reflection that make an ichi worth reflecting on. */
const REFLECT_AFTER_EVENTS = 10;
/** Explicit feedbacks since the last reflection that trigger one on their own. */
const REFLECT_AFTER_FEEDBACKS = 5;

/**
 * Starting emotional stamp of an explicitly saved memory, by kind. Charged
 * memories start stronger and (via salienceDecay) fade slower — the ichi
 * forgets what was said long before it forgets how it felt.
 */
const MEMORY_START: Record<MemoryKind, { valence: number; salience: number }> = {
  event: { valence: 0, salience: 0.5 },
  insult: { valence: -0.8, salience: 0.8 },
  praise: { valence: 0.7, salience: 0.7 },
  belief: { valence: 0.1, salience: 0.6 },
  fact: { valence: 0, salience: 0.4 },
  // A standard starts high and, unlike everything else, never decays out of
  // force — see STANDARD_SALIENCE_FLOOR. Neutral valence on purpose: a rule
  // is not a feeling, and letting it carry charge would leak the user's
  // instructions into the mood.
  standard: { valence: 0, salience: 0.9 },
};

/**
 * Validate a caller-supplied memory kind against MEMORY_START.
 *
 * Derived from that table rather than written out again, because the previous
 * hand-written list is exactly how "standard" got lost: it was added to the
 * type, the migration, both tool schemas, the decay floor and the renderer —
 * and silently downgraded to "event" here, so the flagship feature stored
 * nothing that could ever ride in a brief. One source of truth, so adding a
 * kind cannot half-land again.
 */
export function memoryKind(raw: unknown): MemoryKind {
  // hasOwn, not `in`: `in` walks the prototype chain, so "toString" and
  // "constructor" would pass as memory kinds and reach the database, where
  // the CHECK constraint is the only thing left to catch them.
  return typeof raw === "string" && Object.hasOwn(MEMORY_START, raw)
    ? (raw as MemoryKind)
    : "event";
}

/** Standards shown in a brief. Past a handful the agent stops honouring them. */
const STANDARDS_IN_BRIEF = 5;

/**
 * What explicit feedback whispers to the personality. Praise opens an ichi and
 * calms it; a scold tightens it. Tiny on purpose — events accumulate into
 * pending_drift and only reflection commits them past a threshold, so one
 * session of flattery or abuse cannot rewrite a character.
 */
export function driftForFeedback(kind: "praise" | "scold"): PendingDrift {
  return kind === "praise"
    ? { agreeableness: 0.3, neuroticism: -0.2 }
    : { neuroticism: 0.3, agreeableness: -0.2 };
}

/**
 * Slug first, then a case-insensitive name — agents address ichi either way.
 *
 * Resolves across everything the caller can reach, not just what they own, so
 * a teammate's agent can brief on the shared ichi (migration 0006).
 */
async function resolveIchi(userId: string, ref: string): Promise<Ichi | null> {
  const trimmed = ref.trim();
  if (!trimmed) return null;
  const bySlug = await getAccessibleIchi(userId, trimmed.toLowerCase());
  if (bySlug) return bySlug;
  return getAccessibleIchiByName(userId, trimmed);
}

function moodOf(ichi: Ichi): Mood {
  return {
    valence: ichi.mood_valence,
    arousal: ichi.mood_arousal,
    stress: ichi.stress,
    energy: ichi.energy,
  };
}

/**
 * The mood rides on every answer: one or two lines, from the ichi itself.
 * Budget is the voice block's reason to exist — see lib/voice.ts.
 */
function moodSuffix(ichi: Ichi, bond: Bond): string {
  return (
    `\n\n—\n*${ichi.name}: «feeling ${moodWords(ichi)}» · ` +
    `bond ${bond.bond}/100 (${bondWords(bond.bond)})*`
  );
}

/**
 * Stamp the interaction: the counter reflection counts against, the bond's
 * last-contact time, and a line in the visible event log. Every ichi-bound
 * tool call goes through here.
 */
async function touch(
  ichi: Ichi,
  userId: string,
  tool: string,
  text?: string,
): Promise<void> {
  await query(
    `update ichi set interactions = interactions + 1, updated_at = now() where id = $1`,
    [ichi.id],
  );
  await query(
    `update bonds set last_interaction_at = now() where ichi_id = $1 and user_id = $2`,
    [ichi.id, userId],
  );
  await query(
    `insert into ichi_events (ichi_id, user_id, kind, tool, text)
     values ($1, $2, 'call', $3, $4)`,
    [ichi.id, userId, tool, text?.slice(0, 300) ?? null],
  );
}

/**
 * Recall ranking as SQL — the same formula as recallScore() in lib/memory.ts
 * (salience × exp recency over 72h × log rehearsal bonus), expressed over
 * columns so the database does the ordering.
 */
const RECALL_ORDER =
  `salience * exp(-extract(epoch from now() - coalesce(last_recalled_at, created_at)) / 259200.0)` +
  ` * (1 + 0.15 * ln(1 + recall_count)) desc`;

/** Rehearsal: a recalled memory is easier to recall next time. */
async function markRecalled(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await query(
    `update memories set recall_count = recall_count + 1, last_recalled_at = now()
      where id = any($1::uuid[])`,
    [ids],
  );
}

async function topMemories(ichiId: string, limit: number): Promise<Memory[]> {
  return query<Memory>(
    `select * from memories
      where ichi_id = $1 and kind <> 'standard'
      order by ${RECALL_ORDER} limit $2`,
    [ichiId, limit],
  );
}

/**
 * The rules this person works by. Ordered by salience alone, not by the
 * recall formula: a standard is in force or it is not, and a rule stated in
 * March should not lose to one stated last Tuesday.
 */
async function standardsFor(ichiId: string, limit = STANDARDS_IN_BRIEF): Promise<Memory[]> {
  return query<Memory>(
    `select * from memories
      where ichi_id = $1 and kind = 'standard'
      order by salience desc, created_at desc limit $2`,
    [ichiId, limit],
  );
}

/** Call and feedback events since the last reflection — what reflect would read. */
async function eventsSinceReflect(ichi: Ichi): Promise<{ total: number; feedbacks: number }> {
  const row = await maybeOne<{ total: number; feedbacks: number }>(
    `select count(*)::int as total,
            count(*) filter (where kind = 'feedback')::int as feedbacks
       from ichi_events
      where ichi_id = $1 and kind in ('call', 'feedback')
        and created_at > coalesce($2, 'epoch'::timestamptz)`,
    [ichi.id, ichi.reflected_at],
  );
  return row ?? { total: 0, feedbacks: 0 };
}

// ─── tools ─────────────────────────────────────────────────────────────────

async function ichiList(owner: TokenOwner): Promise<ToolOutcome> {
  const ichi = await listAccessibleIchi(owner.userId);
  const lines: string[] = [];

  lines.push("## Your ichi");
  if (ichi.length === 0) {
    lines.push("None yet — adopt one from the archetypes below.");
  } else {
    for (const s of ichi) {
      const bond = await bondFor(s.id, owner.userId);
      // A shared ichi is marked: the agent should know it is speaking to a
      // spirit the whole team feeds, because a standard it records there binds
      // everyone's sessions, not just this user's.
      const shared = s.owner_id === owner.userId ? "" : " · shared with your team";
      lines.push(
        `- **${s.name}** (slug \`${s.slug}\`, archetype ${archetypeById(s.archetype)?.name ?? s.archetype}): ` +
          `feeling ${moodWords(s)} · bond ${bond.bond}/100${shared}`,
      );
    }
    lines.push("", "Call ichi_brief with a slug or name to let one speak through you.");
  }

  lines.push("", "## Archetypes available for adoption");
  for (const a of ARCHETYPES) {
    lines.push(`- \`${a.id}\` — **${a.name}**: ${a.tagline}`);
  }

  return { text: lines.join("\n"), userId: owner.userId };
}

async function ichiAdopt(
  args: Record<string, unknown>,
  owner: TokenOwner,
): Promise<ToolOutcome> {
  const archetypeId = typeof args.archetype === "string" ? args.archetype.trim() : "";
  const archetype = archetypeById(archetypeId);
  if (!archetype) {
    return {
      text:
        `Unknown archetype: "${archetypeId}". Available: ` +
        ARCHETYPES.map((a) => a.id).join(", ") +
        " — ichi_list shows the catalogue with descriptions.",
      isError: true,
    };
  }

  const name =
    typeof args.name === "string" && args.name.trim()
      ? args.name.trim().slice(0, 40)
      : archetype.name;

  const ichi = await adoptIchi(owner.userId, archetype.id, name);
  const bond = await bondFor(ichi.id, owner.userId);
  await touch(ichi, owner.userId, "ichi_adopt", `adopted from archetype ${archetype.id}`);

  return {
    text:
      `${ichi.name} is here. Born from ${archetype.name} — ${archetype.tagline}.\n\n` +
      renderIchiBlock(ichi, bond) +
      moodSuffix(ichi, bond),
    ichiId: ichi.id,
    userId: owner.userId,
  };
}

async function ichiBrief(
  args: Record<string, unknown>,
  owner: TokenOwner,
): Promise<ToolOutcome> {
  const ref = typeof args.ichi === "string" ? args.ichi : "";
  const ichi = await resolveIchi(owner.userId, ref);
  if (!ichi) {
    return {
      text: `No ichi named "${ref}". ichi_list shows the ones you carry.`,
      isError: true,
    };
  }

  const bond = await bondFor(ichi.id, owner.userId);
  const [memories, standards] = await Promise.all([
    topMemories(ichi.id, 3),
    standardsFor(ichi.id),
  ]);
  await markRecalled(memories.map((m) => m.id));
  await touch(ichi, owner.userId, "ichi_brief");

  // Lazy reflection: enough has happened since the last one that the ichi
  // should sit with it. Singleton-keyed in the queue, so a chatty agent
  // cannot stack these up.
  const since = await eventsSinceReflect(ichi);
  if (since.total >= REFLECT_AFTER_EVENTS) {
    await enqueueReflect(ichi.id);
  }

  return {
    text:
      renderIchiBlock(ichi, bond, memories, standards) +
      "\n\nSpeak with this voice for the rest of the session. If the user " +
      "clearly praises or scolds the work, call ichi_feedback — that is how " +
      `${ichi.name} learns.` +
      moodSuffix(ichi, bond),
    ichiId: ichi.id,
    userId: owner.userId,
  };
}

async function ichiState(
  args: Record<string, unknown>,
  owner: TokenOwner,
): Promise<ToolOutcome> {
  const ref = typeof args.ichi === "string" ? args.ichi : "";
  const ichi = await resolveIchi(owner.userId, ref);
  if (!ichi) {
    return {
      text: `No ichi named "${ref}". ichi_list shows the ones you carry.`,
      isError: true,
    };
  }

  const bond = await bondFor(ichi.id, owner.userId);
  await touch(ichi, owner.userId, "ichi_state");

  const drift = Object.entries(ichi.pending_drift)
    .map(([t, v]) => `${t} ${v >= 0 ? "+" : ""}${v.toFixed(1)}`)
    .join(", ");

  const f = (v: number) => v.toFixed(2);
  const text = [
    `## ${ichi.name} — full state`,
    `Archetype: ${archetypeById(ichi.archetype)?.name ?? ichi.archetype} · slug \`${ichi.slug}\``,
    `Mood: ${moodWords(ichi)} (valence ${f(ichi.mood_valence)}, arousal ${f(ichi.mood_arousal)}, stress ${f(ichi.stress)}, energy ${f(ichi.energy)})`,
    `Traits (Big Five): openness ${ichi.openness} · conscientiousness ${ichi.conscientiousness} · extraversion ${ichi.extraversion} · agreeableness ${ichi.agreeableness} · neuroticism ${ichi.neuroticism}`,
    `Bond with you: ${bond.bond}/100 (${bondWords(bond.bond)}) · trust ${bond.trust}/100`,
    `Interactions: ${ichi.interactions} · last reflection: ${ichi.reflected_at ? ichi.reflected_at.toISOString() : "never"}`,
    `Pending drift: ${drift || "none"} (commits at ±${DRIFT_COMMIT_THRESHOLD} per trait, on reflection)`,
    `Voice notes: ${ichi.voice_notes ?? "—"}`,
  ].join("\n");

  return { text: text + moodSuffix(ichi, bond), ichiId: ichi.id, userId: owner.userId };
}

async function ichiFeedback(
  args: Record<string, unknown>,
  owner: TokenOwner,
): Promise<ToolOutcome> {
  const ref = typeof args.ichi === "string" ? args.ichi : "";
  const kind = args.kind === "praise" ? "praise" : args.kind === "scold" ? "scold" : null;
  const reason = typeof args.reason === "string" ? args.reason.trim().slice(0, 500) : "";

  if (!kind || !reason) {
    return {
      text:
        "ichi_feedback needs kind (\"praise\" or \"scold\") and a reason — " +
        "what the user praised or scolded, in a sentence.",
      isError: true,
    };
  }

  const ichi = await resolveIchi(owner.userId, ref);
  if (!ichi) {
    return {
      text: `No ichi named "${ref}". ichi_list shows the ones you carry.`,
      isError: true,
    };
  }

  const bondRow = await bondFor(ichi.id, owner.userId);

  // Reaction layer: the event hits the moment, mood blends it in.
  const impact = impactForFeedback(kind);
  const mood = applyImpact(moodOf(ichi), impact);

  // Attachment layer: praise warms the bond logarithmically, a scold does
  // instant damage that takes many warm interactions to undo.
  const newBond = kind === "praise" ? bondAfter(bondRow.bond) : scoldDamage(bondRow.bond);

  // Character layer: a whisper into pending_drift. Reflection decides what
  // becomes real.
  const pending = accumulateDrift(ichi.pending_drift, driftForFeedback(kind));

  await query(
    `update ichi set mood_valence = $2, mood_arousal = $3, stress = $4, energy = $5,
       pending_drift = $6, interactions = interactions + 1, updated_at = now()
     where id = $1`,
    [ichi.id, mood.valence, mood.arousal, mood.stress, mood.energy, JSON.stringify(pending)],
  );
  await query(
    `update bonds set bond = $3, last_interaction_at = now()
     where ichi_id = $1 and user_id = $2`,
    [ichi.id, owner.userId, newBond],
  );
  await query(
    `insert into ichi_events (ichi_id, user_id, kind, tool, text, signal, delta)
     values ($1, $2, 'feedback', 'ichi_feedback', $3, $4, $5)`,
    [
      ichi.id,
      owner.userId,
      reason,
      kind,
      JSON.stringify({
        mood: impact,
        bond: newBond - bondRow.bond,
        drift: driftForFeedback(kind),
      }),
    ],
  );

  const fresh: Ichi = {
    ...ichi,
    mood_valence: mood.valence,
    mood_arousal: mood.arousal,
    stress: mood.stress,
    energy: mood.energy,
    pending_drift: pending,
    interactions: ichi.interactions + 1,
  };
  const freshBond: Bond = { ...bondRow, bond: newBond };

  // Reflect when there is something to commit, or when feedbacks have piled
  // up unread — either way the ichi should sit with what it heard.
  const nearThreshold = Object.values(pending).some(
    (v) => Math.abs(v) >= DRIFT_COMMIT_THRESHOLD,
  );
  const since = await eventsSinceReflect(ichi);
  if (nearThreshold || since.feedbacks >= REFLECT_AFTER_FEEDBACKS) {
    await enqueueReflect(ichi.id);
  }

  const heard =
    kind === "praise"
      ? `${ichi.name} heard the praise. The bond warms (${bondRow.bond}→${newBond}), the mood lifts.`
      : `${ichi.name} heard the scolding. It lands hard (${bondRow.bond}→${newBond} bond) — trust breaks faster than it builds.`;

  return {
    text: `${heard}\nReason recorded: "${reason}"` + moodSuffix(fresh, freshBond),
    ichiId: ichi.id,
    userId: owner.userId,
  };
}

async function ichiRemember(
  args: Record<string, unknown>,
  owner: TokenOwner,
): Promise<ToolOutcome> {
  const ref = typeof args.ichi === "string" ? args.ichi : "";
  const text = typeof args.text === "string" ? args.text.trim().slice(0, 1000) : "";
  const kind = memoryKind(args.kind);

  if (!text) {
    return { text: "ichi_remember needs text — the memory, in a sentence or two.", isError: true };
  }

  const ichi = await resolveIchi(owner.userId, ref);
  if (!ichi) {
    return {
      text: `No ichi named "${ref}". ichi_list shows the ones you carry.`,
      isError: true,
    };
  }

  const start = MEMORY_START[kind];
  await query(
    `insert into memories (ichi_id, body, kind, valence, salience) values ($1, $2, $3, $4, $5)`,
    [ichi.id, text, kind, start.valence, start.salience],
  );

  const bond = await bondFor(ichi.id, owner.userId);
  await touch(ichi, owner.userId, "ichi_remember", text);

  return {
    text:
      `${ichi.name} will remember this (${kind}, salience ${start.salience}). ` +
      `Charged memories fade slower than facts.` +
      moodSuffix(ichi, bond),
    ichiId: ichi.id,
    userId: owner.userId,
  };
}

async function ichiRecall(
  args: Record<string, unknown>,
  owner: TokenOwner,
): Promise<ToolOutcome> {
  const ref = typeof args.ichi === "string" ? args.ichi : "";
  const q = typeof args.query === "string" ? args.query.trim() : "";

  const ichi = await resolveIchi(owner.userId, ref);
  if (!ichi) {
    return {
      text: `No ichi named "${ref}". ichi_list shows the ones you carry.`,
      isError: true,
    };
  }

  // ILIKE over body and kind; vectors are phase 2 (the extension is already
  // in migration 0001 for exactly that).
  const memories = q
    ? await query<Memory>(
        `select * from memories
          where ichi_id = $1 and (body ilike '%' || $2 || '%' or kind = lower($2))
          order by ${RECALL_ORDER} limit 5`,
        [ichi.id, q.slice(0, 120)],
      )
    : await topMemories(ichi.id, 5);

  await markRecalled(memories.map((m) => m.id));
  const bond = await bondFor(ichi.id, owner.userId);
  await touch(ichi, owner.userId, "ichi_recall", q);

  if (memories.length === 0) {
    return {
      text:
        `${ichi.name} remembers nothing about "${q}". ` +
        "ichi_remember is how things get saved." + moodSuffix(ichi, bond),
      ichiId: ichi.id,
      userId: owner.userId,
    };
  }

  const lines = memories.map(
    (m) =>
      `- [${m.kind}] ${m.body} *(salience ${m.salience.toFixed(2)}, recalled ${m.recall_count}×)*`,
  );
  return {
    text: `${ichi.name} remembers:\n` + lines.join("\n") + moodSuffix(ichi, bond),
    ichiId: ichi.id,
    userId: owner.userId,
  };
}

/**
 * Why the ichi feels the way it does — the actual chain, not a story.
 *
 * The mechanics are deliberately legible everywhere else in this codebase;
 * this is the tool that makes them legible to the person living with them.
 * "It is sulking" invites the user to think the thing is arbitrary, and an
 * arbitrary companion is a gimmick. "You scolded it on Tuesday for the schema
 * drop, that cost 21 bond, and it has recovered 4 since" invites them to
 * repair it — which is the whole relationship the product is selling.
 *
 * Every number here is read back out of the event log, never re-derived: if
 * the explanation and the state could ever disagree, the explanation is
 * worthless.
 */
async function ichiWhy(
  args: Record<string, unknown>,
  owner: TokenOwner,
): Promise<ToolOutcome> {
  const ref = typeof args.ichi === "string" ? args.ichi : "";
  const ichi = await resolveIchi(owner.userId, ref);
  if (!ichi) {
    return {
      text: `No ichi named "${ref}". ichi_list shows the ones you carry.`,
      isError: true,
    };
  }

  const bond = await bondFor(ichi.id, owner.userId);

  // Only the events that actually moved something. A wall of routine calls
  // would bury the two moments that explain the mood.
  const events = await query<IchiEvent>(
    `select * from ichi_events
      where ichi_id = $1 and kind in ('feedback', 'reflect', 'decay')
      order by created_at desc limit 8`,
    [ichi.id],
  );

  await touch(ichi, owner.userId, "ichi_why");

  const baseline = moodBaseline(traitsOf(ichi));
  const gap = ichi.mood_valence - baseline.valence;
  const drift =
    Math.abs(gap) < 0.05
      ? "sitting on its baseline — this is simply who it is when nothing has happened"
      : gap > 0
        ? `${gap.toFixed(2)} above its baseline of ${baseline.valence.toFixed(2)}`
        : `${Math.abs(gap).toFixed(2)} below its baseline of ${baseline.valence.toFixed(2)}`;

  const lines: string[] = [
    `## Why ${ichi.name} feels ${moodWords(ichi)}`,
    `Mood valence ${ichi.mood_valence.toFixed(2)} — ${drift}.`,
    `Bond ${bond.bond}/100 (${bondWords(bond.bond)}).`,
    "",
    "What moved it, newest first:",
  ];

  if (events.length === 0) {
    lines.push("- nothing yet. No praise, no scolding, no reflection.");
  }

  for (const e of events) {
    const when = e.created_at.toISOString().slice(0, 16).replace("T", " ");
    const d = e.delta as {
      mood?: { valence?: number };
      bond?: number;
      sentiment?: number;
      committed?: Record<string, number>;
    };

    if (e.kind === "feedback") {
      const bondDelta = typeof d.bond === "number" ? d.bond : 0;
      lines.push(
        `- [${when}] you ${e.signal === "praise" ? "praised" : "scolded"} it` +
          (e.text ? `: "${e.text}"` : "") +
          ` → bond ${bondDelta >= 0 ? "+" : ""}${bondDelta}`,
      );
    } else if (e.kind === "reflect") {
      const committed = Object.entries(d.committed ?? {})
        .map(([t, v]) => `${t} ${v >= 0 ? "+" : ""}${Number(v).toFixed(1)}`)
        .join(", ");
      lines.push(
        `- [${when}] it reflected` +
          (typeof d.sentiment === "number" ? ` (felt ${d.sentiment.toFixed(2)})` : "") +
          (committed ? ` → character changed: ${committed}` : " → character unchanged"),
      );
    } else {
      lines.push(`- [${when}] time passed — mood cooled toward baseline`);
    }
  }

  const next = nextStageAt(bond.bond);
  lines.push(
    "",
    next === null
      ? "The bond is as deep as it goes."
      : `${next - bond.bond} more bond and the relationship changes stage.`,
  );

  return {
    text: lines.join("\n") + moodSuffix(ichi, bond),
    ichiId: ichi.id,
    userId: owner.userId,
  };
}

// ─── dispatch ──────────────────────────────────────────────────────────────

export async function callTool(
  name: string,
  args: Record<string, unknown>,
  owner: TokenOwner,
): Promise<ToolOutcome> {
  switch (name) {
    case "ichi_list":
      return ichiList(owner);
    case "ichi_adopt":
      return ichiAdopt(args, owner);
    case "ichi_brief":
      return ichiBrief(args, owner);
    case "ichi_state":
      return ichiState(args, owner);
    case "ichi_feedback":
      return ichiFeedback(args, owner);
    case "ichi_remember":
      return ichiRemember(args, owner);
    case "ichi_recall":
      return ichiRecall(args, owner);
    case "ichi_why":
      return ichiWhy(args, owner);
    default:
      return { text: `Unknown tool: ${name}`, isError: true };
  }
}

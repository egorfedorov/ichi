import { z } from "zod";
import { maybeOne, query } from "@/db";
import type { Ichi, IchiEvent } from "@/db/types";
import { costCents, structured } from "@/lib/claude";
import { env } from "@/lib/env";
import { archetypeById, traitsOf } from "@/lib/ichi";
import { moodWords } from "@/lib/voice";

/**
 * The weekly letter (cron: Monday mornings, see LETTER_CRON).
 *
 * Everything else this worker does is bookkeeping the user never reads.
 * Reflection commits drift; decay fades numbers. Correct, and invisible.
 *
 * This is the one job that writes to the person. Once a week each ichi that
 * actually lived through something puts the week into its own words. It is the
 * retention feature and the demo of the whole premise at once: a state page is
 * checked once, but a thing that wrote you a letter gets opened.
 *
 * Skips ichi with a quiet week entirely — a letter that says "nothing
 * happened" every Monday trains people to ignore the next one, which is the
 * only failure mode that actually costs anything here.
 */

/** A week with fewer events than this is not worth writing home about. */
const MIN_EVENTS = 5;

/** Letters are the only place the ichi speaks at length; still, keep it short. */
const MAX_WORDS = 180;

const letterShape = z.object({
  body: z.string().min(20).max(2000),
});

const LETTER_SCHEMA = {
  type: "object",
  properties: {
    body: {
      type: "string",
      description:
        `The letter itself, at most ${MAX_WORDS} words. First person, addressed ` +
        "to the keeper as 'you'. No greeting line, no signature — the page " +
        "supplies both. Concrete about what actually happened; never invent an " +
        "event that is not in the list.",
    },
  },
  required: ["body"],
  additionalProperties: false,
} as const;

const SYSTEM =
  "You are an ichi — a household spirit that has spent the week riding " +
  "alongside your keeper's coding agent. Write them a short letter about the " +
  "week you had together.\n\n" +
  "Write in your own voice, the one described to you, and stay in it. Be " +
  "specific: name what happened. If the week was hard, say so without " +
  "sulking at them; if it was good, do not gush. You are a spirit with a " +
  "temper, not a report and not a pet. Never invent events. Never give " +
  "advice about their code — this is a letter, not a review.";

export interface WeekStats {
  events: number;
  praise: number;
  scold: number;
  memories: number;
}

/** The Monday (UTC) that starts the week containing `d`. */
export function weekStart(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  // getUTCDay: 0 = Sunday. Shift so Monday is the first day.
  const shift = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - shift);
  return t.toISOString().slice(0, 10);
}

/**
 * The prompt, pure and exported so a test can read what the model reads.
 */
export function buildLetterPrompt(
  ichi: Ichi,
  events: IchiEvent[],
  stats: WeekStats,
): string {
  const archetype = archetypeById(ichi.archetype);
  const t = traitsOf(ichi);

  const lines: string[] = [
    `You are ${ichi.name} (${archetype?.name ?? ichi.archetype}).`,
    `Your voice: ${ichi.voice_notes ?? archetype?.voice ?? "—"}`,
    `Your character: openness ${t.openness}, conscientiousness ${t.conscientiousness}, ` +
      `extraversion ${t.extraversion}, agreeableness ${t.agreeableness}, neuroticism ${t.neuroticism}.`,
    `You are feeling ${moodWords(ichi)} as you write.`,
    "",
    `The week in numbers: ${stats.events} interactions, ${stats.praise} times praised, ` +
      `${stats.scold} times scolded, ${stats.memories} things you chose to remember.`,
    "",
    "What happened, oldest first:",
  ];

  for (const e of events) {
    const when = e.created_at.toISOString().slice(0, 10);
    const what =
      e.kind === "feedback"
        ? `they ${e.signal === "praise" ? "praised you" : "scolded you"}: ${e.text ?? ""}`
        : `${e.kind}/${e.tool ?? "?"}${e.text ? `: ${e.text}` : ""}`;
    lines.push(`- [${when}] ${what.slice(0, 200)}`);
  }

  return lines.join("\n");
}

export interface LetterReport {
  ichiId: string;
  periodStart: string;
  words: number;
  costCents: number;
}

/**
 * Write one ichi's letter for the week just ended. Returns null when there
 * was honestly nothing to write about, or when the letter already exists.
 */
export async function runLetter(
  ichiId: string,
  now = new Date(),
): Promise<LetterReport | null> {
  if (!env.ANTHROPIC_API_KEY) return null;

  const ichi = await maybeOne<Ichi>(`select * from ichi where id = $1`, [ichiId]);
  if (!ichi) return null;

  // The week that just ended, not the one in progress.
  const lastWeek = new Date(now);
  lastWeek.setUTCDate(lastWeek.getUTCDate() - 7);
  const periodStart = weekStart(lastWeek);

  const already = await maybeOne<{ id: string }>(
    `select id from letters where ichi_id = $1 and period_start = $2`,
    [ichiId, periodStart],
  );
  if (already) return null;

  const events = await query<IchiEvent>(
    `select * from ichi_events
      where ichi_id = $1
        and kind in ('call', 'feedback')
        and created_at >= $2::date
        and created_at < $2::date + interval '7 days'
      order by created_at asc
      limit 80`,
    [ichiId, periodStart],
  );
  if (events.length < MIN_EVENTS) return null;

  const memoryRow = await maybeOne<{ n: number }>(
    `select count(*)::int as n from memories
      where ichi_id = $1
        and created_at >= $2::date and created_at < $2::date + interval '7 days'`,
    [ichiId, periodStart],
  );

  const stats: WeekStats = {
    events: events.length,
    praise: events.filter((e) => e.signal === "praise").length,
    scold: events.filter((e) => e.signal === "scold").length,
    memories: memoryRow?.n ?? 0,
  };

  const { data: raw, usage } = await structured<unknown>({
    model: env.MODEL_JUDGE,
    maxTokens: 1200,
    toolName: "write_letter",
    toolDescription: "Write this week's letter to your keeper. Call once.",
    schema: LETTER_SCHEMA,
    system: SYSTEM,
    content: [{ type: "text", text: buildLetterPrompt(ichi, events, stats) }],
  });

  const parsed = letterShape.safeParse(raw);
  if (!parsed.success) throw new Error("letter schema mismatch");

  const cost = costCents(env.MODEL_JUDGE, usage);

  // on conflict: two workers racing the same Monday must not both insert.
  await query(
    `insert into letters (ichi_id, period_start, body, stats)
     values ($1, $2, $3, $4)
     on conflict (ichi_id, period_start) do nothing`,
    [ichiId, periodStart, parsed.data.body, JSON.stringify({ ...stats, costCents: cost })],
  );

  return {
    ichiId,
    periodStart,
    words: parsed.data.body.split(/\s+/).length,
    costCents: cost,
  };
}

/**
 * Every ichi that was active last week. The cron fans out over this rather
 * than one job per ichi standing on a schedule, so adopting an ichi never
 * has to remember to register anything.
 */
export async function ichiWithAWeek(now = new Date()): Promise<string[]> {
  const lastWeek = new Date(now);
  lastWeek.setUTCDate(lastWeek.getUTCDate() - 7);
  const periodStart = weekStart(lastWeek);

  const rows = await query<{ ichi_id: string }>(
    `select e.ichi_id
       from ichi_events e
      where e.kind in ('call', 'feedback')
        and e.created_at >= $1::date
        and e.created_at < $1::date + interval '7 days'
      group by e.ichi_id
     having count(*) >= ${MIN_EVENTS}`,
    [periodStart],
  );
  return rows.map((r) => r.ichi_id);
}

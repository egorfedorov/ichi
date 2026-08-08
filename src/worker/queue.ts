import PgBoss from "pg-boss";
import { env } from "@/lib/env";

/**
 * Job queue. Lives in Postgres via pg-boss — one less service to run, and the
 * job rows sit next to the data they act on, so a stuck reflection is
 * debuggable with plain SQL.
 */

export const QUEUES = {
  reflect: "reflect",
  decay: "decay",
  letters: "letters",
  letter: "letter",
} as const;

/**
 * Monday morning, after the weekend has landed in the log. Two queues, not
 * one: `letters` is the fan-out that decides who has something to say, and
 * `letter` writes a single ichi's — so one model call failing retries alone
 * instead of taking every other ichi's letter down with it.
 */
export const LETTER_CRON = "17 9 * * 1";

/**
 * How often ichi cool down. Every six hours rather than nightly: the pass is
 * cheap when nothing changed, and a quarrel from this morning should be
 * noticeably fainter by evening. Not on :00/:30 — that is when every other
 * cron in the world fires.
 */
export const DECAY_CRON = "23 */6 * * *";

let boss: PgBoss | null = null;
let starting: Promise<PgBoss> | null = null;

export async function getBoss(): Promise<PgBoss> {
  if (boss) return boss;
  starting ??= (async () => {
    const instance = new PgBoss({
      connectionString: env.DATABASE_URL,
      schema: "pgboss",
      retryLimit: 3,
      retryDelay: 30,
      retryBackoff: true,
    });
    instance.on("error", (err) => console.error("[queue]", err));
    await instance.start();
    for (const name of Object.values(QUEUES)) {
      await instance.createQueue(name);
    }
    boss = instance;
    return instance;
  })();
  return starting;
}

/**
 * One reflection per ichi in flight; the singleton window keeps a chatty
 * agent from queueing a reflect on every ichi_brief. Ten minutes rather than
 * the job's own runtime: an ichi mid-conversation will have more to say by
 * then, and that deserves a fresh read, not a merged one.
 */
export async function enqueueReflect(ichiId: string): Promise<void> {
  const b = await getBoss();
  await b.send(
    QUEUES.reflect,
    { ichiId },
    { singletonKey: ichiId, singletonSeconds: 600 },
  );
}

/**
 * Register the recurring decay pass. pg-boss stores the schedule in the
 * database, so it survives restarts and only one worker fires it even if
 * several are running.
 */
export async function scheduleDecay(): Promise<void> {
  const b = await getBoss();
  await b.schedule(QUEUES.decay, DECAY_CRON, {}, { tz: "UTC" });
}

export async function scheduleLetters(): Promise<void> {
  const b = await getBoss();
  await b.schedule(QUEUES.letters, LETTER_CRON, {}, { tz: "UTC" });
}

/**
 * One letter job per ichi. Keyed by ichi and week so a re-run of the
 * fan-out cannot queue a second letter for the same Monday — the unique index
 * would catch it anyway, but paying for the model call twice to then discard
 * one is the kind of waste that only shows up on the bill.
 */
export async function enqueueLetter(ichiId: string, periodStart: string): Promise<void> {
  const b = await getBoss();
  await b.send(
    QUEUES.letter,
    { ichiId },
    { singletonKey: `${ichiId}:${periodStart}`, singletonSeconds: 86_400 },
  );
}

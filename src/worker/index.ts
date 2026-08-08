import {
  DECAY_CRON,
  enqueueLetter,
  getBoss,
  LETTER_CRON,
  QUEUES,
  scheduleDecay,
  scheduleLetters,
} from "@/worker/queue";
import { runReflect } from "@/worker/reflect";
import { runDecay } from "@/worker/decay";
import { ichchiWithAWeek, runLetter, weekStart } from "@/worker/letter";

/**
 * Background worker. Run alongside the web app:
 *
 *   npm run worker
 */

async function main() {
  const boss = await getBoss();

  await boss.work(
    QUEUES.reflect,
    { batchSize: 1, pollingIntervalSeconds: 2 },
    async ([job]) => {
      const { ichchiId } = job.data as { ichchiId: string };
      const started = Date.now();
      try {
        const r = await runReflect(ichchiId);
        console.log(
          r
            ? `[reflect] ${ichchiId} sentiment=${r.sentiment.toFixed(2)} ` +
                `memories=${r.memories} committed=${JSON.stringify(r.committed)} ` +
                `${r.costCents.toFixed(2)}¢ ${Date.now() - started}ms`
            : `[reflect] ${ichchiId} nothing to do ${Date.now() - started}ms`,
        );
      } catch (err) {
        // pg-boss swallows the throw into its retry bookkeeping, so a failure
        // would otherwise leave no trace in the log at all.
        console.error(
          `[reflect] ${ichchiId} FAILED after ${Date.now() - started}ms:`,
          err instanceof Error ? err.message : err,
        );
        throw err;
      }
    },
  );

  await boss.work(QUEUES.decay, { batchSize: 1, pollingIntervalSeconds: 30 }, async () => {
    const started = Date.now();
    try {
      const r = await runDecay();
      console.log(
        `[decay] ichchi=${r.ichchi} moods=${r.moodsAdjusted} ` +
          `bonds=${r.bondsDecayed} memories=${r.memoriesDecayed} ` +
          `pruned=${r.eventsPruned} departed=${r.departed} ${Date.now() - started}ms`,
      );
    } catch (err) {
      console.error(
        `[decay] FAILED after ${Date.now() - started}ms:`,
        err instanceof Error ? err.message : err,
      );
      throw err;
    }
  });
  await scheduleDecay();

  // The fan-out: decide who had a week worth writing about, then one job per
  // ichchi so a single failed model call retries alone.
  await boss.work(QUEUES.letters, { batchSize: 1, pollingIntervalSeconds: 60 }, async () => {
    const ids = await ichchiWithAWeek();
    const period = weekStart(new Date(Date.now() - 7 * 86_400_000));
    for (const id of ids) await enqueueLetter(id, period);
    console.log(`[letters] ${period}: queued ${ids.length} letter(s)`);
  });

  await boss.work(QUEUES.letter, { batchSize: 1, pollingIntervalSeconds: 5 }, async ([job]) => {
    const { ichchiId } = job.data as { ichchiId: string };
    const started = Date.now();
    try {
      const r = await runLetter(ichchiId);
      console.log(
        r
          ? `[letter] ${ichchiId} ${r.periodStart} ${r.words} words ` +
              `${r.costCents.toFixed(2)}¢ ${Date.now() - started}ms`
          : `[letter] ${ichchiId} nothing to write ${Date.now() - started}ms`,
      );
    } catch (err) {
      console.error(
        `[letter] ${ichchiId} FAILED after ${Date.now() - started}ms:`,
        err instanceof Error ? err.message : err,
      );
      throw err;
    }
  });
  await scheduleLetters();

  console.log(
    `[worker] up — queues: ${Object.values(QUEUES).join(", ")} ` +
      `(one job at a time per queue, decay ${DECAY_CRON} UTC, letters ${LETTER_CRON} UTC)`,
  );

  const shutdown = async (signal: string) => {
    console.log(`\n[worker] ${signal}, draining…`);
    await boss.stop({ graceful: true, timeout: 30_000 });
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});

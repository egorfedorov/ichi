import { DECAY_CRON, getBoss, QUEUES, scheduleDecay } from "@/worker/queue";
import { runReflect } from "@/worker/reflect";
import { runDecay } from "@/worker/decay";

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
          `bonds=${r.bondsDecayed} memories=${r.memoriesDecayed} ${Date.now() - started}ms`,
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

  console.log(
    `[worker] up — queues: ${Object.values(QUEUES).join(", ")} ` +
      `(one job at a time per queue, decay ${DECAY_CRON} UTC)`,
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

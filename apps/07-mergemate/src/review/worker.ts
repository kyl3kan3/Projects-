/**
 * The review worker process: `npm run worker`.
 *
 * Long-lived, because a review takes 30-120s and the deployment target for the
 * webhook tier and the workers is a small always-on host (ARCHITECTURE.md), not a
 * serverless function. Concurrency is bounded twice: globally by
 * MAX_REVIEW_CONCURRENCY, and per installation by a Redis slot count, so one
 * monorepo cannot occupy every worker.
 *
 * Authentication note: each job needs an installation-scoped token, which Probot
 * mints. The worker therefore builds a Probot instance purely as an auth
 * provider — `probot.auth(installationId)` — and never registers webhook
 * handlers on it.
 */

import "../lib/load-env";
import { DelayedError, type Job } from "bullmq";
import { Probot } from "probot";
import { acquireSlot, closeQueue, makeWorker, releaseSlot } from "./queue";
import { executeReviewJob, gatewayFor, type ReviewJobData } from "./run";
import { selectModel } from "./model";
import { closeDb } from "../db";
import { env } from "../lib/env";
import { log } from "../lib/logger";

/** In-flight reviews allowed per installation at once. */
const PER_INSTALLATION_CONCURRENCY = 2;

async function main() {
  const probot = new Probot({
    appId: process.env.APP_ID,
    privateKey: process.env.PRIVATE_KEY,
    secret: process.env.WEBHOOK_SECRET,
  });
  const model = selectModel();

  log.info(
    { model: model.id, fake: model.isFake, concurrency: env.maxReviewConcurrency },
    "review worker starting",
  );

  const worker = makeWorker(async (job: Job<ReviewJobData>) => {
    const data = job.data;
    const token = job.token;
    const got = await acquireSlot(data.githubInstallationId, PER_INSTALLATION_CONCURRENCY);
    if (!got) {
      // Put it back rather than failing it: the job keeps its attempts, and the
      // installation drains at its own pace.
      if (token) {
        await job.moveToDelayed(Date.now() + 15_000, token);
        throw new DelayedError();
      }
      throw new Error("no slot available for installation");
    }

    try {
      const octokit = await probot.auth(data.githubInstallationId);
      const outcome = await executeReviewJob(data, {
        gateway: gatewayFor(octokit as never),
        model,
      });
      log.info({ jobId: job.id, status: outcome.status, detail: outcome.detail }, "job finished");
    } finally {
      await releaseSlot(data.githubInstallationId);
    }
  });

  worker.on("failed", (job, err) => {
    if (err instanceof DelayedError) return;
    log.error({ jobId: job?.id, err: err.message, attempts: job?.attemptsMade }, "job failed");
  });

  const shutdown = async (signal: string) => {
    log.info({ signal }, "worker shutting down");
    await worker.close();
    await closeQueue();
    await closeDb();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err: unknown) => {
  log.error({ err: err instanceof Error ? err.message : String(err) }, "worker crashed");
  process.exit(1);
});

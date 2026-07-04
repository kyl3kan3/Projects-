import { Worker, type WorkerOptions } from "bullmq";
import { attributeRecovery } from "@/lib/analytics";
import { planPreDunning, planRecovery } from "@/lib/campaigns";
import { serverEnv } from "@/lib/env";
import { sendDunningEmail } from "@/lib/mailer";
import type { DunlyJobData, DunlyJobName } from "@/lib/queue";
import { retryInvoice } from "@/lib/stripe";

async function processJob(name: DunlyJobName, data: DunlyJobData) {
  switch (name) {
    case "process-webhook":
      if (data.stripeEventId) await attributeRecovery(data.stripeEventId);
      return { processed: true };
    case "schedule-retry":
      return planRecovery(data.paymentFailureId ?? "failure_demo", "campaign_default");
    case "send-message":
      return sendDunningEmail({
        to: "billing@example.com",
        customerName: "Billing team",
        subject: "Payment update needed",
        cardUpdateUrl: `${serverEnv.appUrl}/card-update/demo-card-update-token`,
        amountCents: 14900,
      });
    case "pre-dunning":
      return planPreDunning("pm_demo", "campaign_pre_dunning");
    default:
      return retryInvoice(data.stripeAccountId ?? "acct_demo", "in_demo", data.idempotencyKey);
  }
}

if (!serverEnv.redisUrl) {
  console.log("Dunly worker dry-run: REDIS_URL is not set, so no queue is attached.");
  process.exit(0);
}

const redisUrl = new URL(serverEnv.redisUrl);
const workerOptions: WorkerOptions = {
  connection: {
    host: redisUrl.hostname,
    port: Number(redisUrl.port || 6379),
    username: redisUrl.username ? decodeURIComponent(redisUrl.username) : undefined,
    password: redisUrl.password ? decodeURIComponent(redisUrl.password) : undefined,
    db: redisUrl.pathname.length > 1 ? Number(redisUrl.pathname.slice(1)) : 0,
    tls: redisUrl.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null,
  },
};

const worker = new Worker<DunlyJobData, unknown, DunlyJobName>(
  "dunly-recovery",
  (job) => processJob(job.name, job.data),
  workerOptions,
);

worker.on("completed", (job) => {
  console.log(`Completed ${job.name} ${job.id}`);
});

worker.on("failed", (job, error) => {
  console.error(`Failed ${job?.name ?? "unknown"} ${job?.id ?? ""}`, error);
});

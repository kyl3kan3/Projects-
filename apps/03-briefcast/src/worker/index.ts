/**
 * src/worker/index.ts
 *
 * Background worker entrypoint (long-running Node process, deployed separately
 * from the Next.js app). Registers BullMQ workers for the meeting pipeline:
 *
 *   transcribe -> extract-insights -> deliver-slack
 *                                  -> sync-crm
 *   (plus: schedule-bots, reconcile-seats, calendar-sync)
 *
 * Run with: npm run worker
 *
 * TODO:
 * - [ ] Create shared IORedis connection from REDIS_URL (maxRetriesPerRequest: null)
 * - [ ] Register a Worker per queue with concurrency + exponential backoff
 *       (attempts: 5, backoff 30s..10m) and dead-letter handling
 * - [ ] Graceful shutdown on SIGTERM/SIGINT (drain in-flight jobs)
 * - [ ] Health endpoint or heartbeat for the hosting platform
 * - [ ] Structured logging + error tracking (Sentry)
 */

export const QUEUE_NAMES = {
  transcribe: "transcribe",
  extractInsights: "extract-insights",
  deliverSlack: "deliver-slack",
  syncCrm: "sync-crm",
  scheduleBots: "schedule-bots",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

async function main(): Promise<void> {
  throw new Error("Not implemented");
}

main();

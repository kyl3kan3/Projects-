/**
 * src/worker/index.ts
 *
 * Long-lived worker entrypoint (Railway/Fly, run with `npm run worker`).
 * Registers BullMQ workers and repeatable jobs; shares src/db and src/lib
 * with the Next.js app. See ARCHITECTURE.md "Queue & Worker Jobs".
 *
 * Queues and jobs:
 *  - process-inspection   enqueued on inspection submit
 *  - notify               defect/OOS/ticket/link/due sends (SMS + email)
 *  - service-reminders    nightly per fleet, fleet-local time
 *  - render-dvir-pdf      on office request
 *  - weekly-digest        weekly per fleet
 *  - process-stripe-event enqueued by the webhook route after persist
 *
 * TODO:
 * - [ ] BullMQ connection from env.redisUrl (ioredis, TLS,
 *       maxRetriesPerRequest: null).
 * - [ ] Register the six workers above with per-queue concurrency
 *       (notify 8, process-inspection 4, others 2).
 * - [ ] Repeatable schedules: service-reminders hourly gate that fires
 *       per fleet at their local 5am; weekly-digest per fleet setting.
 * - [ ] Retries 3x exponential; dead-letter queue + Sentry on repeated
 *       failure.
 * - [ ] Graceful shutdown: SIGTERM drains active jobs, closes Redis + PG.
 * - [ ] env.dryRun short-circuits all outbound SMS/email with a log line.
 */

export const QUEUE_NAMES = [
  "process-inspection",
  "notify",
  "service-reminders",
  "render-dvir-pdf",
  "weekly-digest",
  "process-stripe-event",
] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];

export async function main(): Promise<void> {
  throw new Error("Not implemented");
}

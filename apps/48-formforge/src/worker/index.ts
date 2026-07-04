/**
 * src/worker/index.ts
 *
 * Long-lived worker entrypoint (Railway/Fly). Registers BullMQ workers
 * and repeatable jobs; shares src/db and src/lib with the Next.js app.
 * Job payloads carry ids only -- PHI never enters Redis.
 *
 * TODO:
 * - [ ] BullMQ connection from REDIS_URL (ioredis, TLS).
 * - [ ] Workers: send-reminder (via lib/reminders plans), render-packet-
 *       pdf (lib/pdf), send-intake-link, notify-clinician.
 * - [ ] Repeatable: daily retention sweep (hard-delete expired intakes +
 *       S3 objects, audit-log the deletion); daily overdue-status roll.
 * - [ ] Stop-on-complete: completion cancels a patient's outstanding
 *       reminder jobs within one poll interval.
 * - [ ] Dead-letter queue + Sentry (PII-scrubbed) on repeated failure;
 *       graceful shutdown draining active jobs.
 * - [ ] DRY_RUN=1 short-circuits all outbound email/SMS.
 */

export async function main(): Promise<void> {
  throw new Error("Not implemented");
}

/**
 * src/worker/index.ts
 *
 * Long-lived BullMQ worker process (deployed separately; `npm run worker`).
 * Owns fan-outs and everything time-based: announcement delivery, game-day
 * and volunteer reminders, installment charges, waitlist promotion.
 *
 * TODO:
 * - [ ] Queues: fan-out-announcement, send-reminder (game-day, volunteer),
 *       charge-installment, promote-waitlist, regenerate-feeds.
 * - [ ] Per-club rate limiting on fan-outs; SMS budget check per job.
 * - [ ] Send-time re-checks: game still exists/unchanged, household still
 *       consented, slot still claimed.
 * - [ ] DRY_RUN=1 short-circuits outbound email/SMS with structured logs.
 * - [ ] Dead-letter queue + Sentry on repeated failures; graceful shutdown.
 */

export function startWorker(): Promise<void> {
  throw new Error("Not implemented");
}

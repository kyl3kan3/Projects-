/**
 * The smart retry engine's brain: computing WHEN to retry.
 * Default plan: +1d, +3d, +7d, +14d from first failure, each nudged to a
 * "good moment" — local morning (9-11am), start-of-month/payday proximity.
 * Execution lives in the worker; this module is pure and testable.
 */

import type { RetryStep } from "@/db/schema";

export const DEFAULT_RETRY_SCHEDULE: RetryStep[] = [
  { offsetHours: 24 },
  { offsetHours: 72 },
  { offsetHours: 168 },
  { offsetHours: 336 },
];

/** Paydays cluster on the 1st and 15th. Weight retries toward them. */
function nudgeToGoodMoment(when: Date): Date {
  const d = new Date(when);

  // Land in the 9-11am window (org-local approximated as UTC-6 for MVP;
  // per-customer timezones are a post-MVP refinement).
  const LOCAL_OFFSET = -6;
  const localHour = (d.getUTCHours() + LOCAL_OFFSET + 24) % 24;
  if (localHour < 9) d.setUTCHours(d.getUTCHours() + (9 - localHour));
  else if (localHour > 11) d.setUTCHours(d.getUTCHours() + (24 - localHour) + 9);

  // If we're within 36h before the 1st or 15th, wait for it — funds arrive.
  const day = d.getUTCDate();
  const daysInMonth = new Date(d.getUTCFullYear(), d.getUTCMonth() + 1, 0).getUTCDate();
  if (day === daysInMonth && daysInMonth >= 28) d.setUTCDate(day + 1);
  else if (day === 14) d.setUTCDate(15);

  return d;
}

export function computeRetryPlan(
  firstFailedAt: Date,
  schedule: RetryStep[] = DEFAULT_RETRY_SCHEDULE,
): Date[] {
  const now = Date.now();
  return schedule
    .map((s) => nudgeToGoodMoment(new Date(firstFailedAt.getTime() + s.offsetHours * 3600_000)))
    .map((d) => (d.getTime() <= now ? new Date(now + 5 * 60_000) : d)) // past slots run soon, not never
    .sort((a, b) => a.getTime() - b.getTime());
}

/**
 * Suppression: if Stripe Smart Retries are still scheduled for the invoice,
 * we defer our own retries (never double-charge) and run messaging only.
 */
export function shouldSuppressRetries(opts: {
  stripeSmartRetriesActive: boolean;
  hardDecline: boolean;
}): { retries: boolean; reason?: string } {
  if (opts.hardDecline) return { retries: false, reason: "hard_decline" };
  if (opts.stripeSmartRetriesActive) return { retries: false, reason: "stripe_smart_retries" };
  return { retries: true };
}

/**
 * The scheduled work, in one place, with one implementation and two triggers.
 *
 * ARCHITECTURE.md called for BullMQ workers on Redis. The deployment target
 * (Vercel + Neon, per the portfolio's DEPLOYING.md) has no always-on process, so
 * the sweeps live here as plain functions, and are driven by:
 *
 * - `/api/cron/tick` — production. Protected by `CRON_SECRET`, refuses to run
 *   when the secret is unset, and works to a bounded time budget.
 * - `npm run worker` — development. The same functions in a loop, so nobody has
 *   to wait until 3am to see whether the retention scan works. It takes a Redis
 *   lock when `REDIS_URL` is set so two processes cannot double-send email.
 *
 * Nothing here is a second code path: the route and the worker call these.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { announcements, deliveries, schools } from "@/db/schema";
import { fanOut } from "@/lib/announcements";
import { dunning } from "@/lib/billing";
import { refreshEligibility } from "@/lib/progression";
import { scanSchool } from "@/lib/retention";

export interface SweepSummary {
  schools: number;
  eligibilityRefreshed: number;
  flagged: number;
  autoRecovered: number;
  dunningEmailed: number;
  dunningEscalated: number;
  announcementsResumed: number;
  errors: string[];
  /** Set when the time budget ran out before every school was swept. */
  truncated: boolean;
}

export interface SweepOptions {
  now?: Date;
  /** Wall-clock budget in ms; the sweep stops cleanly rather than being killed. */
  budgetMs?: number;
  /** Limit to one school — used by tests and by the "run now" button. */
  schoolId?: string;
}

export async function runSweeps(options: SweepOptions = {}): Promise<SweepSummary> {
  const db = getDb();
  const now = options.now ?? new Date();
  const deadline = Date.now() + (options.budgetMs ?? 45_000);

  const rows = options.schoolId
    ? await db.select({ id: schools.id, name: schools.name }).from(schools).where(eq(schools.id, options.schoolId))
    : await db.select({ id: schools.id, name: schools.name }).from(schools);

  const summary: SweepSummary = {
    schools: 0,
    eligibilityRefreshed: 0,
    flagged: 0,
    autoRecovered: 0,
    dunningEmailed: 0,
    dunningEscalated: 0,
    announcementsResumed: 0,
    errors: [],
    truncated: false,
  };

  for (const school of rows) {
    if (Date.now() > deadline) {
      summary.truncated = true;
      break;
    }
    summary.schools += 1;
    try {
      const refreshed = await refreshEligibility(school.id, now);
      summary.eligibilityRefreshed += refreshed.enrollmentsUpdated;
    } catch (err) {
      summary.errors.push(`${school.name}: eligibility — ${message(err)}`);
    }
    try {
      const scan = await scanSchool(school.id, now);
      summary.flagged += scan.flagged;
      summary.autoRecovered += scan.autoRecovered;
    } catch (err) {
      summary.errors.push(`${school.name}: retention — ${message(err)}`);
    }
    try {
      const dun = await dunning({ schoolId: school.id, now });
      summary.dunningEmailed += dun.emailed;
      summary.dunningEscalated += dun.escalated;
    } catch (err) {
      summary.errors.push(`${school.name}: dunning — ${message(err)}`);
    }
    try {
      summary.announcementsResumed += await resumeStalledAnnouncements(school.id, school.name);
    } catch (err) {
      summary.errors.push(`${school.name}: announcements — ${message(err)}`);
    }
  }

  return summary;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * An announcement whose fan-out died half way through (a deploy, a timeout) has
 * `sent_at` set and queued deliveries left over. Re-running the fan-out resumes
 * it; the unique index means nobody is mailed twice.
 */
async function resumeStalledAnnouncements(schoolId: string, schoolName: string): Promise<number> {
  const db = getDb();
  const stalled = await db
    .selectDistinct({ id: announcements.id })
    .from(announcements)
    .innerJoin(deliveries, eq(deliveries.announcementId, announcements.id))
    .where(and(eq(announcements.schoolId, schoolId), eq(deliveries.status, "queued")));

  let resumed = 0;
  for (const row of stalled) {
    const result = await fanOut({ announcementId: row.id, schoolId, schoolName });
    resumed += result.sent;
  }
  return resumed;
}

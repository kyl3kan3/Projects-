/**
 * The sweep — all background work, in one idempotent function.
 *
 * `/api/cron/tick` calls it, `npm run worker` calls it on a loop, and a test can call
 * it directly with a frozen date. It does four things, in this order, inside a time
 * budget:
 *
 *   1. drain queued documents through extraction (the expensive one, so it goes first
 *      and gets most of the budget);
 *   2. close the prior period for every org whose prior period is clean;
 *   3. send the close nudge for periods that are *not* clean, on a fixed ladder;
 *   4. send the weekly digest, once per ISO week per org.
 *
 * Everything it does is safe to do twice: extraction claims with a conditional
 * UPDATE, closes are versioned rebuilds, and every email is behind a
 * `notifications` unique key.
 */

import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  documents,
  organizations,
  usageCounters,
  users,
  type Organization,
} from "@/db/schema";
import {
  daysBetween,
  monthName,
  periodEnd,
  previousPeriod,
  today,
  type Period,
} from "@/lib/dates";
import { openReviewDocumentCount, STALE_EXTRACTING_MS } from "@/lib/documents";
import { extractDocument } from "@/lib/extract-run";
import {
  claimNotification,
  digestDueOn,
  nudgeKey,
  nudgeRungFor,
  releaseNotification,
  weeklyDigestKey,
} from "@/lib/digests";
import {
  closeReadyEmail,
  reviewNudgeEmail,
  sendEmail,
  weeklyDigestEmail,
} from "@/lib/email";
import { env } from "@/lib/env";
import { closeGate, getPeriod, runClose } from "@/lib/close-package";
import { formatCents } from "@/lib/money";
import { currentPeriod, forwardingAddress, usageFor } from "@/lib/org";
import { reportUsage } from "@/lib/stripe";
import { signedDownloadUrl } from "@/lib/storage";
import { tickBudgetMs } from "@/lib/runtime";

export interface SweepOptions {
  budgetMs?: number;
  /** Restrict to one org — used by tests and by the manual "run now" action. */
  organizationId?: string;
  /** Override "today" (YYYY-MM-DD) so a ladder can be tested without waiting. */
  asOf?: string;
  skipExtraction?: boolean;
  skipCloses?: boolean;
  skipEmails?: boolean;
}

export interface SweepResult {
  extracted: number;
  parked: number;
  closed: string[];
  blocked: string[];
  nudges: number;
  digests: number;
  usageReported: number;
  timedOut: boolean;
}

export async function runSweep(opts: SweepOptions = {}): Promise<SweepResult> {
  const budget = opts.budgetMs ?? tickBudgetMs();
  const deadline = Date.now() + budget;
  const result: SweepResult = {
    extracted: 0,
    parked: 0,
    closed: [],
    blocked: [],
    nudges: 0,
    digests: 0,
    usageReported: 0,
    timedOut: false,
  };

  const orgs = await listOrgs(opts.organizationId);

  if (!opts.skipExtraction) {
    for (const org of orgs) {
      if (Date.now() > deadline) {
        result.timedOut = true;
        break;
      }
      const drained = await drainQueue(org, deadline);
      result.extracted += drained.extracted;
      result.parked += drained.parked;
      if (drained.timedOut) result.timedOut = true;
    }
  }

  for (const org of orgs) {
    if (Date.now() > deadline) {
      result.timedOut = true;
      break;
    }
    const asOf = opts.asOf ?? today(org.timeZone);
    const period = previousPeriod(currentPeriod(org, asOf));

    if (!opts.skipCloses) {
      const outcome = await maybeClose(org, period, asOf, Boolean(opts.skipEmails));
      if (outcome === "closed") result.closed.push(`${org.id}:${period}`);
      if (outcome === "blocked") {
        result.blocked.push(`${org.id}:${period}`);
        if (!opts.skipEmails && (await sendNudge(org, period, asOf))) result.nudges += 1;
      }
    }

    if (!opts.skipEmails && digestDueOn(asOf, org.digestWeekday) && org.weeklyDigestEnabled) {
      if (await sendDigest(org, asOf)) result.digests += 1;
    }

    if (await reportPeriodUsage(org, period)) result.usageReported += 1;
  }

  return result;
}

async function listOrgs(organizationId?: string): Promise<Organization[]> {
  const db = getDb();
  if (organizationId) {
    return db.select().from(organizations).where(eq(organizations.id, organizationId));
  }
  return db.select().from(organizations).orderBy(asc(organizations.createdAt));
}

/**
 * Extract everything queued for one org.
 *
 * Stops at the first parked document: parking means the org is at its cap, and every
 * later document would park too. That keeps a capped org from burning the whole
 * sweep's budget discovering the same fact 900 times.
 */
async function drainQueue(
  org: Organization,
  deadline: number,
): Promise<{ extracted: number; parked: number; timedOut: boolean }> {
  const staleSeconds = Math.round(STALE_EXTRACTING_MS / 1000);
  const queued = await getDb()
    .select({ id: documents.id })
    .from(documents)
    .where(
      and(
        eq(documents.organizationId, org.id),
        isNull(documents.duplicateOfId),
        or(
          eq(documents.status, "queued"),
          and(
            eq(documents.status, "extracting"),
            sql`${documents.extractingSince} < now() - (${staleSeconds} * interval '1 second')`,
          ),
        ),
      ),
    )
    .orderBy(asc(documents.receivedAt))
    .limit(200);

  let extracted = 0;
  let parked = 0;
  for (const row of queued) {
    if (Date.now() > deadline) return { extracted, parked, timedOut: true };
    const outcome = await extractDocument(row.id);
    if (outcome.outcome === "parked") {
      parked = queued.length - extracted;
      break;
    }
    if (outcome.outcome !== "skipped") extracted += 1;
  }
  return { extracted, parked, timedOut: false };
}

async function maybeClose(
  org: Organization,
  period: Period,
  asOf: string,
  skipEmails: boolean,
): Promise<"closed" | "blocked" | "noop"> {
  // Only ever close a period that has actually ended.
  if (daysBetween(periodEnd(period), asOf) < 1) return "noop";
  const existing = await getPeriod(org.id, period);
  if (existing?.status === "closed") return "noop";

  const gate = await closeGate(org.id, period);
  if (!gate.clean) return "blocked";

  const outcome = await runClose(org.id, period);
  if (outcome.status !== "closed") return outcome.status === "blocked" ? "blocked" : "noop";

  if (!skipEmails && outcome.summary) {
    const key = `close:${period}`;
    if (await claimNotification(org.id, "close_ready", key, { period })) {
      const owner = await ownerEmail(org.id);
      if (owner) {
        const sent = await sendEmail(
          closeReadyEmail(owner, {
            orgName: org.name,
            monthLabel: `${monthName(period)} ${period.slice(0, 4)}`,
            period,
            total: formatCents(outcome.summary.totalCents, outcome.summary.currency),
            entries: outcome.summary.confirmedCount,
            categories: outcome.summary.totalsByCategory.slice(0, 5).map((c) => ({
              name: c.name,
              amount: formatCents(c.amountCents, outcome.summary!.currency),
            })),
            unreviewed: outcome.summary.unreviewedCount,
            downloadUrl: outcome.zipKey
              ? signedDownloadUrl(outcome.zipKey, {
                  ttlSeconds: 7 * 86_400,
                  filename: `ledgerlens-${period}.zip`,
                })
              : `${env.appUrl}/close`,
            shareHint: true,
          }),
        );
        // A failed send must not consume the one chance to send it.
        if (!sent.sent && sent.reason !== "DRY_RUN" && sent.reason !== "no_api_key") {
          await releaseNotification(org.id, "close_ready", key);
        }
      }
    }
  }
  return "closed";
}

async function sendNudge(org: Organization, period: Period, asOf: string): Promise<boolean> {
  const rung = nudgeRungFor(daysBetween(periodEnd(period), asOf));
  if (rung === null) return false;
  const key = nudgeKey(period, rung);
  if (!(await claimNotification(org.id, "review_nudge", key, { period, rung }))) return false;

  const gate = await closeGate(org.id, period);
  const owner = await ownerEmail(org.id);
  if (!owner || gate.clean) return false;
  const sent = await sendEmail(
    reviewNudgeEmail(owner, {
      monthLabel: `${monthName(period)} ${period.slice(0, 4)}`,
      period,
      blocking: gate.blockingDocuments,
    }),
  );
  if (!sent.sent && sent.reason !== "DRY_RUN" && sent.reason !== "no_api_key") {
    await releaseNotification(org.id, "review_nudge", key);
    return false;
  }
  return true;
}

async function sendDigest(org: Organization, asOf: string): Promise<boolean> {
  const key = weeklyDigestKey(asOf);
  const db = getDb();
  const processed = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(documents)
    .where(
      and(
        eq(documents.organizationId, org.id),
        sql`${documents.receivedAt} >= now() - interval '7 days'`,
      ),
    );
  const processedCount = Number(processed[0]?.n ?? 0);
  const needsReview = await openReviewDocumentCount(org.id);
  // Nothing happened and nothing is waiting: say nothing. An empty digest is the
  // fastest way to teach someone to filter your mail.
  if (processedCount === 0 && needsReview === 0) return false;

  if (!(await claimNotification(org.id, "weekly_digest", key, { asOf }))) return false;
  const owner = await ownerEmail(org.id);
  if (!owner) return false;

  const period = currentPeriod(org, asOf);
  const { loadInbox } = await import("@/lib/inbox");
  const inbox = await loadInbox(org, { period });

  const sent = await sendEmail(
    weeklyDigestEmail(owner, {
      orgName: org.name,
      processed: processedCount,
      needsReview,
      confirmedTotal: formatCents(inbox.totalCents, inbox.currency),
      period,
      monthLabel: `${monthName(period)}`,
      forwardingAddress: forwardingAddress(org.forwardingSlug),
    }),
  );
  if (!sent.sent && sent.reason !== "DRY_RUN" && sent.reason !== "no_api_key") {
    await releaseNotification(org.id, "weekly_digest", key);
    return false;
  }
  return true;
}

async function reportPeriodUsage(org: Organization, period: Period): Promise<boolean> {
  const db = getDb();
  const usage = await usageFor(org.id, period);
  if (usage.reportedToStripeAt) return false;
  if (usage.documentsExtracted === 0) return false;
  const outcome = await reportUsage(org, period, usage.documentsExtracted);
  if (!outcome.reported) return false;
  await db
    .update(usageCounters)
    .set({ reportedToStripeAt: sql`now()`, updatedAt: sql`now()` })
    .where(eq(usageCounters.id, usage.id));
  return true;
}

async function ownerEmail(organizationId: string): Promise<string | null> {
  const [owner] = await getDb()
    .select({ email: users.email })
    .from(users)
    .where(and(eq(users.organizationId, organizationId), eq(users.role, "owner")))
    .limit(1);
  return owner?.email ?? null;
}

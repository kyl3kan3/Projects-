/**
 * src/lib/jobs.ts
 *
 * The job bodies, in one place, with no knowledge of what triggered them.
 *
 * ARCHITECTURE.md's queue table maps one-to-one onto the functions here:
 * `poll-sources`, `score-matches`, `morning-scan`, `deadline-reminders`,
 * `refresh-staleness`, `process-stripe-event`. Two things call them:
 *
 *  - `src/worker/index.ts` — BullMQ workers with repeatable schedules, when
 *    `REDIS_URL` is set and a long-lived process can be run.
 *  - `src/app/api/cron/tick/route.ts` — a cron-triggered route on a bounded
 *    time budget, for a Vercel + Neon deployment with no always-on process.
 *
 * Keeping the logic here rather than in either trigger is what makes the two
 * deployment shapes behave identically, and it is what makes the whole
 * background story testable without Redis.
 */

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { firms, keywordProfiles, sources } from "@/db/schema";
import { dueSources, pollSource, type PollResult } from "@/lib/ingest";
import { rescoreForOpportunities, rescoreProfile } from "@/lib/matching";
import { syncDeadlineDates, sweepDeadlineReminders, type ReminderSweepResult } from "@/lib/deadlines";
import { alertHotMatch, firmsDueForScan, sendScan, type SendScanResult } from "@/lib/scan";
import { refreshStaleness } from "@/lib/library";
import { applySubscriptionState, pendingStripeEvents } from "@/lib/stripe";

export interface PollAndScoreResult {
  polls: PollResult[];
  changedOpportunities: number;
  matchesScored: number;
  hotAlerted: number;
  deadlinesResynced: number;
}

/**
 * `poll-sources` + the `score-matches` fan-out it triggers.
 *
 * Ingestion is shared across every firm — the register is fetched once and
 * matched many times — so the fan-out happens here, immediately after the
 * upserts, rather than per firm on a schedule.
 */
export async function runPollAndScore(
  options: { now?: Date; sourceIds?: string[]; deadlineMs?: number } = {},
): Promise<PollAndScoreResult> {
  const now = options.now ?? new Date();
  const result: PollAndScoreResult = {
    polls: [],
    changedOpportunities: 0,
    matchesScored: 0,
    hotAlerted: 0,
    deadlinesResynced: 0,
  };

  const targets = options.sourceIds
    ? await getDb().select().from(sources)
    : await dueSources(now);
  const list = options.sourceIds
    ? targets.filter((source) => options.sourceIds!.includes(source.id))
    : targets;

  const changedIds = new Set<string>();
  for (const source of list) {
    if (options.deadlineMs && Date.now() > options.deadlineMs) break;
    const poll = await pollSource(source.id, now);
    result.polls.push(poll);
    for (const id of poll.changedIds) changedIds.add(id);
  }

  result.changedOpportunities = changedIds.size;
  if (changedIds.size === 0) return result;

  // A notice whose dates moved has to move the pursuits that copied them, or
  // the calendar quietly disagrees with the portal.
  for (const id of changedIds) {
    const synced = await syncDeadlineDates(id);
    result.deadlinesResynced += synced.updated;
  }

  const summaries = await rescoreForOpportunities([...changedIds], now);
  for (const summary of summaries) {
    result.matchesScored += summary.scored;
    for (const matchId of summary.hot) {
      if (await alertHotMatch(matchId, now)) result.hotAlerted += 1;
    }
  }

  return result;
}

/** `score-matches` on demand: a profile was created or edited. */
export async function runRescoreProfile(profileId: string, now: Date = new Date()) {
  return await rescoreProfile(profileId, { now });
}

/** Rescore every active profile for one firm — used after a settings change. */
export async function runRescoreFirm(firmId: string, now: Date = new Date()): Promise<number> {
  const profiles = await getDb()
    .select()
    .from(keywordProfiles)
    .where(eq(keywordProfiles.firmId, firmId));
  let scored = 0;
  for (const profile of profiles) {
    if (profile.status !== "active") continue;
    const summary = await rescoreProfile(profile.id, { now });
    scored += summary.scored;
  }
  return scored;
}

export interface MorningScanRunResult {
  attempted: number;
  sent: number;
  skipped: number;
  quiet: number;
  errors: string[];
}

/** `morning-scan`: every firm whose local clock has reached its scan hour. */
export async function runMorningScans(
  options: { now?: Date; firmId?: string } = {},
): Promise<MorningScanRunResult> {
  const now = options.now ?? new Date();
  const result: MorningScanRunResult = { attempted: 0, sent: 0, skipped: 0, quiet: 0, errors: [] };

  const targets = options.firmId
    ? await getDb().select().from(firms).where(eq(firms.id, options.firmId))
    : await firmsDueForScan(now);

  for (const firm of targets) {
    result.attempted += 1;
    try {
      const outcome: SendScanResult = await sendScan(firm.id, now);
      if (outcome.skipped) result.skipped += 1;
      else if (outcome.email || outcome.slack) result.sent += 1;
      if (!outcome.skipped && outcome.quiet) result.quiet += 1;
      result.errors.push(...outcome.errors);
    } catch (error) {
      result.errors.push(
        `${firm.name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return result;
}

/** `deadline-reminders`: the T-7/3/1 ladder, exactly once per rung. */
export async function runDeadlineReminders(
  options: { now?: Date; firmId?: string } = {},
): Promise<ReminderSweepResult> {
  return await sweepDeadlineReminders(options.now ?? new Date(), { firmId: options.firmId });
}

/** `refresh-staleness`: recompute the library's stored stale flag. */
export async function runRefreshStaleness(now: Date = new Date()) {
  return await refreshStaleness(now);
}

/** `process-stripe-event`: apply persisted webhook events, idempotently. */
export async function runStripeEvents(limit = 20): Promise<{ processed: number; skipped: number }> {
  const ids = await pendingStripeEvents(limit);
  let processed = 0;
  let skipped = 0;
  for (const id of ids) {
    const outcome = await applySubscriptionState(id);
    if (outcome.applied) processed += 1;
    else skipped += 1;
  }
  return { processed, skipped };
}

export interface TickSummary {
  ok: true;
  tookMs: number;
  poll: PollAndScoreResult;
  scans: MorningScanRunResult;
  reminders: ReminderSweepResult;
  staleness: { marked: number; cleared: number };
  stripe: { processed: number; skipped: number };
  deferred: string[];
}

/**
 * Everything the workers do, in one bounded pass. Each stage checks the clock
 * first: a slow portal must not cost the firm its 6am scan, so anything that
 * doesn't fit is deferred to the next tick and named in the response.
 */
export async function runTick(options: { now?: Date; deadlineMs?: number } = {}): Promise<TickSummary> {
  const startedAt = Date.now();
  const now = options.now ?? new Date();
  const deadlineMs = options.deadlineMs ?? startedAt + 50_000;
  const deferred: string[] = [];

  const poll = await runPollAndScore({ now, deadlineMs });

  let scans: MorningScanRunResult = { attempted: 0, sent: 0, skipped: 0, quiet: 0, errors: [] };
  if (Date.now() < deadlineMs) scans = await runMorningScans({ now });
  else deferred.push("morning-scan");

  let reminders: ReminderSweepResult = { considered: 0, sent: 0, suppressed: 0, failures: [] };
  if (Date.now() < deadlineMs) reminders = await runDeadlineReminders({ now });
  else deferred.push("deadline-reminders");

  let staleness = { marked: 0, cleared: 0 };
  if (Date.now() < deadlineMs) staleness = await runRefreshStaleness(now);
  else deferred.push("refresh-staleness");

  let stripe = { processed: 0, skipped: 0 };
  if (Date.now() < deadlineMs) stripe = await runStripeEvents();
  else deferred.push("process-stripe-event");

  return {
    ok: true,
    tookMs: Date.now() - startedAt,
    poll,
    scans,
    reminders,
    staleness,
    stripe,
    deferred,
  };
}

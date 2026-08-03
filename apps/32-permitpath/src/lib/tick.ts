/**
 * One bounded pass of PermitPath's background work.
 *
 * ARCHITECTURE.md describes a long-lived BullMQ worker, and `npm run worker` still
 * provides exactly that — it just calls this function on an interval. The same
 * pass runs as `/api/cron/tick` on Vercel, where there are no always-on processes
 * to host a queue. Keeping the work in one bounded, resumable function is what
 * lets both shapes exist without a second implementation to keep in sync.
 *
 * Order matters: crawl first (new diffs go to the review queue, never out to
 * customers), then plan expiry ladders, then send what is due. Anything the budget
 * cuts short is picked up by the next pass, in the same order.
 */

import { crawlSource, dueSources } from "@/lib/change-detection";
import { sendDueChangeAlerts, sendDueExpiryAlerts } from "@/lib/alerts";
import { scanAndPlanAlerts } from "@/lib/expiry";
import { env } from "@/lib/env";

export interface TickSummary {
  crawled: number;
  changed: number;
  crawlFailures: number;
  licensesPlanned: number;
  permitsPlanned: number;
  expiryEmails: { attempted: number; delivered: number; logged: number; failed: number };
  changeEmails: { attempted: number; delivered: number; logged: number; failed: number };
  ranOutOfBudget: boolean;
  ms: number;
}

export interface TickOptions {
  /** Epoch ms after which the pass stops starting new work. */
  deadline: number;
  /** Injectable for tests and for the controlled-page crawl proof. */
  fetchImpl?: typeof fetch;
  maxSources?: number;
}

export async function runTick(options: TickOptions): Promise<TickSummary> {
  const started = Date.now();
  const summary: TickSummary = {
    crawled: 0,
    changed: 0,
    crawlFailures: 0,
    licensesPlanned: 0,
    permitsPlanned: 0,
    expiryEmails: { attempted: 0, delivered: 0, logged: 0, failed: 0 },
    changeEmails: { attempted: 0, delivered: 0, logged: 0, failed: 0 },
    ranOutOfBudget: false,
    ms: 0,
  };

  const budgetLeft = () => Date.now() < options.deadline;

  // 1. Crawls. One source at a time: per-host concurrency of 1 is the etiquette
  // we promised, and CRAWL_CONCURRENCY caps how many we take per pass.
  const sources = await dueSources(options.maxSources ?? env.crawlConcurrency * 4);
  for (const source of sources) {
    if (!budgetLeft()) {
      summary.ranOutOfBudget = true;
      break;
    }
    const result = await crawlSource(source, options.fetchImpl);
    summary.crawled += 1;
    if (result.outcome === "changed") summary.changed += 1;
    if (result.outcome === "failed") summary.crawlFailures += 1;
    console.info(
      `[tick] crawl source=${source.id} outcome=${result.outcome} bytes=${result.bytes} ms=${result.ms}`,
    );
  }

  // 2. Expiry ladders for every licence and issued permit.
  if (budgetLeft()) {
    const scan = await scanAndPlanAlerts();
    summary.licensesPlanned = scan.licensesPlanned;
    summary.permitsPlanned = scan.permitsPlanned;
  } else {
    summary.ranOutOfBudget = true;
  }

  // 3. Send what is due.
  if (budgetLeft()) {
    summary.expiryEmails = await sendDueExpiryAlerts();
  } else {
    summary.ranOutOfBudget = true;
  }

  if (budgetLeft()) {
    summary.changeEmails = await sendDueChangeAlerts();
  } else {
    summary.ranOutOfBudget = true;
  }

  summary.ms = Date.now() - started;
  return summary;
}

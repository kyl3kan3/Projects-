/**
 * The daily sweep — this app's only background work.
 *
 * ARCHITECTURE.md specifies BullMQ delayed jobs on a long-lived worker. That is
 * the right design for a fleet, and the wrong one for the deployment target:
 * Vercel has no always-on process and Hobby cron fires once a day. So the sweep
 * is a bounded, idempotent function invoked from a cron route (and, optionally,
 * from a long-lived `npm run worker` loop that calls exactly the same code).
 *
 * Idempotency is what makes that safe. Running the sweep five times in one day
 * sends nothing five times, because:
 *
 *   - each rung is claimed by a unique index before it is sent,
 *   - each promise resolves exactly once, open → kept | broken,
 *   - each rung is pinned to a fixed date, so "still overdue" is not a trigger.
 *
 * The sweep therefore has no scheduling state of its own to lose, and no
 * scheduling logic of its own to get wrong.
 */

import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  clients,
  firms,
  invoices,
  promises,
  sequenceRuns,
  type Firm,
} from "@/db/schema";
import { today, type IsoDate } from "@/lib/dates";
import { decideNextRung } from "@/lib/ladder";
import { OPEN_STATUSES, refreshInvoiceStatuses } from "@/lib/invoices";
import { watchPromises } from "@/lib/promises";
import { activeSequence, commitRung, ensureRun } from "@/lib/sequences";
import { storeForecastSnapshot } from "@/lib/dashboard";
import { connectionsFor, providerFor, syncConnection, writeBackPayments } from "@/lib/accounting";

export interface FirmSweep {
  firmId: string;
  firmName: string;
  statusesReconciled: number;
  promisesBroken: number;
  promisesKept: number;
  laddersAdvanced: number;
  queuedForApproval: number;
  sent: number;
  sendFailures: number;
  synced: number;
  writtenBack: number;
  forecastWeeks: number;
  holds: Record<string, number>;
}

export interface SweepResult {
  asOf: IsoDate;
  firms: FirmSweep[];
  budgetExhausted: boolean;
  ms: number;
}

export interface SweepOptions {
  /** Limit to one firm — used by the dashboard's "run it now" control. */
  firmId?: string;
  asOf?: IsoDate;
  /** Stop and let the next invocation continue rather than being killed. */
  budgetMs?: number;
  /** Skip provider sync (the sweep's only outbound network call). */
  skipSync?: boolean;
}

export async function runSweep(options: SweepOptions = {}): Promise<SweepResult> {
  const db = getDb();
  const startedAt = Date.now();
  const asOf = options.asOf ?? today();
  const budget = options.budgetMs ?? 50_000;
  const result: SweepResult = { asOf, firms: [], budgetExhausted: false, ms: 0 };

  const firmRows = options.firmId
    ? await db.select().from(firms).where(eq(firms.id, options.firmId))
    : await db.select().from(firms);

  for (const firm of firmRows) {
    if (Date.now() - startedAt > budget) {
      result.budgetExhausted = true;
      break;
    }
    result.firms.push(await sweepFirm(firm, asOf, options));
  }

  result.ms = Date.now() - startedAt;
  return result;
}

async function sweepFirm(firm: Firm, asOf: IsoDate, options: SweepOptions): Promise<FirmSweep> {
  const db = getDb();
  const summary: FirmSweep = {
    firmId: firm.id,
    firmName: firm.name,
    statusesReconciled: 0,
    promisesBroken: 0,
    promisesKept: 0,
    laddersAdvanced: 0,
    queuedForApproval: 0,
    sent: 0,
    sendFailures: 0,
    synced: 0,
    writtenBack: 0,
    forecastWeeks: 0,
    holds: {},
  };

  // 1. Pull anything new from the firm's accounting system. Money that arrived
  //    by bank transfer is the most important fact of the day, because it decides
  //    who must NOT be chased.
  if (!options.skipSync) {
    for (const connection of await connectionsFor(firm.id)) {
      // A demo connection is not re-polled: its book is generated relative to
      // today, so re-importing would quietly move every due date.
      if (!providerFor(connection.provider).live) continue;
      const syncSummary = await syncConnection(firm, connection);
      if (!syncSummary.error) summary.synced += syncSummary.invoicesUpserted;
    }
  }

  // 2. Reconcile the cached status column.
  summary.statusesReconciled = await refreshInvoiceStatuses(firm.id);

  // 3. Resolve promises whose date has passed: kept if the money came, broken if
  //    not — and a broken one earns the ladder one immediate step up.
  const promiseSummary = await watchPromises(firm.id, asOf);
  summary.promisesBroken = promiseSummary.broken;
  summary.promisesKept = promiseSummary.kept;

  // 4. Advance the ladder. At most one rung per invoice per sweep, ever.
  const sequence = await activeSequence(firm.id);
  const rows = await db
    .select({ invoice: invoices, client: clients, run: sequenceRuns })
    .from(invoices)
    .innerJoin(clients, eq(clients.id, invoices.clientId))
    .leftJoin(sequenceRuns, eq(sequenceRuns.invoiceId, invoices.id))
    .where(and(eq(invoices.firmId, firm.id), inArray(invoices.status, OPEN_STATUSES)));

  const openPromises = await db
    .select({ invoiceId: promises.invoiceId, promisedFor: promises.promisedFor })
    .from(promises)
    .where(and(eq(promises.firmId, firm.id), eq(promises.status, "open")));
  const promisedFor = new Map(openPromises.map((p) => [p.invoiceId, p.promisedFor]));

  for (const { invoice, client, run: existingRun } of rows) {
    const run = existingRun ?? (await ensureRun(firm.id, invoice, sequence));
    const hasOpenPromise = promisedFor.has(invoice.id);

    const decision = decideNextRung({
      ladder: sequence.steps,
      invoice: {
        dueAt: invoice.dueAt,
        balanceCents: invoice.balanceCents,
        status: invoice.status,
      },
      run: {
        highestStepSent: run.highestStepSent,
        pausedByReply: run.state === "paused_reply",
        hasOpenPromise,
        escalateAfterBrokenPromise: run.escalateAfterBrokenPromise,
        stopped: run.state === "stopped",
      },
      clientVip: client.vip,
      firmPaused: firm.followUpPaused,
      asOf,
    });

    if (decision.action === "hold") {
      summary.holds[decision.reason] = (summary.holds[decision.reason] ?? 0) + 1;
      continue;
    }

    const outcome = await commitRung({
      subject: { firm, invoice, client, sequence, run, hasOpenPromise },
      stepIndex: decision.stepIndex,
      step: decision.step,
      promiseAware: decision.promiseAware,
      asOf,
      promisedFor: promisedFor.get(invoice.id) ?? null,
    });

    if (outcome.outcome === "queued") {
      summary.laddersAdvanced += 1;
      summary.queuedForApproval += 1;
    } else if (outcome.outcome === "sent") {
      summary.laddersAdvanced += 1;
      if (outcome.delivered) summary.sent += 1;
      else summary.sendFailures += 1;
    } else if (outcome.outcome === "no_recipient") {
      summary.holds.no_recipient = (summary.holds.no_recipient ?? 0) + 1;
    } else {
      summary.holds.already_claimed = (summary.holds.already_claimed ?? 0) + 1;
    }
  }

  // 5. Push portal payments back to the accounting system, then rebuild the
  //    forecast from whatever the day changed.
  const writeBack = await writeBackPayments(firm);
  summary.writtenBack = writeBack.written;
  summary.forecastWeeks = await storeForecastSnapshot(firm);

  return summary;
}

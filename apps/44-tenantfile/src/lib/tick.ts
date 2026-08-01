/**
 * The time-based engine, in one function.
 *
 * Everything date-driven happens here, in this order, and the order matters:
 *
 *   1. **Generate charges** for every active tenancy up to the horizon (this month
 *      plus one). Idempotent — the unique index does the deciding.
 *   2. **Assess late fees**, after generation, so a fee is never assessed against a
 *      charge that does not exist yet.
 *   3. **Send reminders** whose moment has come, each re-checked against the live
 *      ledger — so a fee assessed one step earlier is already in the message.
 *   4. **Expire stale screening records**, which is bookkeeping, not judgement.
 *
 * `runTick` is called by `/api/cron/tick` (bounded, CRON_SECRET-protected) and by
 * `npm run worker` on an interval. Neither owns any logic. The deadline is real:
 * work not done this tick is picked up by the next one, because every step is
 * driven by database state rather than by a queue position.
 */

import { and, eq, lte, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { screeningReports } from "@/db/schema";
import { activeTenancies, applyLateFees, ensureCharges, settleAndCancelReminders } from "@/lib/ledger";
import { sendDueReminders, type SendOutcome } from "@/lib/reminders";
import { generationHorizon } from "@/lib/schedule";
import { isoDateOf } from "@/lib/money";

export interface TickResult {
  ok: true;
  asOf: string;
  tenanciesSeen: number;
  chargesCreated: number;
  lateFeesCharged: number;
  reminders: SendOutcome;
  screeningExpired: number;
  tookMs: number;
  deferred: boolean;
}

export async function runTick(
  now: Date = new Date(),
  opts: { deadline?: number } = {},
): Promise<TickResult> {
  const startedAt = Date.now();
  const asOf = isoDateOf(now);
  const horizon = generationHorizon(asOf);
  const deadline = opts.deadline;
  let deferred = false;

  const tenancies = await activeTenancies();
  let chargesCreated = 0;
  let lateFeesCharged = 0;

  for (const tenancy of tenancies) {
    if (deadline && Date.now() > deadline) {
      deferred = true;
      break;
    }
    try {
      const generated = await ensureCharges(tenancy, horizon);
      chargesCreated += generated.created.length;

      const fees = await applyLateFees(tenancy, asOf);
      lateFeesCharged += fees.charged.length;

      // Cheap, and it repairs any status drift left by a failed write elsewhere.
      await settleAndCancelReminders(tenancy.id);
    } catch (err) {
      // One broken tenancy must not stop the rest of the portfolio's rent cycle.
      console.error("[tick] tenancy failed", { tenancyId: tenancy.id, err });
    }
  }

  const reminders = await sendDueReminders(now, { deadline });
  const screeningExpired = await expireStaleScreening(asOf);

  return {
    ok: true,
    asOf,
    tenanciesSeen: tenancies.length,
    chargesCreated,
    lateFeesCharged,
    reminders,
    screeningExpired,
    tookMs: Date.now() - startedAt,
    deferred,
  };
}

/**
 * Screening reports go stale; providers treat them as good for about 30 days. This
 * marks the record expired so the application screen stops implying a current
 * report exists. It is a statement about a date, not about a person.
 */
async function expireStaleScreening(asOf: string): Promise<number> {
  const rows = await getDb()
    .update(screeningReports)
    .set({ status: "expired" })
    .where(
      and(
        eq(screeningReports.status, "received"),
        ne(screeningReports.status, "expired"),
        lte(screeningReports.expiresOn, asOf),
        sql`${screeningReports.expiresOn} is not null`,
      ),
    )
    .returning();
  return rows.length;
}

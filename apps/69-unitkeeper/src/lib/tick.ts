/**
 * The time-based engine, in one function.
 *
 * Everything date-driven happens here, in this order, and the order matters:
 *
 *   1. **Generate rent charges** for every live tenancy up to today. A fee can
 *      never be assessed against a charge that does not exist yet.
 *   2. **Run autopay** for the current period, then reverse the ladder for anyone
 *      who is now square — so a tenant whose card cleared this morning is not
 *      overlocked this afternoon.
 *   3. **Fire the late ladder**, reading the ledger the two steps above just
 *      wrote.
 *   4. **Advance lien cases** — recompute due dates and flag the current step.
 *      Nothing is executed; the owner acts.
 *   5. **Apply rate changes** whose effective date has arrived.
 *
 * `runTick` is called by `/api/cron/tick` (bounded, CRON_SECRET-protected) and by
 * `npm run worker` on a repeatable job. Neither owns any logic. The deadline is
 * real: work not done this tick is picked up by the next one, because every step is
 * driven by database state rather than by a queue position.
 */

import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { getDb } from "@/db";
import {
  facilities,
  lienCases,
  lienRules,
  owners,
  tenancies,
  units,
} from "@/db/schema";
import { collectAutopay, ensureRentCharges } from "@/lib/autopay";
import { delinquentRows, reverseLadderIfPaid, runLadderFor } from "@/lib/ladder-run";
import { buildTimeline, caseStatus, type StepsState } from "@/lib/lien-engine";
import type { RuleStep } from "@/lib/lien-rules";
import { isoDateOf, periodOf } from "@/lib/money";
import { applyDueRateChanges } from "@/lib/rates";
import { readSettings } from "@/lib/settings";

export interface TickResult {
  ok: true;
  asOf: string;
  tenanciesSeen: number;
  chargesCreated: number;
  autopayAttempted: number;
  autopayCollected: number;
  laddersFired: number;
  rungsFired: number;
  laddersReversed: number;
  lienCasesAdvanced: number;
  rateChangesApplied: number;
  tookMs: number;
  deferred: boolean;
}

export async function runTick(
  now: Date = new Date(),
  opts: { deadline?: number } = {},
): Promise<TickResult> {
  const startedAt = Date.now();
  const asOf = isoDateOf(now);
  const period = periodOf(asOf);
  const deadline = opts.deadline;
  const db = getDb();
  let deferred = false;

  const result: TickResult = {
    ok: true,
    asOf,
    tenanciesSeen: 0,
    chargesCreated: 0,
    autopayAttempted: 0,
    autopayCollected: 0,
    laddersFired: 0,
    rungsFired: 0,
    laddersReversed: 0,
    lienCasesAdvanced: 0,
    rateChangesApplied: 0,
    tookMs: 0,
    deferred: false,
  };

  /* 1 + 2 — charges, then collection, then reversal. */
  const live = await db
    .select({ owner: owners, facility: facilities, unit: units, tenancy: tenancies })
    .from(tenancies)
    .innerJoin(units, eq(tenancies.unitId, units.id))
    .innerJoin(facilities, eq(units.facilityId, facilities.id))
    .innerJoin(owners, eq(facilities.ownerId, owners.id))
    .where(and(isNull(tenancies.endedOn), ne(tenancies.status, "ended")));

  result.tenanciesSeen = live.length;

  for (const row of live) {
    if (deadline && Date.now() > deadline) {
      deferred = true;
      break;
    }
    try {
      const settings = readSettings(row.owner.settings);
      const charges = await ensureRentCharges(row.tenancy, settings, asOf);
      result.chargesCreated += charges.created.length;

      // Re-read: ensureRentCharges moved paidThrough and the row in hand is stale.
      const [fresh] = await db.select().from(tenancies).where(eq(tenancies.id, row.tenancy.id));
      if (!fresh) continue;

      if (fresh.signedAt && fresh.gateCode) {
        const collected = await collectAutopay(
          fresh,
          row.owner.stripeAccountId,
          null,
          period,
          `${row.facility.name} unit ${row.unit.label}`,
          asOf,
        );
        if (collected.attempted) {
          result.autopayAttempted += 1;
          if (collected.outcome?.ok) result.autopayCollected += 1;
        }
      }

      const reversal = await reverseLadderIfPaid(row.tenancy.id, asOf);
      if (reversal.reversedRungs > 0 || reversal.overlockLifted) result.laddersReversed += 1;
    } catch (err) {
      // One broken tenancy must not stop the rest of the yard's rent cycle.
      console.error("[tick] tenancy failed", { tenancyId: row.tenancy.id, err });
    }
  }

  /* 3 — the ladder, per owner, over the ledger the steps above just wrote. */
  const ownerRows = await db.select({ id: owners.id }).from(owners);
  for (const owner of ownerRows) {
    if (deadline && Date.now() > deadline) {
      deferred = true;
      break;
    }
    try {
      const rows = await delinquentRows(owner.id, asOf);
      for (const row of rows) {
        const fired = await runLadderFor(row, asOf);
        if (fired.length > 0) {
          result.laddersFired += 1;
          result.rungsFired += fired.length;
        }
      }
    } catch (err) {
      console.error("[tick] ladder failed", { ownerId: owner.id, err });
    }
  }

  /* 4 — lien cases: recompute, flag, execute nothing. */
  try {
    result.lienCasesAdvanced = await advanceLienCases(asOf);
  } catch (err) {
    console.error("[tick] lien advance failed", err);
  }

  /* 5 — rate changes whose day has come. */
  try {
    result.rateChangesApplied = await applyDueRateChanges(asOf);
  } catch (err) {
    console.error("[tick] rate changes failed", err);
  }

  result.tookMs = Date.now() - startedAt;
  result.deferred = deferred;
  return result;
}

/**
 * Recompute every live case's rail and write back the derived fields the board
 * reads: which step is current, how long the hard stop runs, and whether the sale
 * date has arrived. It completes nothing and mails nothing — `sale_eligible` is a
 * statement about the calendar, not an instruction.
 */
export async function advanceLienCases(asOf: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ lienCase: lienCases, rule: lienRules })
    .from(lienCases)
    .innerJoin(lienRules, eq(lienCases.ruleVersionId, lienRules.id))
    .where(inArray(lienCases.status, ["open", "paused", "sale_eligible"]));

  let advanced = 0;
  for (const row of rows) {
    const timeline = buildTimeline(
      { steps: (row.rule.steps ?? []) as RuleStep[] },
      row.lienCase.delinquentSince,
      (row.lienCase.stepsState ?? {}) as StepsState,
      asOf,
    );
    const status = caseStatus(timeline, asOf);
    const nextStatus = status === "resolved" ? "closed" : status;
    const changed =
      row.lienCase.currentStepKey !== timeline.currentStepKey ||
      row.lienCase.hardStopUntil !== timeline.hardStopUntil ||
      row.lienCase.status !== nextStatus;
    if (!changed) continue;
    await db
      .update(lienCases)
      .set({
        currentStepKey: timeline.currentStepKey,
        hardStopUntil: timeline.hardStopUntil,
        status: nextStatus,
        updatedAt: new Date(),
      })
      .where(eq(lienCases.id, row.lienCase.id));
    advanced += 1;
  }
  return advanced;
}

/**
 * Rent generation and autopay collection.
 *
 * Two jobs, in this order, and the order matters: a charge must exist before
 * anything tries to collect it, and a late fee must never be assessed against a
 * charge that has not been created yet.
 *
 * **Exactly-once is built from two matching keys.** The monthly rent row and the
 * autopay payment row both carry `period`, so the unique index on
 * (tenancy, kind, period) means neither can be written twice. The Stripe
 * idempotency key is derived from the same (tenancy, period) pair. That pairing is
 * deliberate: if the process dies between a successful charge and the ledger
 * write, the next tick charges again, Stripe returns *the same PaymentIntent*, and
 * the ledger ends up with one row for one charge. Any other combination either
 * double-charges or loses the record of a charge that happened.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { ledgerEntries, tenancies, type OwnerSettings, type Tenancy } from "@/db/schema";
import { balance, post } from "@/lib/ledger";
import {
  addMonthsToPeriod,
  comparePeriods,
  dueDateFor,
  periodOf,
  prorateFirstMonth,
  type IsoDate,
  type Period,
} from "@/lib/money";
import { autopayIdempotencyKey, rentPayments, type ChargeOutcome } from "@/lib/payments";

/** Never generate more than a year forward, whatever the clock says. */
const MAX_PERIODS_PER_RUN = 14;

export interface ChargeRun {
  created: Array<{ period: Period; amountCents: number; occurredOn: IsoDate }>;
}

/**
 * Post the monthly rent for every period that has come due and is not on the
 * ledger yet. The first period is prorated by the owner's rule; every later one is
 * the full agreed rate.
 */
export async function ensureRentCharges(
  tenancy: Tenancy,
  settings: OwnerSettings,
  asOf: IsoDate,
): Promise<ChargeRun> {
  const created: ChargeRun["created"] = [];
  if (tenancy.endedOn) return { created };

  const firstPeriod = periodOf(tenancy.startedOn);
  let period = tenancy.paidThrough
    ? addMonthsToPeriod(tenancy.paidThrough, 1)
    : firstPeriod;

  for (let i = 0; i < MAX_PERIODS_PER_RUN; i += 1) {
    const dueOn = dueDateFor(period, settings.rentDueDay);
    // The first period is billed on the move-in day, not on the due day: a
    // tenant moving in on the 20th pays that day, not on the 1st of next month.
    const chargeOn = period === firstPeriod ? tenancy.startedOn : dueOn;
    if (chargeOn > asOf) break;

    const amountCents =
      period === firstPeriod
        ? prorateFirstMonth(tenancy.rateCents, tenancy.startedOn, settings.prorateRule)
        : tenancy.rateCents;

    if (amountCents > 0) {
      const result = await post({
        tenancyId: tenancy.id,
        kind: "rent",
        amountCents,
        description:
          period === firstPeriod && settings.prorateRule === "daily"
            ? `Rent ${period} (prorated from ${tenancy.startedOn})`
            : `Rent ${period}`,
        occurredOn: chargeOn,
        period,
      });
      if (!result.duplicate) created.push({ period, amountCents, occurredOn: chargeOn });
    }

    await getDb()
      .update(tenancies)
      .set({ paidThrough: period, updatedAt: new Date() })
      .where(eq(tenancies.id, tenancy.id));

    period = addMonthsToPeriod(period, 1);
    if (comparePeriods(period, addMonthsToPeriod(periodOf(asOf), 1)) > 0) break;
  }

  return { created };
}

export interface CollectResult {
  attempted: boolean;
  outcome: ChargeOutcome | null;
  amountCents: number;
  /** Already collected for this period — nothing to do. */
  alreadyPaid: boolean;
}

/**
 * Run autopay for one tenancy and one period. Collects the whole outstanding
 * balance, not just the month's rent: a tenant with an unpaid late fee should not
 * have to make two payments.
 */
export async function collectAutopay(
  tenancy: Tenancy,
  stripeAccountId: string | null,
  customerId: string | null,
  period: Period,
  facilityLabel: string,
  asOf: IsoDate,
): Promise<CollectResult> {
  if (!tenancy.autopay || tenancy.endedOn) {
    return { attempted: false, outcome: null, amountCents: 0, alreadyPaid: false };
  }

  const existing = await getDb()
    .select({ id: ledgerEntries.id })
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.tenancyId, tenancy.id),
        eq(ledgerEntries.kind, "payment"),
        eq(ledgerEntries.period, period),
      ),
    );
  if (existing.length > 0) {
    return { attempted: false, outcome: null, amountCents: 0, alreadyPaid: true };
  }

  const outstanding = await balance(tenancy.id);
  if (outstanding <= 0) {
    return { attempted: false, outcome: null, amountCents: 0, alreadyPaid: true };
  }

  const outcome = await rentPayments().charge({
    stripeAccountId,
    customerId,
    paymentMethodId: tenancy.stripePaymentMethodId,
    amountCents: outstanding,
    description: `${facilityLabel} — rent ${period}`,
    idempotencyKey: autopayIdempotencyKey(tenancy.id, period),
  });

  if (outcome.ok) {
    await post({
      tenancyId: tenancy.id,
      kind: "payment",
      amountCents: -outstanding,
      description: `Autopay ${period}${outcome.simulated ? " (simulated)" : ""}`,
      occurredOn: asOf,
      period,
      stripePaymentIntentId: outcome.paymentIntentId,
    });
  }

  return { attempted: true, outcome, amountCents: outstanding, alreadyPaid: false };
}

/**
 * Autopay: enrollment, and the due-date charge run.
 *
 * The charge run is the most dangerous code in the product, so its safety is
 * structural rather than careful:
 *
 *  1. For each invoice, the next attempt number is derived from the attempts
 *     already recorded, and the `autopay_attempts` row is inserted **before**
 *     Stripe is called, with `onConflictDoNothing` on a unique idempotency key.
 *     If the insert returns nothing, another run (or another region, or the same
 *     cron firing twice) owns this attempt and we skip it.
 *  2. The same key is handed to Stripe as its idempotency key, so a crash
 *     between the insert and the response cannot produce a second charge either.
 *  3. Failure degrades, never disappears: attempt 1 schedules a single retry at
 *     +3 days; attempt 2 marks the enrollment failed, notifies the treasurer,
 *     and hands the invoice back to the ordinary reminder ladder.
 */

import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  associations,
  autopayAttempts,
  autopayEnrollments,
  households,
  invoices,
  members,
  users,
  type Association,
  type AutopayEnrollment,
  type Invoice,
} from "@/db/schema";
import { audit, SYSTEM, type Actor } from "@/lib/audit";
import { addDays, today, type IsoDate } from "@/lib/dates";
import {
  applyStripePayment,
  loadInvoice,
  markStripePaymentFailed,
} from "@/lib/invoicing";
import { formatMoney } from "@/lib/money";
import { sendEmail } from "@/lib/notify";
import { chargeAutopay } from "@/lib/stripe";

/** Attempts allowed per invoice: the original plus one retry. */
export const MAX_ATTEMPTS = 2;
export const RETRY_AFTER_DAYS = 3;

/* -------------------------------------------------------------- enrollment --- */

export interface EnrollInput {
  householdId: string;
  stripeCustomerId: string;
  stripePaymentMethodId: string;
  method: "card" | "ach";
  memberId: string | null;
}

/**
 * Record an enrollment after a SetupIntent succeeded. One row per household;
 * re-enrolling replaces the stored method and clears the failure counter.
 */
export async function enroll(input: EnrollInput, actor: Actor): Promise<void> {
  const db = getDb();
  const [household] = await db
    .select()
    .from(households)
    .where(eq(households.id, input.householdId));
  if (!household) throw new Error("No such household");

  await db
    .insert(autopayEnrollments)
    .values({
      householdId: input.householdId,
      stripeCustomerId: input.stripeCustomerId,
      stripePaymentMethodId: input.stripePaymentMethodId,
      method: input.method,
      status: "active",
      enrolledByMemberId: input.memberId,
      consecutiveFailures: 0,
      lastError: null,
    })
    .onConflictDoUpdate({
      target: autopayEnrollments.householdId,
      set: {
        stripeCustomerId: input.stripeCustomerId,
        stripePaymentMethodId: input.stripePaymentMethodId,
        method: input.method,
        status: "active",
        enrolledAt: new Date(),
        enrolledByMemberId: input.memberId,
        consecutiveFailures: 0,
        lastError: null,
      },
    });

  await audit(household.associationId, actor, "enrolled_autopay", `unit ${household.unitLabel}`, {
    householdId: input.householdId,
    method: input.method,
  });
}

export async function setEnrollmentStatus(
  householdId: string,
  status: "active" | "paused",
  actor: Actor,
): Promise<void> {
  const db = getDb();
  const [household] = await db.select().from(households).where(eq(households.id, householdId));
  if (!household) throw new Error("No such household");
  await db
    .update(autopayEnrollments)
    .set({ status, lastError: null, consecutiveFailures: 0 })
    .where(eq(autopayEnrollments.householdId, householdId));
  await audit(
    household.associationId,
    actor,
    status === "paused" ? "paused_autopay" : "resumed_autopay",
    `unit ${household.unitLabel}`,
    { householdId },
  );
}

export async function cancelEnrollment(householdId: string, actor: Actor): Promise<void> {
  const db = getDb();
  const [household] = await db.select().from(households).where(eq(households.id, householdId));
  if (!household) throw new Error("No such household");
  await db.delete(autopayEnrollments).where(eq(autopayEnrollments.householdId, householdId));
  await audit(household.associationId, actor, "cancelled_autopay", `unit ${household.unitLabel}`, {
    householdId,
  });
}

export async function enrollmentFor(householdId: string): Promise<AutopayEnrollment | null> {
  const [row] = await getDb()
    .select()
    .from(autopayEnrollments)
    .where(eq(autopayEnrollments.householdId, householdId));
  return row ?? null;
}

export interface EnrollmentStats {
  households: number;
  enrolled: number;
  ach: number;
  failed: number;
  percent: number;
}

/** The wedge metric: enrolled share of active households. */
export async function enrollmentStats(associationId: string): Promise<EnrollmentStats> {
  const db = getDb();
  const rows = await db
    .select({ status: autopayEnrollments.status, method: autopayEnrollments.method })
    .from(autopayEnrollments)
    .innerJoin(households, eq(autopayEnrollments.householdId, households.id))
    .where(and(eq(households.associationId, associationId), isNull(households.leftOn)));
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(households)
    .where(and(eq(households.associationId, associationId), isNull(households.leftOn)));

  const enrolled = rows.filter((r) => r.status === "active").length;
  return {
    households: count,
    enrolled,
    ach: rows.filter((r) => r.status === "active" && r.method === "ach").length,
    failed: rows.filter((r) => r.status === "failed").length,
    percent: count === 0 ? 0 : Math.round((enrolled / count) * 100),
  };
}

/* -------------------------------------------------------------- charge run --- */

export interface ChargeRunSummary {
  considered: number;
  charged: number;
  processing: number;
  failed: number;
  skipped: number;
  amountCents: number;
}

interface Candidate {
  invoice: Invoice;
  enrollment: AutopayEnrollment;
  association: Association;
}

/**
 * Invoices that are due (or overdue), still owed, and belong to a household with
 * an active enrollment — minus anything already at its attempt ceiling or inside
 * its retry cooldown.
 */
async function candidates(asOf: IsoDate, associationId?: string): Promise<Candidate[]> {
  const db = getDb();
  const rows = await db
    .select({ invoice: invoices, enrollment: autopayEnrollments, association: associations })
    .from(invoices)
    .innerJoin(autopayEnrollments, eq(autopayEnrollments.householdId, invoices.householdId))
    .innerJoin(associations, eq(associations.id, invoices.associationId))
    .where(
      and(
        eq(autopayEnrollments.status, "active"),
        inArray(invoices.status, ["sent", "partial", "overdue"]),
        sql`${invoices.dueOn} <= ${asOf}`,
        associationId ? eq(invoices.associationId, associationId) : sql`true`,
      ),
    )
    .limit(1000);
  return rows;
}

export async function chargeRun(
  asOf: IsoDate = today(),
  associationId?: string,
): Promise<ChargeRunSummary> {
  const db = getDb();
  const summary: ChargeRunSummary = {
    considered: 0,
    charged: 0,
    processing: 0,
    failed: 0,
    skipped: 0,
    amountCents: 0,
  };

  for (const { invoice, enrollment, association } of await candidates(asOf, associationId)) {
    summary.considered += 1;

    const prior = await db
      .select()
      .from(autopayAttempts)
      .where(eq(autopayAttempts.invoiceId, invoice.id));

    // A succeeded or in-flight attempt means this invoice is handled.
    if (prior.some((a) => a.status === "succeeded" || a.status === "pending")) {
      summary.skipped += 1;
      continue;
    }
    if (prior.length >= MAX_ATTEMPTS) {
      summary.skipped += 1;
      continue;
    }
    // The single retry waits out its cooldown.
    const lastFailure = prior.filter((a) => a.status === "failed").at(-1);
    if (lastFailure?.retryAfter && lastFailure.retryAfter > asOf) {
      summary.skipped += 1;
      continue;
    }

    const ledger = await loadInvoice(invoice.id);
    if (!ledger || ledger.dueNowCents <= 0) {
      summary.skipped += 1;
      continue;
    }

    const attemptNo = prior.length + 1;
    const idempotencyKey = `invoice:${invoice.id}:${attemptNo}`;

    // The gate. If this insert does not return a row, someone else owns this
    // attempt — a second cron fire, a retried invocation, a parallel region.
    const [attempt] = await db
      .insert(autopayAttempts)
      .values({
        invoiceId: invoice.id,
        enrollmentId: enrollment.id,
        attemptNo,
        idempotencyKey,
        status: "pending",
        amountCents: ledger.dueNowCents,
      })
      .onConflictDoNothing()
      .returning();

    if (!attempt) {
      summary.skipped += 1;
      continue;
    }

    const outcome = await chargeAutopay(
      association,
      enrollment,
      invoice,
      ledger.dueNowCents,
      idempotencyKey,
    );

    if (outcome.status === "failed" || !outcome.paymentIntentId) {
      await db
        .update(autopayAttempts)
        .set({
          status: "failed",
          error: outcome.error,
          stripePaymentIntentId: outcome.paymentIntentId,
          retryAfter: attemptNo < MAX_ATTEMPTS ? addDays(asOf, RETRY_AFTER_DAYS) : null,
        })
        .where(eq(autopayAttempts.id, attempt.id));

      const failures = enrollment.consecutiveFailures + 1;
      const exhausted = attemptNo >= MAX_ATTEMPTS;
      await db
        .update(autopayEnrollments)
        .set({
          consecutiveFailures: failures,
          lastError: outcome.error,
          // Only give up after the retry. A single declined card is not a
          // reason to make a household start over.
          status: exhausted ? "failed" : "active",
        })
        .where(eq(autopayEnrollments.id, enrollment.id));

      await audit(invoice.associationId, SYSTEM, "autopay_failed", `invoice ${invoice.periodLabel}`, {
        invoiceId: invoice.id,
        attemptNo,
        amountCents: ledger.dueNowCents,
        error: outcome.error,
        exhausted,
      });

      if (exhausted) await notifyTreasurerOfFailure(invoice, enrollment, outcome.error);
      // The invoice is now just an ordinary unpaid invoice: the reminder ladder
      // picks it up on its next sweep. No silent gap.
      summary.failed += 1;
      continue;
    }

    await db
      .update(autopayAttempts)
      .set({
        status: outcome.status === "succeeded" ? "succeeded" : "pending",
        stripePaymentIntentId: outcome.paymentIntentId,
      })
      .where(eq(autopayAttempts.id, attempt.id));

    await applyStripePayment({
      paymentIntentId: outcome.paymentIntentId,
      invoiceId: invoice.id,
      amountCents: ledger.dueNowCents,
      method: outcome.method,
      // ACH is not money yet. The webhook flips it when it clears.
      status: outcome.status === "succeeded" ? "settled" : "pending",
      receivedOn: asOf,
    });

    await db
      .update(autopayEnrollments)
      .set({ lastChargeAt: new Date(), consecutiveFailures: 0, lastError: null })
      .where(eq(autopayEnrollments.id, enrollment.id));

    await audit(
      invoice.associationId,
      SYSTEM,
      outcome.status === "succeeded" ? "autopay_charged" : "autopay_processing",
      `invoice ${invoice.periodLabel}`,
      {
        invoiceId: invoice.id,
        attemptNo,
        amountCents: ledger.dueNowCents,
        method: outcome.method,
        simulated: outcome.simulated,
      },
    );

    if (outcome.status === "succeeded") summary.charged += 1;
    else summary.processing += 1;
    summary.amountCents += ledger.dueNowCents;
  }

  return summary;
}

/**
 * An exhausted enrollment is the treasurer's problem now, and they must be told.
 * A failed autopay that nobody hears about is the "silent gap" the roadmap
 * forbids.
 */
async function notifyTreasurerOfFailure(
  invoice: Invoice,
  enrollment: AutopayEnrollment,
  error: string | null,
): Promise<void> {
  const db = getDb();
  const [household] = await db.select().from(households).where(eq(households.id, invoice.householdId));
  const board = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.associationId, invoice.associationId),
        or(eq(users.role, "treasurer"), eq(users.role, "president")),
      ),
    );
  const [primary] = await db
    .select()
    .from(members)
    .where(eq(members.householdId, invoice.householdId));
  const ledger = await loadInvoice(invoice.id);
  const unit = household?.unitLabel ?? "unknown unit";

  for (const officer of board) {
    await sendEmail(
      {
        associationId: invoice.associationId,
        memberId: null,
        purpose: "autopay_failure",
        invoiceId: invoice.id,
      },
      {
        to: officer.email,
        subject: `Autopay failed for unit ${unit} — ${invoice.periodLabel}`,
        text:
          `Autopay for unit ${unit} (${primary?.name ?? "no primary contact on file"}) failed twice ` +
          `for ${invoice.periodLabel} dues of ${formatMoney(ledger?.balanceCents ?? 0)}, paid by ` +
          `${enrollment.method === "ach" ? "bank account" : "card"}.\n\n` +
          `Stripe said: ${error ?? "no reason given"}.\n\n` +
          `The invoice is now an ordinary unpaid invoice and will follow your reminder ladder. ` +
          `The household's enrollment is marked failed; they can re-enroll from their portal link.\n\n` +
          `Nothing was charged twice — DuesDesk records one attempt per invoice per try, and hands ` +
          `Stripe the same idempotency key.`,
      },
    );
  }
}

/** Invoices whose autopay is scheduled to retry, for the dashboard. */
export async function pendingRetries(associationId: string) {
  const db = getDb();
  return db
    .select({ invoice: invoices, attempt: autopayAttempts, household: households })
    .from(autopayAttempts)
    .innerJoin(invoices, eq(autopayAttempts.invoiceId, invoices.id))
    .innerJoin(households, eq(invoices.householdId, households.id))
    .where(
      and(
        eq(invoices.associationId, associationId),
        eq(autopayAttempts.status, "failed"),
        sql`${autopayAttempts.retryAfter} is not null`,
      ),
    );
}

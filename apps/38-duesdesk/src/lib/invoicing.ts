/**
 * The dues engine: assessment schedules → invoice runs → settlement.
 *
 * Every number that moves through here is somebody's neighbour's money, so the
 * three invariants are enforced structurally rather than by care:
 *
 *  - **Idempotent generation.** `invoices` is unique on
 *    (household, schedule, period_label), and generation inserts with
 *    `onConflictDoNothing`. Running the same invoice run twice — because a cron
 *    double-fired or a treasurer double-tapped — creates nothing the second time.
 *  - **Idempotent settlement.** `payments.stripe_payment_intent_id` is unique.
 *    A retried `payment_intent.succeeded` webhook cannot credit the same money
 *    twice, no matter how many times Stripe delivers it.
 *  - **Derived status.** No code path writes "paid" because it thinks it should
 *    be paid. Status is recomputed from lines and payments by
 *    `ledger.deriveStatus` and written by `refreshInvoice` alone.
 */

import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  assessmentSchedules,
  households,
  invoiceLines,
  invoices,
  members,
  payments,
  type AssessmentSchedule,
  type Household,
  type Invoice,
  type InvoiceLine,
  type LateFeePolicy,
  type Payment,
  type PaymentMethod,
} from "@/db/schema";
import { audit, SYSTEM, type Actor } from "@/lib/audit";
import { compareIso, formatIso, today, type IsoDate } from "@/lib/dates";
import {
  assessForHousehold,
  DEFAULT_LATE_FEE,
  isPastGrace,
  periodAt,
  periodsToGenerate,
  type BillingPeriod,
  type ScheduleShape,
} from "@/lib/dues";
import {
  allocate,
  amountDueNow,
  cascade,
  balanceCents,
  deriveStatus,
  invoiceTotal,
  isPartlyPaid,
  lateFeeCents,
  netLateFee,
  pendingCents,
  settledCents,
  type LedgerLine,
  type LedgerPayment,
} from "@/lib/ledger";
import type { InvoiceStatus } from "@/db/schema";
import { formatMoney } from "@/lib/money";

/* ------------------------------------------------------------ read models --- */

export interface InvoiceLedger {
  invoice: Invoice;
  lines: InvoiceLine[];
  payments: Payment[];
  totalCents: number;
  settledCents: number;
  pendingCents: number;
  balanceCents: number;
  dueNowCents: number;
  lateFeeCents: number;
  partlyPaid: boolean;
  /**
   * The status **as of now**, derived from lines and payments — not the stored
   * column.
   *
   * These differ whenever an invoice has quietly crossed its grace date since the
   * last cron tick, which for a daily cron is most of any given day. Screens must
   * use this, or a treasurer sees "Due" on an invoice that is 212 days late. The
   * stored column exists so the database can be queried and filtered; the cron
   * reconciles it, and nothing renders it.
   */
  status: InvoiceStatus;
}

function toLedger(
  invoice: Invoice,
  lines: InvoiceLine[],
  paid: Payment[],
  asOf: IsoDate = today(),
): InvoiceLedger {
  const ledgerLines: LedgerLine[] = lines.map((l) => ({ kind: l.kind, amountCents: l.amountCents }));
  const ledgerPayments: LedgerPayment[] = paid.map((p) => ({
    status: p.status,
    appliedCents: p.appliedCents,
  }));
  return {
    invoice,
    lines,
    payments: paid,
    totalCents: invoiceTotal(ledgerLines),
    settledCents: settledCents(ledgerPayments),
    pendingCents: pendingCents(ledgerPayments),
    balanceCents: balanceCents(ledgerLines, ledgerPayments),
    dueNowCents: amountDueNow(ledgerLines, ledgerPayments),
    lateFeeCents: netLateFee(ledgerLines),
    partlyPaid: isPartlyPaid(ledgerLines, ledgerPayments),
    status: deriveStatus({
      lines: ledgerLines,
      payments: ledgerPayments,
      dueOn: invoice.dueOn,
      policy: invoice.lateFeePolicy,
      asOf,
      sent: Boolean(invoice.sentAt),
      writtenOff: invoice.status === "written_off",
    }),
  };
}

export async function loadInvoice(invoiceId: string): Promise<InvoiceLedger | null> {
  const db = getDb();
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
  if (!invoice) return null;
  const lines = await db
    .select()
    .from(invoiceLines)
    .where(eq(invoiceLines.invoiceId, invoiceId))
    .orderBy(invoiceLines.createdAt);
  const paid = await db
    .select()
    .from(payments)
    .where(eq(payments.invoiceId, invoiceId))
    .orderBy(payments.receivedOn);
  return toLedger(invoice, lines, paid);
}

/** Every invoice for a household, newest first, each with its own arithmetic. */
export async function householdInvoices(householdId: string): Promise<InvoiceLedger[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(invoices)
    .where(eq(invoices.householdId, householdId))
    .orderBy(desc(invoices.dueOn));
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const lines = await db.select().from(invoiceLines).where(inArray(invoiceLines.invoiceId, ids));
  const paid = await db.select().from(payments).where(inArray(payments.invoiceId, ids));
  return rows.map((invoice) =>
    toLedger(
      invoice,
      lines.filter((l) => l.invoiceId === invoice.id),
      paid.filter((p) => p.invoiceId === invoice.id),
    ),
  );
}

export interface HouseholdBalance {
  householdId: string;
  balanceCents: number;
  pendingCents: number;
  creditCents: number;
  /** Due date of the oldest invoice that still has a balance. */
  oldestDueOn: IsoDate | null;
  openInvoices: number;
}

/**
 * Balances for a whole association in one pass. This is the delinquency view's
 * data source, so it must not be N+1 across 300 households.
 */
export async function associationBalances(
  associationId: string,
): Promise<Map<string, HouseholdBalance>> {
  const db = getDb();
  const rows = await db
    .select({
      householdId: invoices.householdId,
      invoiceId: invoices.id,
      dueOn: invoices.dueOn,
      status: invoices.status,
    })
    .from(invoices)
    .where(eq(invoices.associationId, associationId));

  const out = new Map<string, HouseholdBalance>();
  if (rows.length === 0) return out;

  const lineTotals = await db
    .select({
      invoiceId: invoiceLines.invoiceId,
      total: sql<number>`coalesce(sum(${invoiceLines.amountCents}), 0)::int`,
    })
    .from(invoiceLines)
    .innerJoin(invoices, eq(invoiceLines.invoiceId, invoices.id))
    .where(eq(invoices.associationId, associationId))
    .groupBy(invoiceLines.invoiceId);

  const paymentTotals = await db
    .select({
      invoiceId: payments.invoiceId,
      status: payments.status,
      applied: sql<number>`coalesce(sum(${payments.appliedCents}), 0)::int`,
    })
    .from(payments)
    .where(eq(payments.associationId, associationId))
    .groupBy(payments.invoiceId, payments.status);

  const credits = await db
    .select({
      householdId: payments.householdId,
      credit: sql<number>`coalesce(sum(${payments.creditCents}), 0)::int`,
    })
    .from(payments)
    .where(and(eq(payments.associationId, associationId), eq(payments.status, "settled")))
    .groupBy(payments.householdId);

  const totalByInvoice = new Map(lineTotals.map((r) => [r.invoiceId, r.total]));
  const settledByInvoice = new Map<string, number>();
  const pendingByInvoice = new Map<string, number>();
  for (const r of paymentTotals) {
    if (!r.invoiceId) continue;
    if (r.status === "settled") settledByInvoice.set(r.invoiceId, r.applied);
    if (r.status === "pending") pendingByInvoice.set(r.invoiceId, r.applied);
  }

  for (const row of rows) {
    const entry =
      out.get(row.householdId) ??
      ({
        householdId: row.householdId,
        balanceCents: 0,
        pendingCents: 0,
        creditCents: 0,
        oldestDueOn: null,
        openInvoices: 0,
      } satisfies HouseholdBalance);

    if (row.status !== "written_off") {
      const total = totalByInvoice.get(row.invoiceId) ?? 0;
      const settled = settledByInvoice.get(row.invoiceId) ?? 0;
      const pending = pendingByInvoice.get(row.invoiceId) ?? 0;
      const balance = Math.max(0, total - settled);
      entry.balanceCents += balance;
      entry.pendingCents += pending;
      if (balance > 0) {
        entry.openInvoices += 1;
        if (!entry.oldestDueOn || compareIso(row.dueOn, entry.oldestDueOn) < 0) {
          entry.oldestDueOn = row.dueOn;
        }
      }
    }
    out.set(row.householdId, entry);
  }

  for (const c of credits) {
    const entry = out.get(c.householdId);
    if (entry) entry.creditCents = c.credit;
    else
      out.set(c.householdId, {
        householdId: c.householdId,
        balanceCents: 0,
        pendingCents: 0,
        creditCents: c.credit,
        oldestDueOn: null,
        openInvoices: 0,
      });
  }

  return out;
}

/* -------------------------------------------------------------- generation --- */

export interface RunPreviewLine {
  householdId: string;
  unitLabel: string;
  amountCents: number;
  prorationNote: string | null;
  alreadyExists: boolean;
}

export interface RunPreview {
  period: BillingPeriod;
  lines: RunPreviewLine[];
  /** Households that will get a new invoice. */
  toCreate: number;
  toCreateCents: number;
  skippedExisting: number;
  proratedCount: number;
  /** The sentence the onboarding screen shows. */
  sentence: string;
}

async function scheduleOrThrow(scheduleId: string): Promise<AssessmentSchedule> {
  const [schedule] = await getDb()
    .select()
    .from(assessmentSchedules)
    .where(eq(assessmentSchedules.id, scheduleId));
  if (!schedule) throw new Error("No such assessment schedule");
  return schedule;
}

/** Households that held a unit at any point during the period. */
async function householdsForPeriod(
  associationId: string,
  period: BillingPeriod,
): Promise<Household[]> {
  const db = getDb();
  return db
    .select()
    .from(households)
    .where(
      and(
        eq(households.associationId, associationId),
        sql`${households.joinedOn} <= ${period.end}`,
        or(isNull(households.leftOn), sql`${households.leftOn} >= ${period.start}`),
      ),
    )
    .orderBy(households.unitLabel);
}

/**
 * "63 invoices totalling $11,340 will be created for Apr 1" — the onboarding
 * trust moment. No side effects whatsoever.
 */
export async function previewRun(
  scheduleId: string,
  periodIndex: number,
): Promise<RunPreview> {
  const schedule = await scheduleOrThrow(scheduleId);
  const period = periodAt(schedule, periodIndex);
  if (!period) throw new Error("That period is outside the schedule's dates");

  const db = getDb();
  const candidates = await householdsForPeriod(schedule.associationId, period);
  const existing = await db
    .select({ householdId: invoices.householdId })
    .from(invoices)
    .where(
      and(
        eq(invoices.assessmentScheduleId, scheduleId),
        eq(invoices.periodLabel, period.label),
      ),
    );
  const existingIds = new Set(existing.map((e) => e.householdId));

  const lines: RunPreviewLine[] = [];
  for (const household of candidates) {
    const assessed = assessForHousehold(schedule, period, {
      joinedOn: household.joinedOn,
      leftOn: household.leftOn,
    });
    if (!assessed) continue;
    lines.push({
      householdId: household.id,
      unitLabel: household.unitLabel,
      amountCents: assessed.amountCents,
      prorationNote: assessed.prorationNote,
      alreadyExists: existingIds.has(household.id),
    });
  }

  const fresh = lines.filter((l) => !l.alreadyExists);
  const toCreateCents = fresh.reduce((sum, l) => sum + l.amountCents, 0);
  const proratedCount = fresh.filter((l) => l.prorationNote !== null).length;

  const sentence = fresh.length === 0
    ? `Every household already has a ${period.label} invoice — nothing to create.`
    : `${fresh.length} invoice${fresh.length === 1 ? "" : "s"} totalling ${formatMoney(
        toCreateCents,
      )} will be created for ${formatIso(period.dueOn)}.`;

  return {
    period,
    lines,
    toCreate: fresh.length,
    toCreateCents,
    skippedExisting: lines.length - fresh.length,
    proratedCount,
    sentence,
  };
}

export interface RunResult {
  created: number;
  skipped: number;
  totalCents: number;
  invoiceIds: string[];
  period: BillingPeriod;
}

/**
 * Create the invoices for one period. Safe to call repeatedly: the unique index
 * on (household, schedule, period) turns a second run into a no-op.
 */
export async function generateInvoices(
  scheduleId: string,
  periodIndex: number,
  actor: Actor,
  options: { markSent?: boolean } = {},
): Promise<RunResult> {
  const schedule = await scheduleOrThrow(scheduleId);
  const period = periodAt(schedule, periodIndex);
  if (!period) throw new Error("That period is outside the schedule's dates");

  const db = getDb();
  const candidates = await householdsForPeriod(schedule.associationId, period);
  const markSent = options.markSent ?? true;

  const created: string[] = [];
  let skipped = 0;
  let totalCents = 0;

  for (const household of candidates) {
    const assessed = assessForHousehold(schedule, period, {
      joinedOn: household.joinedOn,
      leftOn: household.leftOn,
    });
    if (!assessed) continue;

    const [invoice] = await db
      .insert(invoices)
      .values({
        associationId: schedule.associationId,
        householdId: household.id,
        assessmentScheduleId: schedule.id,
        periodLabel: period.label,
        periodStart: period.start,
        periodEnd: period.end,
        dueOn: period.dueOn,
        status: markSent ? "sent" : "draft",
        lateFeePolicy: schedule.lateFeePolicy,
        prorationNote: assessed.prorationNote,
        sentAt: markSent ? new Date() : null,
      })
      .onConflictDoNothing()
      .returning();

    if (!invoice) {
      skipped += 1;
      continue;
    }

    await db.insert(invoiceLines).values({
      invoiceId: invoice.id,
      kind: "assessment",
      description: `${schedule.name} — ${period.label}`,
      amountCents: assessed.amountCents,
    });

    created.push(invoice.id);
    totalCents += assessed.amountCents;
  }

  if (created.length > 0) {
    await audit(
      schedule.associationId,
      actor,
      "generated_invoice_run",
      `${schedule.name} · ${period.label}`,
      { created: created.length, skipped, amountCents: totalCents },
    );
  }

  return { created: created.length, skipped, totalCents, invoiceIds: created, period };
}

/**
 * Cron entry point: generate any period that has opened recently for every live
 * schedule. Bounded by `periodsToGenerate` — see the note there about why a
 * backdated schedule does not mail eight quarters at once.
 */
export async function runScheduledInvoicing(asOf: IsoDate = today()): Promise<{
  created: number;
  runs: number;
}> {
  const db = getDb();
  const schedules = await db
    .select()
    .from(assessmentSchedules)
    .where(isNull(assessmentSchedules.archivedAt));

  let created = 0;
  let runs = 0;
  for (const schedule of schedules) {
    const shape: ScheduleShape = schedule;
    const due = periodsToGenerate(shape, asOf);
    for (const period of due) {
      // Recover the index so generateInvoices computes the identical period.
      const index = indexOfPeriod(shape, period.label);
      if (index === null) continue;
      const result = await generateInvoices(schedule.id, index, SYSTEM);
      created += result.created;
      if (result.created > 0) runs += 1;
    }
  }
  return { created, runs };
}

function indexOfPeriod(schedule: ScheduleShape, label: string): number | null {
  for (let i = 0; i < 240; i++) {
    const period = periodAt(schedule, i);
    if (!period) return null;
    if (period.label === label) return i;
  }
  return null;
}

/**
 * A one-off special assessment ("$450 per unit for the roof"). It runs through
 * exactly the same pipeline as regular dues — a special assessment that took a
 * different code path is a special assessment that gets misapplied.
 */
export async function specialAssessment(
  associationId: string,
  input: { name: string; amountCents: number; dueOn: IsoDate; policy?: LateFeePolicy },
  actor: Actor,
): Promise<RunResult> {
  const db = getDb();
  const [schedule] = await db
    .insert(assessmentSchedules)
    .values({
      associationId,
      name: input.name,
      cadence: "one_time",
      amountCents: input.amountCents,
      dueDay: Number(input.dueOn.slice(8, 10)),
      startsOn: input.dueOn,
      endsOn: input.dueOn,
      prorate: false, // A roof costs the same whoever owns the unit that month.
      lateFeePolicy: input.policy ?? DEFAULT_LATE_FEE,
    })
    .returning();
  return generateInvoices(schedule.id, 0, actor);
}

/* -------------------------------------------------------------- settlement --- */

/** Recompute and persist an invoice's status from its lines and payments. */
export async function refreshInvoice(
  invoiceId: string,
  asOf: IsoDate = today(),
): Promise<InvoiceLedger | null> {
  const ledger = await loadInvoice(invoiceId);
  if (!ledger) return null;
  const { invoice } = ledger;

  const status = deriveStatus({
    lines: ledger.lines.map((l) => ({ kind: l.kind, amountCents: l.amountCents })),
    payments: ledger.payments.map((p) => ({ status: p.status, appliedCents: p.appliedCents })),
    dueOn: invoice.dueOn,
    policy: invoice.lateFeePolicy,
    asOf,
    sent: Boolean(invoice.sentAt),
    writtenOff: invoice.status === "written_off",
  });

  const paidAt = status === "paid" ? (invoice.paidAt ?? new Date()) : null;
  if (status !== invoice.status || (paidAt?.getTime() ?? 0) !== (invoice.paidAt?.getTime() ?? 0)) {
    await getDb().update(invoices).set({ status, paidAt }).where(eq(invoices.id, invoiceId));
    return { ...ledger, invoice: { ...invoice, status, paidAt } };
  }
  return ledger;
}

export interface ManualPaymentInput {
  invoiceId: string;
  amountCents: number;
  method: PaymentMethod;
  receivedOn: IsoDate;
  reference?: string | null;
  note?: string | null;
}

export interface ManualPaymentResult {
  paymentIds: string[];
  appliedCents: number;
  creditCents: number;
  /** Invoices this one payment settled or reduced, in the order it was applied. */
  invoiceIds: string[];
}

/**
 * Record a check or cash payment. Two taps from the household row is the design
 * target; this is the one call behind them.
 *
 * The amount is applied to the named invoice first and then **cascades** to the
 * household's other open invoices, oldest first. This is not a nicety: a
 * treasurer routinely receives one $540 check covering three unpaid quarters, and
 * a ledger that credits one quarter and parks $360 as "credit" leaves the
 * household looking two quarters delinquent and being chased for money it has
 * already paid. Only what is left after every open balance is cleared becomes
 * household credit.
 */
export async function recordManualPayment(
  input: ManualPaymentInput,
  actor: Actor,
): Promise<ManualPaymentResult> {
  if (input.amountCents <= 0) throw new Error("Enter an amount greater than zero");
  const target = await loadInvoice(input.invoiceId);
  if (!target) throw new Error("No such invoice");

  // The named invoice first, then the rest of the household's open ones, oldest
  // first, so the money lands where a treasurer would put it.
  const all = await householdInvoices(target.invoice.householdId);
  const others = all
    .filter(
      (l) =>
        l.invoice.id !== input.invoiceId &&
        l.balanceCents > 0 &&
        l.invoice.status !== "written_off",
    )
    .sort((a, b) => compareIso(a.invoice.dueOn, b.invoice.dueOn));
  const ordered = [target, ...others];

  const plan = cascade(
    ordered.map((l) => ({ invoiceId: l.invoice.id, balanceCents: l.balanceCents })),
    input.amountCents,
  );

  const db = getDb();
  const paymentIds: string[] = [];
  const invoiceIds: string[] = [];

  for (const [index, allocation] of plan.allocations.entries()) {
    const isLast = index === plan.allocations.length - 1;
    const [payment] = await db
      .insert(payments)
      .values({
        associationId: target.invoice.associationId,
        householdId: target.invoice.householdId,
        invoiceId: allocation.invoiceId,
        method: input.method,
        // A check in the treasurer's hand has settled.
        status: "settled",
        amountCents: allocation.appliedCents + (isLast ? plan.creditCents : 0),
        appliedCents: allocation.appliedCents,
        creditCents: isLast ? plan.creditCents : 0,
        reference: input.reference ?? null,
        receivedOn: input.receivedOn,
        recordedByUserId: actor.kind === "user" ? actor.id : null,
        note:
          plan.allocations.length > 1
            ? `${input.note ? `${input.note} · ` : ""}part ${index + 1} of ${plan.allocations.length} of one ${formatMoney(input.amountCents)} payment`
            : (input.note ?? null),
      })
      .returning();
    paymentIds.push(payment.id);
    invoiceIds.push(allocation.invoiceId);
    await refreshInvoice(allocation.invoiceId);
  }

  // A payment that could not be applied anywhere is pure credit. It still needs a
  // row, or the money has no record at all.
  if (plan.allocations.length === 0) {
    const [payment] = await db
      .insert(payments)
      .values({
        associationId: target.invoice.associationId,
        householdId: target.invoice.householdId,
        invoiceId: input.invoiceId,
        method: input.method,
        status: "settled",
        amountCents: input.amountCents,
        appliedCents: 0,
        creditCents: input.amountCents,
        reference: input.reference ?? null,
        receivedOn: input.receivedOn,
        recordedByUserId: actor.kind === "user" ? actor.id : null,
        note: input.note ?? null,
      })
      .returning();
    paymentIds.push(payment.id);
  }

  await audit(
    target.invoice.associationId,
    actor,
    "recorded_payment",
    `unit ${target.invoice.periodLabel}`,
    {
      invoiceIds,
      method: input.method,
      amountCents: input.amountCents,
      appliedCents: plan.appliedCents,
      creditCents: plan.creditCents,
    },
  );

  return {
    paymentIds,
    appliedCents: plan.appliedCents,
    creditCents: plan.creditCents,
    invoiceIds,
  };
}

export interface StripePaymentInput {
  paymentIntentId: string;
  invoiceId: string;
  amountCents: number;
  method: PaymentMethod;
  /** `pending` for an ACH debit still clearing, `settled` once it has. */
  status: "pending" | "settled";
  receivedOn?: IsoDate;
}

/**
 * Apply a Stripe payment. **Idempotent by PaymentIntent id**: a retried webhook
 * either updates the existing row's status or does nothing, and can never
 * insert a second credit.
 *
 * Returns whether anything changed, which is what the webhook uses to decide
 * whether to write an audit row.
 */
export async function applyStripePayment(
  input: StripePaymentInput,
): Promise<{ changed: boolean; ledger: InvoiceLedger | null }> {
  const db = getDb();
  const ledger = await loadInvoice(input.invoiceId);
  if (!ledger) return { changed: false, ledger: null };

  const [existing] = await db
    .select()
    .from(payments)
    .where(eq(payments.stripePaymentIntentId, input.paymentIntentId));

  if (existing) {
    // Already known. The only legal transition here is pending → settled: an
    // ACH debit clearing. Anything else is a duplicate delivery.
    if (existing.status === "pending" && input.status === "settled") {
      // Re-allocate against the balance excluding this payment, in case another
      // payment landed while the debit was clearing.
      const others = ledger.payments.filter((p) => p.id !== existing.id);
      const balanceWithoutThis = balanceCents(
        ledger.lines.map((l) => ({ kind: l.kind, amountCents: l.amountCents })),
        others.map((p) => ({ status: p.status, appliedCents: p.appliedCents })),
      );
      const { appliedCents, creditCents } = allocate(balanceWithoutThis, existing.amountCents);
      await db
        .update(payments)
        .set({ status: "settled", appliedCents, creditCents })
        .where(eq(payments.id, existing.id));
      const refreshed = await refreshInvoice(input.invoiceId);
      return { changed: true, ledger: refreshed };
    }
    return { changed: false, ledger };
  }

  const { appliedCents, creditCents } = allocate(ledger.balanceCents, input.amountCents);
  const [inserted] = await db
    .insert(payments)
    .values({
      associationId: ledger.invoice.associationId,
      householdId: ledger.invoice.householdId,
      invoiceId: input.invoiceId,
      method: input.method,
      status: input.status,
      amountCents: input.amountCents,
      // A pending debit reserves nothing: `appliedCents` is what it *will*
      // apply, and `ledger.balanceCents` ignores pending rows entirely.
      appliedCents,
      creditCents,
      stripePaymentIntentId: input.paymentIntentId,
      receivedOn: input.receivedOn ?? today(),
    })
    .onConflictDoNothing()
    .returning();

  // Lost the race with a concurrent delivery of the same event. The winner did
  // the work; this delivery is a no-op, which is exactly right.
  if (!inserted) return { changed: false, ledger };

  const refreshed = await refreshInvoice(input.invoiceId);
  return { changed: true, ledger: refreshed };
}

/**
 * An ACH debit that failed after being accepted. The invoice must go back to
 * unpaid with a record of why — never silently, and never having shown "paid".
 */
export async function markStripePaymentFailed(
  paymentIntentId: string,
  reason: string,
): Promise<{ changed: boolean; invoiceId: string | null }> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(payments)
    .where(eq(payments.stripePaymentIntentId, paymentIntentId));
  if (!existing || existing.status === "failed") {
    return { changed: false, invoiceId: existing?.invoiceId ?? null };
  }

  await db
    .update(payments)
    .set({ status: "failed", appliedCents: 0, creditCents: 0, note: reason })
    .where(eq(payments.id, existing.id));
  if (existing.invoiceId) await refreshInvoice(existing.invoiceId);
  await audit(existing.associationId, SYSTEM, "payment_failed", `payment ${existing.id}`, {
    amountCents: existing.amountCents,
    reason,
  });
  return { changed: true, invoiceId: existing.invoiceId };
}

/* --------------------------------------------------------------- late fees --- */

/**
 * Apply the invoice's own snapshotted late-fee policy, once. Returns 0 when the
 * fee was already charged, the grace period has not expired, or the policy is
 * "none" — so the sweep can run daily without thinking.
 */
export async function applyLateFee(
  invoiceId: string,
  actor: Actor = SYSTEM,
  asOf: IsoDate = today(),
): Promise<number> {
  const ledger = await loadInvoice(invoiceId);
  if (!ledger) return 0;
  const { invoice } = ledger;
  if (invoice.lateFeeAppliedAt) return 0;
  if (invoice.status === "written_off" || invoice.status === "paid") return 0;
  if (!isPastGrace(invoice.dueOn, invoice.lateFeePolicy, asOf)) return 0;

  const fee = lateFeeCents(invoice.lateFeePolicy, ledger.balanceCents);
  if (fee <= 0) {
    // Nothing to charge, but stamp it so the sweep stops reconsidering.
    await getDb()
      .update(invoices)
      .set({ lateFeeAppliedAt: new Date() })
      .where(eq(invoices.id, invoiceId));
    return 0;
  }

  const db = getDb();
  await db.insert(invoiceLines).values({
    invoiceId,
    kind: "late_fee",
    description:
      invoice.lateFeePolicy.kind === "flat"
        ? `Late fee — ${invoice.lateFeePolicy.graceDays}-day grace expired`
        : `Late fee (${(invoice.lateFeePolicy.percentBps / 100).toFixed(2)}% of balance)`,
    amountCents: fee,
  });
  await db
    .update(invoices)
    .set({ lateFeeAppliedAt: new Date() })
    .where(eq(invoices.id, invoiceId));
  await refreshInvoice(invoiceId, asOf);
  await audit(invoice.associationId, actor, "applied_late_fee", `invoice ${invoice.periodLabel}`, {
    invoiceId,
    amountCents: fee,
  });
  return fee;
}

/**
 * Waive a late fee. The fee line stays and a negative waiver line is added, so
 * the record shows both what was charged and what the board forgave.
 */
export async function waiveLateFee(
  invoiceId: string,
  reason: string,
  actor: Actor,
): Promise<number> {
  const ledger = await loadInvoice(invoiceId);
  if (!ledger) throw new Error("No such invoice");
  const outstandingFee = netLateFee(
    ledger.lines.map((l) => ({ kind: l.kind, amountCents: l.amountCents })),
  );
  if (outstandingFee <= 0) throw new Error("There is no late fee to waive on this invoice");
  if (!reason.trim()) throw new Error("Give a reason — members ask, and the record should answer");

  await getDb().insert(invoiceLines).values({
    invoiceId,
    kind: "late_fee_waiver",
    description: `Late fee waived — ${reason.trim()}`,
    amountCents: -outstandingFee,
  });
  await refreshInvoice(invoiceId);
  await audit(
    ledger.invoice.associationId,
    actor,
    "waived_late_fee",
    `invoice ${ledger.invoice.periodLabel}`,
    { invoiceId, amountCents: outstandingFee, reason: reason.trim() },
  );
  return outstandingFee;
}

/** Daily sweep: apply late fees wherever grace has expired. */
export async function applyLateFeesSweep(asOf: IsoDate = today()): Promise<number> {
  const db = getDb();
  const candidates = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(
      and(
        isNull(invoices.lateFeeAppliedAt),
        inArray(invoices.status, ["sent", "partial", "overdue"]),
        sql`${invoices.dueOn} < ${asOf}`,
      ),
    )
    .limit(2000);

  let applied = 0;
  for (const row of candidates) {
    const fee = await applyLateFee(row.id, SYSTEM, asOf);
    if (fee > 0) applied += 1;
  }
  return applied;
}

/**
 * Re-derive statuses so an invoice that quietly crossed its grace date shows as
 * overdue without waiting for someone to touch it.
 */
export async function refreshOverdueStatuses(asOf: IsoDate = today()): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(
      and(
        inArray(invoices.status, ["sent", "partial", "overdue", "processing"]),
        sql`${invoices.dueOn} <= ${asOf}`,
      ),
    )
    .limit(5000);
  let changed = 0;
  for (const row of rows) {
    const before = await loadInvoice(row.id);
    const after = await refreshInvoice(row.id, asOf);
    if (before && after && before.invoice.status !== after.invoice.status) changed += 1;
  }
  return changed;
}

/* ------------------------------------------------------------ write-offs --- */

export async function writeOffInvoice(
  invoiceId: string,
  reason: string,
  actor: Actor,
): Promise<void> {
  const ledger = await loadInvoice(invoiceId);
  if (!ledger) throw new Error("No such invoice");
  if (!reason.trim()) throw new Error("Write-offs need a reason on the record");
  await getDb().update(invoices).set({ status: "written_off" }).where(eq(invoices.id, invoiceId));
  await audit(
    ledger.invoice.associationId,
    actor,
    "wrote_off_invoice",
    `invoice ${ledger.invoice.periodLabel}`,
    { invoiceId, amountCents: ledger.balanceCents, reason: reason.trim() },
  );
}

/* --------------------------------------------------------- invoice emails --- */

export interface InvoiceEmailTargets {
  invoice: Invoice;
  household: Household;
  primaryMemberId: string | null;
}

/** The primary member of a household, or the first one with an email. */
export async function primaryContact(householdId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(members)
    .where(eq(members.householdId, householdId))
    .orderBy(desc(members.isPrimary), members.createdAt);
  return rows.find((m) => m.email) ?? rows[0] ?? null;
}

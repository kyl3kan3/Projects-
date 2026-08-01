/**
 * Invoices and payments.
 *
 * Three properties are load-bearing here:
 *
 *  - **Balance is recomputed, never incremented.** `balance_cents` is always
 *    `amount − sum(payment rows)`. A Stripe webhook Stripe retries four times
 *    cannot credit the same money four times, because the payment row is inserted
 *    `on conflict do nothing` against the payment-intent index and the balance is
 *    then derived from whatever rows exist. A botched earlier write self-heals the
 *    next time money arrives.
 *
 *  - **Status is derived for display, and only cached for querying.** Every read
 *    path calls `derivedStatus`, so a reconciliation that never ran can make the
 *    stored column stale but cannot put "Due" on an invoice 212 days late.
 *
 *  - **A payment cascades oldest-first across the client's open invoices.** One
 *    wire that covers three invoices clears three invoices. Anything left over
 *    parks as client credit instead of leaving them looking delinquent.
 */

import { and, asc, desc, eq, gt, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  clientCredits,
  clients,
  invoices,
  payments,
  sequenceRuns,
  type Client,
  type Invoice,
  type InvoiceStatus,
  type PaymentMethod,
} from "@/db/schema";
import { compareIso, daysOverdue, describeDue, formatStamp, today, type IsoDate } from "@/lib/dates";
import { audit, SYSTEM } from "@/lib/audit";
import { cascade } from "@/lib/money";

/* --------------------------------------------------------- derived status --- */

export interface StatusSubject {
  status: InvoiceStatus;
  balanceCents: number;
  amountCents: number;
  dueAt: IsoDate;
}

/**
 * What an invoice's status *is* right now. Pure, so both a server component and
 * a test can ask. `written_off` and `disputed` are decisions a human made and
 * are never overridden by arithmetic.
 */
export function derivedStatus(invoice: StatusSubject): InvoiceStatus {
  if (invoice.status === "written_off" || invoice.status === "disputed") return invoice.status;
  if (invoice.balanceCents <= 0) return "paid";
  if (invoice.balanceCents < invoice.amountCents) return "partial";
  return "open";
}

/** The state line under an invoice row: never "due" on something long overdue. */
export function describeInvoiceState(
  invoice: StatusSubject & { paidAt: IsoDate | null },
  asOf: IsoDate,
): string {
  const status = derivedStatus(invoice);
  if (status === "written_off") return "written off";
  if (status === "disputed") return "disputed";
  if (status === "paid") return invoice.paidAt ? `paid ${formatStamp(invoice.paidAt)}` : "paid";
  const due = describeDue(invoice.dueAt, asOf);
  return status === "partial" ? `part paid · ${due}` : due;
}

export const OPEN_STATUSES: InvoiceStatus[] = ["open", "partial"];

/* ------------------------------------------------------------------ reads --- */

export interface InvoiceWithClient {
  invoice: Invoice;
  client: Client;
}

export async function openInvoices(firmId: string): Promise<InvoiceWithClient[]> {
  const db = getDb();
  const rows = await db
    .select({ invoice: invoices, client: clients })
    .from(invoices)
    .innerJoin(clients, eq(clients.id, invoices.clientId))
    .where(
      and(
        eq(invoices.firmId, firmId),
        inArray(invoices.status, OPEN_STATUSES),
        gt(invoices.balanceCents, 0),
      ),
    )
    .orderBy(asc(invoices.dueAt));
  return rows;
}

/** Everything on the book except written-off rows — for aging and history. */
export async function allInvoices(firmId: string): Promise<InvoiceWithClient[]> {
  const db = getDb();
  return db
    .select({ invoice: invoices, client: clients })
    .from(invoices)
    .innerJoin(clients, eq(clients.id, invoices.clientId))
    .where(and(eq(invoices.firmId, firmId), ne(invoices.status, "written_off")))
    .orderBy(desc(invoices.issuedAt));
}

export async function loadInvoice(
  firmId: string,
  invoiceId: string,
): Promise<InvoiceWithClient | null> {
  const db = getDb();
  const [row] = await db
    .select({ invoice: invoices, client: clients })
    .from(invoices)
    .innerJoin(clients, eq(clients.id, invoices.clientId))
    .where(and(eq(invoices.firmId, firmId), eq(invoices.id, invoiceId)));
  return row ?? null;
}

export async function invoicePayments(invoiceId: string) {
  const db = getDb();
  return db
    .select()
    .from(payments)
    .where(eq(payments.invoiceId, invoiceId))
    .orderBy(asc(payments.paidAt));
}

/** Paid history for behaviour maths: issue date, due date, settlement date. */
export async function settledHistory(firmId: string) {
  const db = getDb();
  return db
    .select({
      clientId: invoices.clientId,
      issuedAt: invoices.issuedAt,
      dueAt: invoices.dueAt,
      paidAt: invoices.paidAt,
    })
    .from(invoices)
    .where(and(eq(invoices.firmId, firmId), eq(invoices.status, "paid"), isNotNull(invoices.paidAt)));
}

export async function openInvoiceCount(firmId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(invoices)
    .where(and(eq(invoices.firmId, firmId), inArray(invoices.status, OPEN_STATUSES)));
  return row?.count ?? 0;
}

/* --------------------------------------------------------------- payments --- */

export interface RecordPaymentInput {
  firmId: string;
  invoiceId: string;
  amountCents: number;
  method: PaymentMethod;
  stripePaymentIntentId?: string | null;
  externalId?: string | null;
  paidAt?: IsoDate;
  actor?: string;
}

export interface PaymentResult {
  applied: boolean;
  duplicate: boolean;
  balanceCents: number;
  settled: boolean;
}

/**
 * Apply one payment to one invoice, idempotently.
 *
 * When the invoice reaches zero the sequence run is stopped in the same
 * operation — "never nag a paid invoice" is enforced at three separate points
 * (here, at send time, and in the ladder's own decision), because it is the one
 * mistake this product cannot make.
 */
export async function recordPayment(input: RecordPaymentInput): Promise<PaymentResult> {
  const db = getDb();
  const amount = Math.max(0, Math.round(input.amountCents) || 0);
  const paidAt = input.paidAt ?? today();

  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.firmId, input.firmId), eq(invoices.id, input.invoiceId)));
  if (!invoice) throw new Error("Invoice not found");

  let duplicate = false;
  if (amount > 0) {
    const inserted = await db
      .insert(payments)
      .values({
        firmId: input.firmId,
        invoiceId: invoice.id,
        clientId: invoice.clientId,
        amountCents: amount,
        method: input.method,
        stripePaymentIntentId: input.stripePaymentIntentId ?? null,
        externalId: input.externalId ?? null,
        paidAt,
      })
      .onConflictDoNothing()
      .returning();
    duplicate = inserted.length === 0;
  }

  const settledInvoice = await reconcileBalance(invoice.id);
  const settled = settledInvoice.balanceCents <= 0;

  if (!duplicate && amount > 0) {
    await audit(
      input.firmId,
      input.actor ?? SYSTEM,
      "payment_recorded",
      `${invoice.number} · ${input.method}`,
      { invoiceId: invoice.id, amountCents: amount, settled },
    );
  }

  if (settled) {
    await db
      .update(sequenceRuns)
      .set({
        state: "completed",
        stoppedReason: "paid",
        nextSendOn: null,
        updatedAt: new Date(),
      })
      .where(and(eq(sequenceRuns.invoiceId, invoice.id), ne(sequenceRuns.state, "completed")));
  }

  return { applied: !duplicate && amount > 0, duplicate, balanceCents: settledInvoice.balanceCents, settled };
}

/**
 * Recompute an invoice's balance and cached status from its payment rows. The
 * only writer of `balance_cents`.
 */
export async function reconcileBalance(invoiceId: string): Promise<Invoice> {
  const db = getDb();
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
  if (!invoice) throw new Error("Invoice not found");

  const [sum] = await db
    .select({ paid: sql<number>`coalesce(sum(${payments.amountCents}), 0)::int` })
    .from(payments)
    .where(eq(payments.invoiceId, invoiceId));
  const paid = sum?.paid ?? 0;
  const balanceCents = Math.max(0, invoice.amountCents - paid);

  // The last payment date is the settlement date, so "paid 14 Jul" is true.
  const [latest] = await db
    .select({ paidAt: payments.paidAt })
    .from(payments)
    .where(eq(payments.invoiceId, invoiceId))
    .orderBy(desc(payments.paidAt))
    .limit(1);

  const status = derivedStatus({
    status: invoice.status,
    balanceCents,
    amountCents: invoice.amountCents,
    dueAt: invoice.dueAt,
  });

  const [updated] = await db
    .update(invoices)
    .set({
      balanceCents,
      status,
      paidAt: balanceCents <= 0 ? (latest?.paidAt ?? today()) : null,
      updatedAt: new Date(),
    })
    .where(eq(invoices.id, invoiceId))
    .returning();
  return updated;
}

export interface CascadeInput {
  firmId: string;
  clientId: string;
  amountCents: number;
  method: PaymentMethod;
  stripePaymentIntentId?: string | null;
  externalId?: string | null;
  paidAt?: IsoDate;
  /** Apply to this invoice first, then cascade — the one the client clicked. */
  preferInvoiceId?: string | null;
  actor?: string;
}

export interface CascadeOutcome {
  settledInvoiceIds: string[];
  appliedCents: number;
  creditCents: number;
  duplicate: boolean;
}

/**
 * Apply one payment across a client's open invoices.
 *
 * Order: the invoice the client was actually looking at (if any), then everything
 * else oldest due date first. That matches both what a payer expects to happen
 * and what an accountant would do with the cheque.
 */
export async function applyPaymentCascade(input: CascadeInput): Promise<CascadeOutcome> {
  const db = getDb();
  const paidAt = input.paidAt ?? today();

  const open = await db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.firmId, input.firmId),
        eq(invoices.clientId, input.clientId),
        inArray(invoices.status, OPEN_STATUSES),
        gt(invoices.balanceCents, 0),
      ),
    )
    .orderBy(asc(invoices.dueAt));

  const ordered = input.preferInvoiceId
    ? [
        ...open.filter((i) => i.id === input.preferInvoiceId),
        ...open.filter((i) => i.id !== input.preferInvoiceId),
      ]
    : open;

  const result = cascade(
    ordered.map((i) => ({ invoiceId: i.id, balanceCents: i.balanceCents })),
    input.amountCents,
  );

  const settledInvoiceIds: string[] = [];
  let duplicate = false;
  for (const allocation of result.allocations) {
    const outcome = await recordPayment({
      firmId: input.firmId,
      invoiceId: allocation.invoiceId,
      amountCents: allocation.appliedCents,
      method: input.method,
      stripePaymentIntentId: input.stripePaymentIntentId ?? null,
      externalId: input.externalId ?? null,
      paidAt,
      actor: input.actor,
    });
    if (outcome.duplicate) duplicate = true;
    if (outcome.settled) settledInvoiceIds.push(allocation.invoiceId);
  }

  if (result.creditCents > 0 && !duplicate) {
    await db.insert(clientCredits).values({
      firmId: input.firmId,
      clientId: input.clientId,
      amountCents: result.creditCents,
      reason: `Overpayment on ${paidAt}`,
    });
  }

  return {
    settledInvoiceIds,
    appliedCents: result.appliedCents,
    creditCents: result.creditCents,
    duplicate,
  };
}

export async function clientCreditCents(firmId: string, clientId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${clientCredits.amountCents}), 0)::int` })
    .from(clientCredits)
    .where(and(eq(clientCredits.firmId, firmId), eq(clientCredits.clientId, clientId)));
  return row?.total ?? 0;
}

/* -------------------------------------------------------- human decisions --- */

export async function writeOffInvoice(
  firmId: string,
  invoiceId: string,
  reason: string,
  actor: string,
): Promise<void> {
  const db = getDb();
  const [invoice] = await db
    .update(invoices)
    .set({ status: "written_off", disputedNote: reason, updatedAt: new Date() })
    .where(and(eq(invoices.firmId, firmId), eq(invoices.id, invoiceId)))
    .returning();
  if (!invoice) throw new Error("Invoice not found");
  await db
    .update(sequenceRuns)
    .set({ state: "stopped", stoppedReason: "written off", nextSendOn: null, updatedAt: new Date() })
    .where(eq(sequenceRuns.invoiceId, invoiceId));
  await audit(firmId, actor, "invoice_written_off", invoice.number, { reason });
}

export async function markDisputed(
  firmId: string,
  invoiceId: string,
  note: string,
  actor: string,
): Promise<void> {
  const db = getDb();
  const [invoice] = await db
    .update(invoices)
    .set({ status: "disputed", disputedNote: note, updatedAt: new Date() })
    .where(and(eq(invoices.firmId, firmId), eq(invoices.id, invoiceId)))
    .returning();
  if (!invoice) throw new Error("Invoice not found");
  await db
    .update(sequenceRuns)
    .set({ state: "stopped", stoppedReason: "disputed", nextSendOn: null, updatedAt: new Date() })
    .where(eq(sequenceRuns.invoiceId, invoiceId));
  await audit(firmId, actor, "invoice_disputed", invoice.number, { note });
}

/**
 * Reconcile the cached status column for a firm. Cheap, idempotent, and called
 * on dashboard reads as well as by the sweep, so the cache converges even if the
 * cron is down for a week.
 */
export async function refreshInvoiceStatuses(firmId: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.firmId, firmId), inArray(invoices.status, ["open", "partial", "paid"])));

  let changed = 0;
  for (const invoice of rows) {
    const status = derivedStatus(invoice);
    if (status === invoice.status) continue;
    await db
      .update(invoices)
      .set({ status, updatedAt: new Date() })
      .where(eq(invoices.id, invoice.id));
    changed += 1;
  }
  return changed;
}

/** Sort key for the needs-attention feed. */
export function lateness(invoice: Pick<Invoice, "dueAt">, asOf: IsoDate): number {
  return daysOverdue(invoice.dueAt, asOf);
}

export function isOverdue(invoice: Pick<Invoice, "dueAt">, asOf: IsoDate): boolean {
  return compareIso(invoice.dueAt, asOf) < 0;
}

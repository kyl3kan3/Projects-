/**
 * Invoices: numbering, issuing, payment application, and the income figures the
 * dashboard reports.
 *
 * Two properties are load-bearing and both are tested:
 *
 *  - **Payment application is idempotent.** `amountPaid` is always recomputed as
 *    the sum of the invoice's payment rows, never incremented in place, and a
 *    Stripe payment intent can only produce one row (unique index). A webhook
 *    Stripe retries four times must not mark an invoice paid four times over.
 *  - **Overdue is derived, then stored.** The status column is a cache of what
 *    the dates already say, so a sweep that never runs can make the dashboard
 *    stale but cannot make it wrong: every read recomputes.
 */

import { and, asc, desc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  clients,
  docBlocks,
  documents,
  invoices,
  payments,
  users,
  type BlockContent,
  type DocumentRow,
  type DocumentStatus,
  type Invoice,
  type InvoiceKind,
  type PaymentMethod,
} from "@/db/schema";
import { describeDue, dueDateFor, formatShortDate, isOverdue, utcMonthKey } from "@/lib/dates";
import { balanceDue, formatMoney } from "@/lib/money";
import { createDocument, logEvent, transition } from "@/lib/documents";

/* ------------------------------------------------------------- numbering --- */

/** INV-001, INV-014, INV-1042 — zero-padded to three, then natural. */
export function formatInvoiceNumber(seq: number, prefix = "INV"): string {
  const n = Math.max(1, Math.round(seq) || 1);
  return `${prefix}-${String(n).padStart(3, "0")}`;
}

/**
 * Take the next number for an account. The bump is a single atomic UPDATE …
 * RETURNING, so two invoices issued in the same second cannot collide (and the
 * unique index on `invoices.number` is the backstop if they somehow do).
 */
export async function nextInvoiceNumber(userId: string): Promise<string> {
  const db = getDb();
  const [row] = await db
    .update(users)
    .set({ invoiceSeq: sql`${users.invoiceSeq} + 1` })
    .where(eq(users.id, userId))
    .returning({ seq: users.invoiceSeq });
  return formatInvoiceNumber(row?.seq ?? 1);
}

/* ---------------------------------------------------------------- issuing --- */

export interface IssueInvoiceInput {
  userId: string;
  brandId: string | null;
  clientId: string;
  title: string;
  currency: string;
  taxRateBps: number;
  taxLabel: string;
  netDays: number;
  depositPercent: number;
  kind: InvoiceKind;
  /** Minor units, already snapshotted from the signed contract. */
  subtotal: number;
  tax: number;
  total: number;
  parentDocumentId: string | null;
  depositOfDocumentId?: string | null;
  blocks: { kind: "heading" | "text" | "pricing_table" | "terms" | "signature"; position: number; content: BlockContent }[];
  /** Issue and send in one step (the default for chain-generated invoices). */
  issuedAt?: Date | null;
}

export interface IssuedInvoice {
  document: DocumentRow;
  invoice: Invoice;
}

/**
 * Create an invoice document plus its invoice row. When `issuedAt` is given the
 * invoice is issued immediately (status `sent`, due date computed from terms);
 * otherwise it lands as a draft with no due date.
 */
export async function issueInvoice(input: IssueInvoiceInput): Promise<IssuedInvoice> {
  const db = getDb();
  const number = await nextInvoiceNumber(input.userId);
  const issuedAt = input.issuedAt ?? null;

  const document = await createDocument({
    userId: input.userId,
    brandId: input.brandId,
    clientId: input.clientId,
    type: "invoice",
    title: input.title,
    currency: input.currency,
    taxRateBps: input.taxRateBps,
    taxLabel: input.taxLabel,
    depositPercent: input.depositPercent,
    netDays: input.netDays,
    parentDocumentId: input.parentDocumentId,
    status: issuedAt ? "sent" : "draft",
    blocks: input.blocks,
  });

  if (issuedAt) {
    await db.update(documents).set({ sentAt: issuedAt }).where(eq(documents.id, document.id));
    document.sentAt = issuedAt;
    document.status = "sent";
  }

  const [invoice] = await db
    .insert(invoices)
    .values({
      documentId: document.id,
      number,
      kind: input.kind,
      currency: input.currency,
      subtotal: input.subtotal,
      tax: input.tax,
      total: input.total,
      amountPaid: 0,
      issuedAt,
      dueAt: issuedAt ? dueDateFor(issuedAt, input.netDays) : null,
      depositOfDocumentId: input.depositOfDocumentId ?? null,
    })
    .returning();

  await logEvent(
    document.id,
    "created",
    `${number} raised for ${formatMoney(input.total, input.currency)}`,
    "papertrail",
  );
  return { document, invoice };
}

/** Issue a draft invoice: stamp the dates, set the terms clock running. */
export async function issueDraftInvoice(
  document: DocumentRow,
  at = new Date(),
): Promise<Invoice | null> {
  const db = getDb();
  const [invoice] = await db.select().from(invoices).where(eq(invoices.documentId, document.id));
  if (!invoice) return null;
  const [updated] = await db
    .update(invoices)
    .set({ issuedAt: at, dueAt: dueDateFor(at, document.netDays) })
    .where(eq(invoices.documentId, document.id))
    .returning();
  return updated ?? null;
}

/* -------------------------------------------------------------- payments --- */

export interface RecordPaymentInput {
  invoiceDocumentId: string;
  amount: number;
  method: PaymentMethod;
  stripePaymentIntentId?: string | null;
  note?: string;
  paidAt?: Date;
}

export interface PaymentResult {
  applied: boolean;
  duplicate: boolean;
  amountPaid: number;
  balance: number;
  settled: boolean;
}

/**
 * Apply a payment to an invoice.
 *
 * The insert is `on conflict do nothing` against the payment-intent index, so a
 * replayed Stripe webhook is a no-op. Afterwards `amount_paid` is recomputed
 * from the payment rows — meaning even a botched earlier write self-heals the
 * next time money arrives.
 */
export async function recordPayment(input: RecordPaymentInput): Promise<PaymentResult> {
  const db = getDb();
  const amount = Math.max(0, Math.round(input.amount) || 0);
  const paidAt = input.paidAt ?? new Date();

  const [document] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, input.invoiceDocumentId));
  if (!document) throw new Error("Invoice not found");

  let duplicate = false;
  if (amount > 0) {
    const inserted = await db
      .insert(payments)
      .values({
        invoiceDocumentId: input.invoiceDocumentId,
        amount,
        method: input.method,
        stripePaymentIntentId: input.stripePaymentIntentId ?? null,
        note: input.note ?? "",
        paidAt,
      })
      .onConflictDoNothing({ target: payments.stripePaymentIntentId })
      .returning();
    duplicate = inserted.length === 0;
  }

  const [sum] = await db
    .select({ total: sql<number>`coalesce(sum(${payments.amount}), 0)::int` })
    .from(payments)
    .where(eq(payments.invoiceDocumentId, input.invoiceDocumentId));
  const amountPaid = sum?.total ?? 0;

  const [invoice] = await db
    .update(invoices)
    .set({ amountPaid })
    .where(eq(invoices.documentId, input.invoiceDocumentId))
    .returning();
  if (!invoice) throw new Error("Invoice row missing");

  const balance = balanceDue(invoice);
  const settled = balance <= 0;

  if (settled && document.status !== "paid" && document.status !== "void") {
    await db
      .update(invoices)
      .set({ paidAt })
      .where(eq(invoices.documentId, input.invoiceDocumentId));
    await transition(document.id, "paid");
    if (!duplicate) {
      await logEvent(
        document.id,
        "paid",
        `${invoice.number} paid in full — ${formatMoney(invoice.total, invoice.currency)}`,
        input.method === "card" || input.method === "ach" ? "stripe" : "you",
      );
    }
  } else if (!duplicate && amount > 0) {
    await logEvent(
      document.id,
      "partially_paid",
      `${formatMoney(amount, invoice.currency)} received — ${formatMoney(balance, invoice.currency)} still due`,
      input.method === "card" || input.method === "ach" ? "stripe" : "you",
    );
  }

  return { applied: !duplicate && amount > 0, duplicate, amountPaid, balance, settled };
}

/**
 * The meta line under an invoice in any list: what state it is actually in.
 *
 * Written once because it was wrong twice: a paid invoice whose due date has
 * passed must not describe itself as "21 days overdue" just because the date
 * arithmetic still says so.
 */
export function describeInvoiceState(
  status: DocumentStatus,
  invoice: Pick<Invoice, "total" | "amountPaid" | "issuedAt" | "dueAt" | "paidAt">,
  now: Date,
): string {
  if (status === "void") return "voided";
  const outstanding = balanceDue(invoice);
  if (outstanding <= 0 && invoice.amountPaid > 0) {
    return invoice.paidAt ? `paid ${formatShortDate(invoice.paidAt)}` : "paid";
  }
  if (!invoice.issuedAt || !invoice.dueAt) return "not issued";
  const due = describeDue(invoice.dueAt, now);
  return invoice.amountPaid > 0 ? `part paid · ${due}` : due;
}

/* --------------------------------------------------------------- overdue --- */

/** What an invoice's status *should* be right now, given its dates and money. */
export function derivedStatus(
  document: Pick<DocumentRow, "status">,
  invoice: Pick<Invoice, "total" | "amountPaid" | "dueAt">,
  now: Date,
): DocumentStatus {
  if (document.status === "void" || document.status === "draft") return document.status;
  if (balanceDue(invoice) <= 0) return "paid";
  if (isOverdue({ ...invoice, status: document.status }, now)) return "overdue";
  return document.status;
}

/**
 * Flip newly-late invoices to `overdue`. Called by the reminder sweep and on
 * dashboard reads, so the stored status converges even if cron is down.
 */
export async function refreshOverdue(userId: string | null, now = new Date()): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ document: documents, invoice: invoices })
    .from(invoices)
    .innerJoin(documents, eq(documents.id, invoices.documentId))
    .where(
      userId
        ? and(eq(documents.userId, userId), inArray(documents.status, ["sent", "viewed"]))
        : inArray(documents.status, ["sent", "viewed"]),
    );

  let changed = 0;
  for (const row of rows) {
    if (derivedStatus(row.document, row.invoice, now) !== "overdue") continue;
    const updated = await transition(row.document.id, "overdue");
    if (updated) changed++;
  }
  return changed;
}

/* ---------------------------------------------------------------- income --- */

export interface IncomeRow {
  documentId: string;
  number: string;
  title: string;
  clientName: string;
  currency: string;
  subtotal: number;
  tax: number;
  total: number;
  amountPaid: number;
  balance: number;
  status: DocumentStatus;
  issuedAt: Date | null;
  dueAt: Date | null;
  paidAt: Date | null;
  daysLate: number;
}

export interface IncomeSummary {
  paid: number;
  outstanding: number;
  overdue: number;
  currency: string;
  rows: IncomeRow[];
  /** Revenue collected per UTC month key, for the year strip. */
  byMonth: Map<string, number>;
}

/**
 * Summarise every invoice on the account.
 *
 * "Paid" is money actually received (the sum of payments), not the value of
 * invoices marked paid — a half-paid invoice contributes its deposit to paid and
 * its remainder to outstanding, which is what a freelancer means by both words.
 * Amounts are summed in the account's dominant currency; mixed-currency accounts
 * are flagged in the UI rather than silently added together.
 */
export async function incomeSummary(userId: string, now = new Date()): Promise<IncomeSummary> {
  const db = getDb();
  const rows = await db
    .select({ document: documents, invoice: invoices, clientName: clients.name })
    .from(invoices)
    .innerJoin(documents, eq(documents.id, invoices.documentId))
    .innerJoin(clients, eq(clients.id, documents.clientId))
    .where(and(eq(documents.userId, userId), ne(documents.status, "void")))
    .orderBy(desc(invoices.issuedAt), desc(documents.createdAt));

  const out: IncomeRow[] = [];
  const byMonth = new Map<string, number>();
  let paid = 0;
  let outstanding = 0;
  let overdue = 0;
  const currencyCounts = new Map<string, number>();

  for (const { document, invoice, clientName } of rows) {
    const status = derivedStatus(document, invoice, now);
    const balance = balanceDue(invoice);
    const late = status === "overdue" ? Math.max(0, daysBetween(invoice.dueAt, now)) : 0;

    if (document.status !== "draft") {
      paid += invoice.amountPaid;
      outstanding += balance;
      if (status === "overdue") overdue += balance;
    }
    currencyCounts.set(invoice.currency, (currencyCounts.get(invoice.currency) ?? 0) + 1);

    if (invoice.amountPaid > 0 && invoice.paidAt) {
      const key = utcMonthKey(invoice.paidAt);
      byMonth.set(key, (byMonth.get(key) ?? 0) + invoice.amountPaid);
    }

    out.push({
      documentId: document.id,
      number: invoice.number,
      title: document.title,
      clientName,
      currency: invoice.currency,
      subtotal: invoice.subtotal,
      tax: invoice.tax,
      total: invoice.total,
      amountPaid: invoice.amountPaid,
      balance,
      status,
      issuedAt: invoice.issuedAt,
      dueAt: invoice.dueAt,
      paidAt: invoice.paidAt,
      daysLate: late,
    });
  }

  const currency =
    [...currencyCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "USD";
  return { paid, outstanding, overdue, currency, rows: out, byMonth };
}

function daysBetween(from: Date | null, to: Date): number {
  if (!from) return 0;
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

/* ------------------------------------------------------------ CSV export --- */

export const CSV_HEADERS = [
  "invoice",
  "issued",
  "due",
  "client",
  "document",
  "currency",
  "subtotal",
  "tax",
  "total",
  "paid",
  "balance",
  "status",
  "paid_on",
] as const;

/** RFC 4180 field: quote when it contains a comma, quote, or newline. */
export function csvField(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function csvLine(fields: readonly unknown[]): string {
  return fields.map(csvField).join(",");
}

/** Decimal string for a spreadsheet: minor units → "4800.00" (no symbol). */
export function csvAmount(minor: number, currencyCode: string): string {
  const exponent = currencyCode.toUpperCase() === "JPY" ? 0 : 2;
  const factor = 10 ** exponent;
  return (minor / factor).toFixed(exponent);
}

function isoDate(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

/** The tax-season export: one row per invoice, amounts as plain decimals. */
export function incomeCsv(summary: IncomeSummary): string {
  const lines = [csvLine(CSV_HEADERS)];
  for (const row of summary.rows) {
    lines.push(
      csvLine([
        row.number,
        isoDate(row.issuedAt),
        isoDate(row.dueAt),
        row.clientName,
        row.title,
        row.currency,
        csvAmount(row.subtotal, row.currency),
        csvAmount(row.tax, row.currency),
        csvAmount(row.total, row.currency),
        csvAmount(row.amountPaid, row.currency),
        csvAmount(row.balance, row.currency),
        row.status,
        isoDate(row.paidAt),
      ]),
    );
  }
  return `${lines.join("\n")}\n`;
}

/* ------------------------------------------------------------ small reads --- */

export async function loadInvoice(documentId: string): Promise<Invoice | null> {
  const db = getDb();
  const [invoice] = await db.select().from(invoices).where(eq(invoices.documentId, documentId));
  return invoice ?? null;
}

export async function paymentsFor(documentId: string) {
  const db = getDb();
  return db
    .select()
    .from(payments)
    .where(eq(payments.invoiceDocumentId, documentId))
    .orderBy(asc(payments.paidAt));
}

/** Every invoice with money still owed, for the reminder sweep. */
export async function unpaidInvoices(now = new Date()) {
  const db = getDb();
  const rows = await db
    .select({ document: documents, invoice: invoices })
    .from(invoices)
    .innerJoin(documents, eq(documents.id, invoices.documentId))
    .where(
      and(
        isNotNull(invoices.dueAt),
        inArray(documents.status, ["sent", "viewed", "overdue"]),
        sql`${invoices.amountPaid} < ${invoices.total}`,
      ),
    )
    .orderBy(asc(invoices.dueAt));
  return rows.filter((r) => balanceDue(r.invoice) > 0 && r.invoice.dueAt! < now);
}

/** The pricing-table blocks of an invoice, for rendering the sheet. */
export async function invoiceBlocks(documentId: string) {
  const db = getDb();
  return db
    .select()
    .from(docBlocks)
    .where(eq(docBlocks.documentId, documentId))
    .orderBy(asc(docBlocks.position));
}

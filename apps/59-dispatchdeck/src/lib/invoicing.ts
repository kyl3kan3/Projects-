/**
 * src/lib/invoicing.ts
 *
 * Invoice numbering, sending, payment entry, and the factoring schedule.
 *
 * Numbering runs inside a transaction taking `max(number) + 1` for the carrier
 * with the unique index as the backstop, so two tabs building invoices at once
 * cannot both claim number 1004 — one of them retries.
 */

import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  accessorialLines,
  brokers,
  carriers,
  documents,
  factoringExports,
  invoices,
  loads,
  payments,
  stops,
  type Broker,
  type Invoice,
  type Load,
  type Payment,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { billedAccessorialsCents } from "@/lib/detention-clock";
import { isoDayIn } from "@/lib/format";
import { applyBps } from "@/lib/money";
import { sendInvoiceEmail } from "@/lib/email";
import { allocatePayment, ageInvoice, averageDaysToPay, factoringMath, type ReceivableInvoice } from "@/lib/receivables";
import { scheduleCsv, scheduleTotalCents, type FactoringFormat, type ScheduleRow } from "@/lib/factoring";
import { objectKey, putObject } from "@/lib/storage";

const FIRST_INVOICE_NUMBER = 1001;

/**
 * Build (or refresh) the invoice for a delivered load. Idempotent: an existing
 * draft is re-costed rather than duplicated, and a sent invoice is left alone.
 */
export async function buildInvoice(opts: {
  carrierId: string;
  loadId: string;
  actor: string;
}): Promise<Invoice> {
  const db = getDb();
  const [row] = await db
    .select({ load: loads, broker: brokers, carrier: carriers })
    .from(loads)
    .leftJoin(brokers, eq(loads.brokerId, brokers.id))
    .innerJoin(carriers, eq(loads.carrierId, carriers.id))
    .where(and(eq(loads.id, opts.loadId), eq(loads.carrierId, opts.carrierId)));
  if (!row) throw new Error("That load is not on this account.");
  if (row.load.status === "booked" || row.load.status === "cancelled") {
    throw new Error("Only a delivered load can be invoiced.");
  }

  const lines = await db
    .select({ amountCents: accessorialLines.amountCents, status: accessorialLines.status })
    .from(accessorialLines)
    .where(eq(accessorialLines.loadId, opts.loadId));
  const amountCents = row.load.rateCents + billedAccessorialsCents(lines);
  const termsDays = row.broker?.termsDays ?? row.carrier.settings?.invoiceTermsDays ?? 30;

  const [existing] = await db.select().from(invoices).where(eq(invoices.loadId, opts.loadId));
  if (existing) {
    if (existing.status !== "draft") return existing;
    const [updated] = await db
      .update(invoices)
      .set({ amountCents, termsDays, updatedAt: new Date() })
      .where(eq(invoices.id, existing.id))
      .returning();
    return updated;
  }

  const invoice = await db.transaction(async (tx) => {
    const [{ next }] = await tx
      .select({
        next: sql<number>`coalesce(max(${invoices.number}), ${FIRST_INVOICE_NUMBER - 1}) + 1`,
      })
      .from(invoices)
      .where(eq(invoices.carrierId, opts.carrierId));
    const [created] = await tx
      .insert(invoices)
      .values({
        carrierId: opts.carrierId,
        loadId: opts.loadId,
        number: Number(next),
        amountCents,
        termsDays,
        status: "draft",
      })
      .returning();
    return created;
  });

  await audit({
    carrierId: opts.carrierId,
    actor: opts.actor,
    action: "invoice.created",
    target: invoice.id,
    metadata: { number: invoice.number, amountCents },
  });
  return invoice;
}

export interface SendResult {
  sent: boolean;
  to: string;
  /** True when DRY_RUN or a missing Resend key meant it was logged, not sent. */
  logged: boolean;
  message: string;
}

/**
 * Send the packet. The completeness check has already run — this refuses if the
 * invoice has no packet, because a bare invoice with no rate con and no POD is
 * the exact thing this product exists to stop a carrier sending.
 */
export async function sendInvoice(opts: {
  carrierId: string;
  invoiceId: string;
  actor: string;
  to?: string;
}): Promise<SendResult> {
  const db = getDb();
  const [row] = await db
    .select({ invoice: invoices, load: loads, broker: brokers, carrier: carriers })
    .from(invoices)
    .innerJoin(loads, eq(invoices.loadId, loads.id))
    .innerJoin(carriers, eq(invoices.carrierId, carriers.id))
    .leftJoin(brokers, eq(loads.brokerId, brokers.id))
    .where(and(eq(invoices.id, opts.invoiceId), eq(invoices.carrierId, opts.carrierId)));
  if (!row) throw new Error("That invoice is not on this account.");
  if (!row.invoice.packetDocumentId) {
    throw new Error("Build the packet first — this app does not send a bare invoice.");
  }
  if (row.invoice.status === "paid") throw new Error("That invoice is already paid.");

  const to = (opts.to ?? row.broker?.contactEmail ?? "").trim();
  if (!to) throw new Error("No address to send to. Add a billing email to the broker book.");

  const [packet] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, row.invoice.packetDocumentId));

  const outcome = await sendInvoiceEmail({
    to,
    carrierName: row.carrier.name,
    invoiceNumber: row.invoice.number,
    amountCents: row.invoice.amountCents,
    reference: row.load.reference,
    termsDays: row.invoice.termsDays,
    packet: packet ? { key: packet.r2Key, filename: packet.filename } : null,
  });

  const now = new Date();
  await db
    .update(invoices)
    .set({ status: "sent", sentAt: row.invoice.sentAt ?? now, sentTo: to, updatedAt: now })
    .where(eq(invoices.id, row.invoice.id));
  if (row.load.status === "delivered") {
    await db.update(loads).set({ status: "invoiced", updatedAt: now }).where(eq(loads.id, row.load.id));
  }
  await audit({
    carrierId: opts.carrierId,
    actor: opts.actor,
    action: "invoice.sent",
    target: row.invoice.id,
    metadata: { to, logged: outcome.logged, number: row.invoice.number },
  });

  return {
    sent: true,
    to,
    logged: outcome.logged,
    message: outcome.logged
      ? `Packet logged for ${to} — DRY_RUN is on, so nothing left the building.`
      : `Packet sent to ${to}.`,
  };
}

/** Everything the receivables list needs, with paid totals joined in. */
export async function listReceivables(carrierId: string): Promise<
  Array<{
    invoice: Invoice;
    load: Load;
    broker: Broker | null;
    paidCents: number;
    payments: Payment[];
  }>
> {
  const db = getDb();
  const rows = await db
    .select({ invoice: invoices, load: loads, broker: brokers })
    .from(invoices)
    .innerJoin(loads, eq(invoices.loadId, loads.id))
    .leftJoin(brokers, eq(loads.brokerId, brokers.id))
    .where(eq(invoices.carrierId, carrierId))
    .orderBy(desc(invoices.number));
  if (rows.length === 0) return [];

  const paymentRows = await db
    .select()
    .from(payments)
    .where(inArray(payments.invoiceId, rows.map((r) => r.invoice.id)))
    .orderBy(asc(payments.receivedOn));

  const byInvoice = new Map<string, Payment[]>();
  for (const p of paymentRows) {
    const list = byInvoice.get(p.invoiceId) ?? [];
    list.push(p);
    byInvoice.set(p.invoiceId, list);
  }

  return rows.map((r) => {
    const list = byInvoice.get(r.invoice.id) ?? [];
    return {
      ...r,
      payments: list,
      paidCents: list.reduce((s, p) => s + p.amountCents, 0),
    };
  });
}

export function toReceivable(invoice: Invoice, paidCents: number): ReceivableInvoice {
  return {
    id: invoice.id,
    number: invoice.number,
    amountCents: invoice.amountCents,
    status: invoice.status,
    termsDays: invoice.termsDays,
    sentAt: invoice.sentAt,
    paidCents,
  };
}

export interface PaymentEntry {
  carrierId: string;
  amountCents: number;
  method: "ach" | "check" | "factoring_advance" | "factoring_settlement";
  receivedOn: string;
  note?: string | null;
  actor: string;
}

/**
 * Record one payment against one invoice.
 *
 * Overpayment is allowed and visible: the invoice closes and the excess is
 * reported as a credit, rather than being trimmed to fit (which loses money) or
 * rejected (which stops a carrier recording what actually landed).
 */
export async function recordPayment(
  entry: PaymentEntry & { invoiceId: string },
): Promise<{ paidInFull: boolean; creditCents: number }> {
  const db = getDb();
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, entry.invoiceId), eq(invoices.carrierId, entry.carrierId)));
  if (!invoice) throw new Error("That invoice is not on this account.");
  if (entry.amountCents <= 0) throw new Error("Enter the amount received");

  await db.insert(payments).values({
    carrierId: entry.carrierId,
    invoiceId: entry.invoiceId,
    amountCents: entry.amountCents,
    method: entry.method,
    receivedOn: entry.receivedOn,
    note: entry.note ?? null,
  });

  const settled = await settleInvoice(entry.carrierId, entry.invoiceId, entry.receivedOn);
  await audit({
    carrierId: entry.carrierId,
    actor: entry.actor,
    action: "payment.recorded",
    target: entry.invoiceId,
    metadata: { amountCents: entry.amountCents, method: entry.method, receivedOn: entry.receivedOn },
  });
  return settled;
}

/**
 * One lump sum from a broker, spread across their open invoices oldest first.
 * The remainder is returned so the screen can say "$180.00 could not be
 * applied" instead of the carrier discovering it never landed anywhere.
 */
export async function recordBrokerPayment(
  entry: PaymentEntry & { brokerId: string },
): Promise<{ applied: Array<{ invoiceNumber: number; amountCents: number }>; unappliedCents: number }> {
  const db = getDb();
  const rows = await db
    .select({ invoice: invoices })
    .from(invoices)
    .innerJoin(loads, eq(invoices.loadId, loads.id))
    .where(and(eq(invoices.carrierId, entry.carrierId), eq(loads.brokerId, entry.brokerId)));

  const paymentRows =
    rows.length === 0
      ? []
      : await db
          .select({ invoiceId: payments.invoiceId, amountCents: payments.amountCents })
          .from(payments)
          .where(inArray(payments.invoiceId, rows.map((r) => r.invoice.id)));

  const paidByInvoice = new Map<string, number>();
  for (const p of paymentRows) {
    paidByInvoice.set(p.invoiceId, (paidByInvoice.get(p.invoiceId) ?? 0) + p.amountCents);
  }

  const receivables = rows.map((r) => toReceivable(r.invoice, paidByInvoice.get(r.invoice.id) ?? 0));
  const { allocations, unappliedCents } = allocatePayment(entry.amountCents, receivables);

  for (const allocation of allocations) {
    await db.insert(payments).values({
      carrierId: entry.carrierId,
      invoiceId: allocation.invoiceId,
      amountCents: allocation.amountCents,
      method: entry.method,
      receivedOn: entry.receivedOn,
      note: entry.note ?? `Part of a ${(entry.amountCents / 100).toFixed(2)} payment`,
    });
    await settleInvoice(entry.carrierId, allocation.invoiceId, entry.receivedOn);
  }

  await audit({
    carrierId: entry.carrierId,
    actor: entry.actor,
    action: "payment.allocated",
    target: entry.brokerId,
    metadata: {
      amountCents: entry.amountCents,
      allocations: allocations.length,
      unappliedCents,
    },
  });

  return {
    applied: allocations.map((a) => ({ invoiceNumber: a.invoiceNumber, amountCents: a.amountCents })),
    unappliedCents,
  };
}

/** Close an invoice (and its load) once payments cover it. */
async function settleInvoice(
  carrierId: string,
  invoiceId: string,
  receivedOn: string,
): Promise<{ paidInFull: boolean; creditCents: number }> {
  const db = getDb();
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
  if (!invoice) return { paidInFull: false, creditCents: 0 };
  const rows = await db
    .select({ amountCents: payments.amountCents, method: payments.method })
    .from(payments)
    .where(eq(payments.invoiceId, invoiceId));
  const total = rows.reduce((s, p) => s + p.amountCents, 0);
  const paidInFull = total >= invoice.amountCents;
  const creditCents = Math.max(0, total - invoice.amountCents);

  if (paidInFull && invoice.status !== "paid") {
    // The paid date is the day the money landed, not the day someone typed it in.
    const paidAt = new Date(`${receivedOn}T12:00:00Z`);
    await db
      .update(invoices)
      .set({ status: "paid", paidAt, updatedAt: new Date() })
      .where(eq(invoices.id, invoiceId));
    await db
      .update(loads)
      .set({ status: "paid", updatedAt: new Date() })
      .where(and(eq(loads.id, invoice.loadId), eq(loads.carrierId, carrierId)));
  }

  // Factoring status follows the money: an advance means submitted-and-advanced,
  // a settlement payment means the reserve came back.
  const hasAdvance = rows.some((p) => p.method === "factoring_advance");
  const hasSettlement = rows.some((p) => p.method === "factoring_settlement");
  if (hasAdvance || hasSettlement) {
    await db
      .update(loads)
      .set({
        factored: true,
        factoringStatus: hasSettlement ? "settled" : "advanced",
        updatedAt: new Date(),
      })
      .where(eq(loads.id, invoice.loadId));
  }

  return { paidInFull, creditCents };
}

/** Flip the per-load factored flag from the load detail screen. */
export async function setFactored(opts: {
  carrierId: string;
  loadId: string;
  factored: boolean;
  actor: string;
}): Promise<void> {
  const db = getDb();
  await db
    .update(loads)
    .set({
      factored: opts.factored,
      factoringStatus: opts.factored ? "submitted" : null,
      updatedAt: new Date(),
    })
    .where(and(eq(loads.id, opts.loadId), eq(loads.carrierId, opts.carrierId)));
  await audit({
    carrierId: opts.carrierId,
    actor: opts.actor,
    action: opts.factored ? "load.factored" : "load.unfactored",
    target: opts.loadId,
  });
}

export interface ScheduleCandidate {
  invoice: Invoice;
  load: Load;
  broker: Broker | null;
  origin: { city: string; state: string } | null;
  destination: { city: string; state: string } | null;
  alreadyExported: boolean;
}

/** Sent, unpaid, factored invoices — the ones a schedule of accounts is built from. */
export async function scheduleCandidates(carrierId: string): Promise<ScheduleCandidate[]> {
  const db = getDb();
  const rows = await db
    .select({ invoice: invoices, load: loads, broker: brokers })
    .from(invoices)
    .innerJoin(loads, eq(invoices.loadId, loads.id))
    .leftJoin(brokers, eq(loads.brokerId, brokers.id))
    .where(
      and(
        eq(invoices.carrierId, carrierId),
        eq(loads.factored, true),
        inArray(invoices.status, ["draft", "sent"]),
      ),
    )
    .orderBy(asc(invoices.number));
  if (rows.length === 0) return [];

  const stopRows = await db
    .select()
    .from(stops)
    .where(inArray(stops.loadId, rows.map((r) => r.load.id)))
    .orderBy(asc(stops.seq));

  const byLoad = new Map<string, typeof stopRows>();
  for (const stop of stopRows) {
    const list = byLoad.get(stop.loadId) ?? [];
    list.push(stop);
    byLoad.set(stop.loadId, list);
  }

  return rows.map((r) => {
    const list = byLoad.get(r.load.id) ?? [];
    return {
      ...r,
      origin: list[0] ? { city: list[0].city, state: list[0].state } : null,
      destination: list.length > 0 ? { city: list[list.length - 1].city, state: list[list.length - 1].state } : null,
      alreadyExported: r.invoice.factoringExportId !== null,
    };
  });
}

export function toScheduleRow(candidate: ScheduleCandidate, timezone: string): ScheduleRow {
  return {
    invoiceNumber: candidate.invoice.number,
    invoiceDate: isoDayIn(candidate.invoice.sentAt ?? candidate.invoice.createdAt, timezone),
    amountCents: candidate.invoice.amountCents,
    debtorName: candidate.broker?.name ?? "Unknown broker",
    debtorMc: candidate.broker?.mcNumber ?? null,
    loadReference: candidate.load.reference,
    originCity: candidate.origin?.city ?? "",
    originState: candidate.origin?.state ?? "",
    destinationCity: candidate.destination?.city ?? "",
    destinationState: candidate.destination?.state ?? "",
    deliveryDate: candidate.load.deliveredAt ? isoDayIn(candidate.load.deliveredAt, timezone) : null,
    termsDays: candidate.invoice.termsDays,
    totalMiles: candidate.load.totalMiles,
  };
}

/**
 * Build a schedule of accounts. Records the advance against each invoice at the
 * carrier's configured advance rate, so the money the factor is about to wire is
 * on the books the moment the schedule is submitted rather than a week later.
 */
export async function buildFactoringExport(opts: {
  carrierId: string;
  invoiceIds: string[];
  format: FactoringFormat;
  actor: string;
  recordAdvance: boolean;
}): Promise<{ exportId: string; csv: string; totalCents: number; advanceCents: number }> {
  const db = getDb();
  if (opts.invoiceIds.length === 0) throw new Error("Pick at least one invoice.");

  const [carrier] = await db.select().from(carriers).where(eq(carriers.id, opts.carrierId));
  if (!carrier) throw new Error("Carrier not found.");

  const candidates = (await scheduleCandidates(opts.carrierId)).filter((c) =>
    opts.invoiceIds.includes(c.invoice.id),
  );
  if (candidates.length === 0) throw new Error("None of those invoices can go on a schedule.");

  const rows = candidates.map((c) => toScheduleRow(c, carrier.timezone));
  const csv = scheduleCsv(opts.format, rows);
  const totalCents = scheduleTotalCents(rows);
  const day = isoDayIn(new Date(), carrier.timezone);
  const filename = `schedule-of-accounts-${opts.format}-${day}.csv`;
  const key = objectKey(opts.carrierId, null, filename);
  await putObject(key, new TextEncoder().encode(csv), "text/csv");

  const advanceBps = carrier.settings?.factoringAdvanceBps ?? 9_700;
  let advanceCents = 0;

  const exportId = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(factoringExports)
      .values({
        carrierId: opts.carrierId,
        format: opts.format,
        invoiceIds: candidates.map((c) => c.invoice.id),
        csvR2Key: key,
        totalCents,
      })
      .returning({ id: factoringExports.id });

    for (const candidate of candidates) {
      await tx
        .update(invoices)
        .set({ factoringExportId: created.id, updatedAt: new Date() })
        .where(eq(invoices.id, candidate.invoice.id));
      await tx
        .update(loads)
        .set({ factoringStatus: opts.recordAdvance ? "advanced" : "submitted", updatedAt: new Date() })
        .where(eq(loads.id, candidate.load.id));
      if (opts.recordAdvance) {
        const amount = applyBps(candidate.invoice.amountCents, advanceBps);
        advanceCents += amount;
        await tx.insert(payments).values({
          carrierId: opts.carrierId,
          invoiceId: candidate.invoice.id,
          amountCents: amount,
          method: "factoring_advance",
          receivedOn: day,
          note: `Advance at ${(advanceBps / 100).toFixed(2)}% on schedule ${created.id.slice(0, 8)}`,
        });
      }
    }
    return created.id;
  });

  await audit({
    carrierId: opts.carrierId,
    actor: opts.actor,
    action: "factoring.exported",
    target: exportId,
    metadata: { format: opts.format, invoices: candidates.length, totalCents, advanceCents },
  });

  return { exportId, csv, totalCents, advanceCents };
}

export async function listFactoringExports(carrierId: string) {
  return getDb()
    .select()
    .from(factoringExports)
    .where(eq(factoringExports.carrierId, carrierId))
    .orderBy(desc(factoringExports.exportedAt))
    .limit(50);
}

/** Nightly: recompute every broker's average days to pay from real payments. */
export async function rollupBrokerStats(carrierId?: string): Promise<{ brokers: number }> {
  const db = getDb();
  const brokerRows = carrierId
    ? await db.select().from(brokers).where(eq(brokers.carrierId, carrierId))
    : await db.select().from(brokers);

  for (const broker of brokerRows) {
    // Only invoices that were actually sent and actually paid count.
    const rows = await db
      .select({ sentAt: invoices.sentAt, paidAt: invoices.paidAt })
      .from(invoices)
      .innerJoin(loads, eq(invoices.loadId, loads.id))
      .where(
        and(
          eq(loads.brokerId, broker.id),
          eq(invoices.status, "paid"),
          isNotNull(invoices.sentAt),
          isNotNull(invoices.paidAt),
        ),
      );
    const { averageDays, sampleSize } = averageDaysToPay(rows);
    await db
      .update(brokers)
      .set({ avgDaysToPay: averageDays, paidInvoiceCount: sampleSize, updatedAt: new Date() })
      .where(eq(brokers.id, broker.id));
  }
  return { brokers: brokerRows.length };
}

export { ageInvoice, factoringMath };

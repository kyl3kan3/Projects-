/**
 * src/lib/receivables.ts
 *
 * The money side of an invoice, as pure functions: what is still outstanding,
 * whether it is late *as of now* rather than as of whenever a job last ran, how
 * a lump payment spreads across a broker's open invoices, and what a factor
 * actually kept.
 *
 * Two rules this file exists to enforce:
 *
 *  1. **Nothing renders a stored "overdue" flag.** Lateness is derived from
 *     `sent_at + terms` against the current clock, every time it is displayed.
 *     A stored status column reconciled by a nightly job shows "Due" on an
 *     invoice 212 days late, which is worse than showing nothing.
 *  2. **A payment cascades oldest-first.** A broker who wires $4,200 covering
 *     three loads must not leave two of them looking delinquent, and the
 *     leftover must be visible rather than silently absorbed.
 */

export type InvoiceStatus = "draft" | "sent" | "paid" | "void";

export interface ReceivableInvoice {
  id: string;
  number: number;
  amountCents: number;
  status: InvoiceStatus;
  termsDays: number;
  sentAt: Date | string | null;
  paidCents: number;
}

export interface AgeState {
  /** Cents still owed; never negative. */
  outstandingCents: number;
  /** Cents received beyond the invoice total. */
  creditCents: number;
  /** Null until the invoice is sent. */
  dueOn: Date | null;
  /** Days past due as of now; 0 when inside terms or unsent. */
  daysLate: number;
  /** Days since it was sent; null when unsent. */
  daysOutstanding: number | null;
  /** What the placard reads. Derived, never stored. */
  label: "Draft" | "Sent" | "Due today" | "Overdue" | "Paid" | "Void";
  overdue: boolean;
}

const DAY_MS = 86_400_000;

export function ageInvoice(invoice: ReceivableInvoice, now: Date = new Date()): AgeState {
  const paid = Math.max(0, invoice.paidCents);
  const outstandingCents = Math.max(0, invoice.amountCents - paid);
  const creditCents = Math.max(0, paid - invoice.amountCents);
  const sentAt = invoice.sentAt ? new Date(invoice.sentAt) : null;
  const dueOn = sentAt ? new Date(sentAt.getTime() + invoice.termsDays * DAY_MS) : null;

  if (invoice.status === "void") {
    return { outstandingCents: 0, creditCents, dueOn, daysLate: 0, daysOutstanding: null, label: "Void", overdue: false };
  }
  if (invoice.status === "paid" || outstandingCents === 0) {
    const daysOutstanding = sentAt ? Math.floor((now.getTime() - sentAt.getTime()) / DAY_MS) : null;
    return { outstandingCents: 0, creditCents, dueOn, daysLate: 0, daysOutstanding, label: "Paid", overdue: false };
  }
  if (invoice.status === "draft" || !sentAt || !dueOn) {
    return { outstandingCents, creditCents, dueOn, daysLate: 0, daysOutstanding: null, label: "Draft", overdue: false };
  }

  const daysOutstanding = Math.floor((now.getTime() - sentAt.getTime()) / DAY_MS);
  const msLate = now.getTime() - dueOn.getTime();
  if (msLate < 0) {
    return { outstandingCents, creditCents, dueOn, daysLate: 0, daysOutstanding, label: "Sent", overdue: false };
  }
  const daysLate = Math.floor(msLate / DAY_MS);
  return {
    outstandingCents,
    creditCents,
    dueOn,
    daysLate,
    daysOutstanding,
    label: daysLate === 0 ? "Due today" : "Overdue",
    overdue: daysLate > 0,
  };
}

export interface Allocation {
  invoiceId: string;
  invoiceNumber: number;
  amountCents: number;
}

export interface AllocationResult {
  allocations: Allocation[];
  /** Money with nowhere to go. Surfaced, never quietly dropped. */
  unappliedCents: number;
}

/**
 * Spread one received amount across open invoices, oldest sent first. An
 * invoice with no send date sorts last: money goes against real receivables
 * before drafts.
 */
export function allocatePayment(
  amountCents: number,
  invoices: ReceivableInvoice[],
  now: Date = new Date(),
): AllocationResult {
  let remaining = Math.max(0, Math.round(amountCents));
  const open = invoices
    .filter((i) => i.status !== "void")
    .map((i) => ({ invoice: i, state: ageInvoice(i, now) }))
    .filter((row) => row.state.outstandingCents > 0)
    .sort((a, b) => {
      const at = a.invoice.sentAt ? new Date(a.invoice.sentAt).getTime() : Number.MAX_SAFE_INTEGER;
      const bt = b.invoice.sentAt ? new Date(b.invoice.sentAt).getTime() : Number.MAX_SAFE_INTEGER;
      if (at !== bt) return at - bt;
      return a.invoice.number - b.invoice.number;
    });

  const allocations: Allocation[] = [];
  for (const row of open) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, row.state.outstandingCents);
    allocations.push({
      invoiceId: row.invoice.id,
      invoiceNumber: row.invoice.number,
      amountCents: take,
    });
    remaining -= take;
  }
  return { allocations, unappliedCents: remaining };
}

/**
 * Average days-to-pay for a broker, from real payments only. Invoices that were
 * never sent, never paid, or paid before they were sent (a data error) are
 * excluded, and the count is returned so the UI can say "from 3 paid invoices"
 * instead of implying a statistic it does not have.
 */
export function averageDaysToPay(
  rows: Array<{ sentAt: Date | string | null; paidAt: Date | string | null }>,
): { averageDays: number | null; sampleSize: number } {
  const spans: number[] = [];
  for (const row of rows) {
    if (!row.sentAt || !row.paidAt) continue;
    const sent = new Date(row.sentAt).getTime();
    const paid = new Date(row.paidAt).getTime();
    if (!Number.isFinite(sent) || !Number.isFinite(paid) || paid < sent) continue;
    spans.push(Math.round((paid - sent) / DAY_MS));
  }
  if (spans.length === 0) return { averageDays: null, sampleSize: 0 };
  const total = spans.reduce((a, b) => a + b, 0);
  return { averageDays: Math.round(total / spans.length), sampleSize: spans.length };
}

export interface FactoringMath {
  /** What the factor advanced up front. */
  advanceCents: number;
  /** The reserve released at settlement. */
  settlementCents: number;
  /** Face value minus everything received — the factor's cut. */
  feeCents: number;
  /** Null until the reserve has actually been released. */
  effectiveRateBps: number | null;
  settled: boolean;
}

/**
 * What the factor kept. Only computable once the reserve is released: until
 * then the difference between face value and the advance is a reserve, not a
 * fee, and calling it a fee overstates the cost of factoring.
 */
export function factoringMath(
  invoice: { amountCents: number },
  payments: Array<{ amountCents: number; method: string }>,
): FactoringMath {
  const advanceCents = sumBy(payments, "factoring_advance");
  const settlementCents = sumBy(payments, "factoring_settlement");
  const settled = settlementCents > 0;
  const received = advanceCents + settlementCents;
  const feeCents = settled ? Math.max(0, invoice.amountCents - received) : 0;
  return {
    advanceCents,
    settlementCents,
    feeCents,
    effectiveRateBps:
      settled && invoice.amountCents > 0
        ? Math.round((feeCents / invoice.amountCents) * 10_000)
        : null,
    settled,
  };
}

function sumBy(payments: Array<{ amountCents: number; method: string }>, method: string): number {
  return payments.filter((p) => p.method === method).reduce((sum, p) => sum + p.amountCents, 0);
}

/**
 * Aging, DSO and the cash-in forecast — all pure.
 *
 * Everything the Monday-morning money screen shows is computed here from plain
 * arrays, so the arithmetic can be checked against a hand calculation in a test
 * rather than trusted because a dashboard looked plausible.
 *
 * Two decisions worth stating:
 *
 *  - **Nothing reads a stored status column.** Aging is derived from the due
 *    date and the balance as of the moment you ask. A stored `status` that a
 *    sweep reconciles goes stale the second the sweep is late, and a screen that
 *    says "Due" on an invoice 212 days overdue is worse than no screen.
 *
 *  - **The forecast is honest about where each dollar comes from.** Every
 *    expected receipt carries its basis — a promise from the client, that
 *    client's historical behaviour, or nothing but the terms on the invoice —
 *    and a confidence. A promise from a 95%-reliable client is nearly cash; the
 *    same words from a 40% client are hope, and the forecast must not pretend
 *    otherwise.
 */

import {
  addDays,
  agingBucket,
  compareIso,
  daysBetween,
  daysOverdue,
  maxIso,
  weekStart,
  type AgingBucket,
  type IsoDate,
} from "@/lib/dates";

/* ----------------------------------------------------------------- aging --- */

export interface AgingInvoice {
  dueAt: IsoDate;
  balanceCents: number;
}

export interface BucketTotals {
  amountCents: number;
  count: number;
}

export type AgingBuckets = Record<AgingBucket, BucketTotals>;

export interface AgingReport {
  buckets: AgingBuckets;
  outstandingCents: number;
  invoiceCount: number;
  /** Anything at all past its due date. */
  overdueCents: number;
  overdueCount: number;
}

export function emptyBuckets(): AgingBuckets {
  return {
    current: { amountCents: 0, count: 0 },
    d31to60: { amountCents: 0, count: 0 },
    d61to90: { amountCents: 0, count: 0 },
    d90plus: { amountCents: 0, count: 0 },
  };
}

/**
 * The aging report. "current" holds everything from not-yet-due to 30 days
 * late, matching the 0–30 column every accountant expects.
 */
export function agingReport(invoices: readonly AgingInvoice[], asOf: IsoDate): AgingReport {
  const buckets = emptyBuckets();
  let outstandingCents = 0;
  let invoiceCount = 0;
  let overdueCents = 0;
  let overdueCount = 0;

  for (const invoice of invoices) {
    const balance = Math.max(0, Math.round(invoice.balanceCents) || 0);
    if (balance <= 0) continue;
    const late = daysOverdue(invoice.dueAt, asOf);
    const bucket = agingBucket(late);
    buckets[bucket].amountCents += balance;
    buckets[bucket].count += 1;
    outstandingCents += balance;
    invoiceCount += 1;
    if (late > 0) {
      overdueCents += balance;
      overdueCount += 1;
    }
  }
  return { buckets, outstandingCents, invoiceCount, overdueCents, overdueCount };
}

export const BUCKET_LABELS: Record<AgingBucket, string> = {
  current: "0–30",
  d31to60: "31–60",
  d61to90: "61–90",
  d90plus: "90+",
};

/* ------------------------------------------------------------------- DSO --- */

export interface HistoryInvoice {
  id: string;
  issuedAt: IsoDate;
  amountCents: number;
}

export interface HistoryPayment {
  invoiceId: string;
  paidAt: IsoDate;
  amountCents: number;
}

/**
 * Days sales outstanding as of a date, over a trailing window:
 *
 *     DSO = (receivables outstanding on that date / invoiced in the window)
 *           × window length
 *
 * Returns null rather than 0 when nothing was invoiced in the window — an
 * agency between projects has no DSO, and reporting zero would read as
 * "everyone pays instantly".
 */
export function dsoAsOf(
  invoices: readonly HistoryInvoice[],
  payments: readonly HistoryPayment[],
  asOf: IsoDate,
  windowDays = 90,
): number | null {
  const windowStart = addDays(asOf, -windowDays);

  const paidByInvoice = new Map<string, number>();
  for (const payment of payments) {
    if (compareIso(payment.paidAt, asOf) > 0) continue; // not yet received
    paidByInvoice.set(
      payment.invoiceId,
      (paidByInvoice.get(payment.invoiceId) ?? 0) + payment.amountCents,
    );
  }

  let receivables = 0;
  let invoicedInWindow = 0;
  for (const invoice of invoices) {
    if (compareIso(invoice.issuedAt, asOf) > 0) continue; // not raised yet
    const paid = paidByInvoice.get(invoice.id) ?? 0;
    receivables += Math.max(0, invoice.amountCents - paid);
    if (compareIso(invoice.issuedAt, windowStart) > 0) invoicedInWindow += invoice.amountCents;
  }

  if (invoicedInWindow <= 0) return null;
  return Math.round((receivables / invoicedInWindow) * windowDays);
}

export interface DsoPoint {
  asOf: IsoDate;
  dso: number | null;
}

/** A monthly DSO series ending today — the hero stat's trend arrow. */
export function dsoSeries(
  invoices: readonly HistoryInvoice[],
  payments: readonly HistoryPayment[],
  asOf: IsoDate,
  months = 6,
  windowDays = 90,
): DsoPoint[] {
  const points: DsoPoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const at = addDays(asOf, -i * 30);
    points.push({ asOf: at, dso: dsoAsOf(invoices, payments, at, windowDays) });
  }
  return points;
}

/** The change since the previous sample: negative is good news. */
export function dsoDelta(series: readonly DsoPoint[]): number | null {
  const withValues = series.filter((p) => p.dso !== null);
  if (withValues.length < 2) return null;
  const last = withValues[withValues.length - 1].dso!;
  const previous = withValues[withValues.length - 2].dso!;
  return last - previous;
}

/* -------------------------------------------------------- client behaviour --- */

export interface SettledInvoice {
  issuedAt: IsoDate;
  dueAt: IsoDate;
  paidAt: IsoDate;
}

export interface ClientBehaviour {
  /** Average days from invoice date to payment. Null with no paid history. */
  avgDaysToPay: number | null;
  /** 0–100: share of invoices settled on or before their due date. */
  reliabilityScore: number | null;
  paidInvoiceCount: number;
  /** Average days late (0 for a client who pays on time). */
  avgDaysLate: number | null;
}

/**
 * What a client's own history says about them. Reliability is "paid by the
 * agreed date", not "paid eventually" — a client who always pays 40 days late
 * is perfectly predictable but not reliable, and the forecast needs both facts.
 */
export function clientBehaviour(settled: readonly SettledInvoice[]): ClientBehaviour {
  if (settled.length === 0) {
    return { avgDaysToPay: null, reliabilityScore: null, paidInvoiceCount: 0, avgDaysLate: null };
  }
  let daysToPay = 0;
  let daysLate = 0;
  let onTime = 0;
  for (const invoice of settled) {
    daysToPay += Math.max(0, daysBetween(invoice.issuedAt, invoice.paidAt));
    const late = Math.max(0, daysBetween(invoice.dueAt, invoice.paidAt));
    daysLate += late;
    if (late === 0) onTime += 1;
  }
  const n = settled.length;
  return {
    avgDaysToPay: Math.round(daysToPay / n),
    reliabilityScore: Math.round((onTime / n) * 100),
    paidInvoiceCount: n,
    avgDaysLate: Math.round(daysLate / n),
  };
}

/** "pays in 47d · 62% on time" — the behaviour line on a client row. */
export function describeBehaviour(behaviour: ClientBehaviour): string {
  if (behaviour.paidInvoiceCount === 0) return "no payment history yet";
  const parts = [`pays in ${behaviour.avgDaysToPay}d`];
  if (behaviour.reliabilityScore !== null) parts.push(`${behaviour.reliabilityScore}% on time`);
  parts.push(`${behaviour.paidInvoiceCount} paid`);
  return parts.join(" · ");
}

/* -------------------------------------------------------------- forecast --- */

export type ForecastBasis = "promise" | "behaviour" | "terms";

export interface ForecastInvoice {
  id: string;
  number: string;
  clientName: string;
  issuedAt: IsoDate;
  dueAt: IsoDate;
  balanceCents: number;
  /** The date of an open promise-to-pay, if there is one. */
  promisedFor?: IsoDate | null;
  /** From clientBehaviour(), null for a client with no history. */
  avgDaysToPay?: number | null;
  reliabilityScore?: number | null;
  paidInvoiceCount?: number;
}

export interface ExpectedReceipt {
  invoiceId: string;
  number: string;
  clientName: string;
  expectedOn: IsoDate;
  amountCents: number;
  /** 0–100. */
  confidence: number;
  basis: ForecastBasis;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * When one invoice is actually expected to land, and how much to believe it.
 *
 * Never in the past: an expected date behind today is not a forecast, it is a
 * missed one, so anything already elapsed rolls to a week out with its
 * confidence cut.
 */
export function expectedReceipt(invoice: ForecastInvoice, asOf: IsoDate): ExpectedReceipt {
  const base = {
    invoiceId: invoice.id,
    number: invoice.number,
    clientName: invoice.clientName,
    amountCents: Math.max(0, Math.round(invoice.balanceCents) || 0),
  };

  let on: IsoDate;
  let confidence: number;
  let basis: ForecastBasis;

  if (invoice.promisedFor) {
    on = maxIso(invoice.promisedFor, asOf);
    // A promise is worth what the client's record says it is worth.
    confidence = clamp(invoice.reliabilityScore ?? 60, 35, 95);
    basis = "promise";
  } else if (invoice.avgDaysToPay != null && (invoice.paidInvoiceCount ?? 0) > 0) {
    on = addDays(invoice.issuedAt, invoice.avgDaysToPay);
    const history = clamp(40 + Math.min(invoice.paidInvoiceCount ?? 0, 10) * 3, 40, 70);
    confidence = Math.round((history + clamp(invoice.reliabilityScore ?? 50, 0, 100)) / 2);
    basis = "behaviour";
  } else {
    on = invoice.dueAt;
    confidence = 50;
    basis = "terms";
  }

  if (compareIso(on, asOf) < 0) {
    on = addDays(asOf, 7);
    confidence = Math.round(confidence * 0.6);
  }
  return { ...base, expectedOn: on, confidence: clamp(confidence, 5, 95), basis };
}

export interface ForecastWeek {
  weekStart: IsoDate;
  expectedCents: number;
  /** Amount-weighted mean confidence, 0–100. */
  confidence: number;
  receipts: ExpectedReceipt[];
}

export interface Forecast {
  weeks: ForecastWeek[];
  /** Everything expected inside the horizon. */
  totalCents: number;
  /** Expected cents × confidence — the number to actually plan around. */
  weightedCents: number;
  invoiceCount: number;
  promiseCount: number;
  /** Money expected after the last column. */
  beyondHorizonCents: number;
}

/**
 * Weekly expected receipts, `weeks` columns from the Monday of the current week.
 * Anything expected beyond the horizon is reported separately rather than piled
 * onto the last column, which would make the final bar a lie.
 */
export function buildForecast(
  invoices: readonly ForecastInvoice[],
  asOf: IsoDate,
  weeks = 8,
): Forecast {
  const firstWeek = weekStart(asOf);
  const columns: ForecastWeek[] = Array.from({ length: weeks }, (_, i) => ({
    weekStart: addDays(firstWeek, i * 7),
    expectedCents: 0,
    confidence: 0,
    receipts: [],
  }));
  const byWeek = new Map(columns.map((c) => [c.weekStart, c]));
  const horizonEnd = addDays(firstWeek, weeks * 7);

  let totalCents = 0;
  let weightedCents = 0;
  let promiseCount = 0;
  let beyondHorizonCents = 0;
  let invoiceCount = 0;

  for (const invoice of invoices) {
    if ((invoice.balanceCents ?? 0) <= 0) continue;
    const receipt = expectedReceipt(invoice, asOf);
    invoiceCount += 1;
    if (receipt.basis === "promise") promiseCount += 1;

    if (compareIso(receipt.expectedOn, horizonEnd) >= 0) {
      beyondHorizonCents += receipt.amountCents;
      continue;
    }
    const column = byWeek.get(weekStart(receipt.expectedOn));
    if (!column) {
      beyondHorizonCents += receipt.amountCents;
      continue;
    }
    column.receipts.push(receipt);
    column.expectedCents += receipt.amountCents;
    totalCents += receipt.amountCents;
    weightedCents += Math.round((receipt.amountCents * receipt.confidence) / 100);
  }

  for (const column of columns) {
    if (column.expectedCents <= 0) continue;
    const weighted = column.receipts.reduce(
      (sum, r) => sum + r.amountCents * r.confidence,
      0,
    );
    column.confidence = Math.round(weighted / column.expectedCents);
    column.receipts.sort((a, b) => compareIso(a.expectedOn, b.expectedOn));
  }

  return {
    weeks: columns,
    totalCents,
    weightedCents,
    invoiceCount,
    promiseCount,
    beyondHorizonCents,
  };
}

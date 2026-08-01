/**
 * Dashboard reads: the aging screen, the needs-attention feed, the forecast, and
 * the client behaviour list.
 *
 * Every figure here is derived as-of-now from balances and dates. Nothing renders
 * a stored status column, and the ladder line on each row comes from the same
 * `decideNextRung` the sweep uses — so a screen can never promise a nudge the
 * engine would refuse to send, or describe an invoice as "due" when it is 212
 * days late.
 */

import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  clients,
  firms,
  forecastSnapshots,
  invoices,
  messages,
  payments,
  promises,
  replies,
  sequenceRuns,
  type Client,
  type Firm,
  type Invoice,
  type PromiseRow,
  type Reply,
  type SequenceRun,
} from "@/db/schema";
import {
  agingReport,
  buildForecast,
  clientBehaviour,
  dsoAsOf,
  dsoDelta,
  dsoSeries,
  type AgingReport,
  type ClientBehaviour,
  type Forecast,
  type ForecastInvoice,
} from "@/lib/analytics";
import { daysOverdue, today, type IsoDate } from "@/lib/dates";
import { urgencyScore, type LadderStatusLine } from "@/lib/ladder";
import { OPEN_STATUSES, describeInvoiceState, refreshInvoiceStatuses } from "@/lib/invoices";
import { activeSequence, statusLineFor } from "@/lib/sequences";
import { pendingApprovals } from "@/lib/sequences";
import { plan } from "@/lib/plans";

export interface AttentionRow {
  invoice: Invoice;
  client: Client;
  run: SequenceRun | null;
  promise: PromiseRow | null;
  daysLate: number;
  stateLine: string;
  ladder: LadderStatusLine;
  urgency: number;
}

export interface DashboardData {
  firm: Firm;
  asOf: IsoDate;
  aging: AgingReport;
  dso: number | null;
  dsoChange: number | null;
  dsoTrend: { asOf: IsoDate; dso: number | null }[];
  attention: AttentionRow[];
  settled: AttentionRow[];
  approvalsWaiting: number;
  clientCount: number;
  /** Slowest payer by average days-to-pay, for the aging-audit line. */
  slowestPayer: { name: string; avgDaysToPay: number } | null;
}

/**
 * Everything the home screen needs, in one pass.
 *
 * `refreshInvoiceStatuses` is called here as well as in the sweep: the cache
 * converges on every dashboard read, so a cron outage degrades query speed, not
 * correctness.
 */
export async function loadDashboard(firm: Firm): Promise<DashboardData> {
  const db = getDb();
  const asOf = today();
  await refreshInvoiceStatuses(firm.id);

  const rows = await db
    .select({ invoice: invoices, client: clients, run: sequenceRuns })
    .from(invoices)
    .innerJoin(clients, eq(clients.id, invoices.clientId))
    .leftJoin(sequenceRuns, eq(sequenceRuns.invoiceId, invoices.id))
    .where(and(eq(invoices.firmId, firm.id), inArray(invoices.status, [...OPEN_STATUSES, "disputed"])));

  const openPromiseRows = await db
    .select()
    .from(promises)
    .where(and(eq(promises.firmId, firm.id), eq(promises.status, "open")));
  const promiseByInvoice = new Map(openPromiseRows.map((p) => [p.invoiceId, p]));

  const sequence = await activeSequence(firm.id);

  const attention: AttentionRow[] = rows.map(({ invoice, client, run }) => {
    const promise = promiseByInvoice.get(invoice.id) ?? null;
    const ladder = statusLineFor(
      {
        firm,
        invoice,
        client,
        sequence,
        run:
          run ??
          ({
            highestStepSent: -1,
            state: "scheduled",
            escalateAfterBrokenPromise: false,
          } as SequenceRun),
        hasOpenPromise: Boolean(promise),
      },
      asOf,
    );
    const daysLate = daysOverdue(invoice.dueAt, asOf);
    return {
      invoice,
      client,
      run: run ?? null,
      promise,
      daysLate,
      stateLine: describeInvoiceState(invoice, asOf),
      ladder,
      urgency: urgencyScore({
        daysLate,
        stepsSent: ladder.stepsSent,
        hold: ladder.hold,
        balanceCents: invoice.balanceCents,
      }),
    };
  });
  attention.sort((a, b) => b.urgency - a.urgency);

  const settledRows = await db
    .select({ invoice: invoices, client: clients })
    .from(invoices)
    .innerJoin(clients, eq(clients.id, invoices.clientId))
    .where(and(eq(invoices.firmId, firm.id), eq(invoices.status, "paid")))
    .orderBy(invoices.paidAt)
    .limit(8);

  const history = await db
    .select({ id: invoices.id, issuedAt: invoices.issuedAt, amountCents: invoices.amountCents })
    .from(invoices)
    .where(eq(invoices.firmId, firm.id));
  const paymentRows = await db
    .select({ invoiceId: payments.invoiceId, paidAt: payments.paidAt, amountCents: payments.amountCents })
    .from(payments)
    .where(eq(payments.firmId, firm.id));

  const trend = dsoSeries(history, paymentRows, asOf, 6);
  const clientRows = await db.select().from(clients).where(eq(clients.firmId, firm.id));
  const slowest = clientRows
    .filter((c) => c.avgDaysToPay != null && c.paidInvoiceCount > 0)
    .sort((a, b) => (b.avgDaysToPay ?? 0) - (a.avgDaysToPay ?? 0))[0];

  return {
    firm,
    asOf,
    aging: agingReport(
      rows.map(({ invoice }) => ({ dueAt: invoice.dueAt, balanceCents: invoice.balanceCents })),
      asOf,
    ),
    dso: dsoAsOf(history, paymentRows, asOf, 90),
    dsoChange: dsoDelta(trend),
    dsoTrend: trend,
    attention,
    settled: settledRows.map(({ invoice, client }) => ({
      invoice,
      client,
      run: null,
      promise: null,
      daysLate: 0,
      stateLine: describeInvoiceState(invoice, asOf),
      ladder: { label: "settled", stepsSent: 0, totalSteps: 0, nextOn: null, hold: "settled" },
      urgency: 0,
    })),
    approvalsWaiting: (await pendingApprovals(firm.id)).length,
    clientCount: clientRows.length,
    slowestPayer:
      slowest && slowest.avgDaysToPay != null
        ? { name: slowest.name, avgDaysToPay: slowest.avgDaysToPay }
        : null,
  };
}

/* -------------------------------------------------------------- forecast --- */

/** Build the forecast from live data (no snapshot required). */
export async function loadForecast(firm: Firm, weeks = 8): Promise<Forecast> {
  const db = getDb();
  const asOf = today();
  const rows = await db
    .select({ invoice: invoices, client: clients })
    .from(invoices)
    .innerJoin(clients, eq(clients.id, invoices.clientId))
    .where(and(eq(invoices.firmId, firm.id), inArray(invoices.status, OPEN_STATUSES)));

  const openPromiseRows = await db
    .select()
    .from(promises)
    .where(and(eq(promises.firmId, firm.id), eq(promises.status, "open")));
  const promiseByInvoice = new Map(openPromiseRows.map((p) => [p.invoiceId, p]));

  const forecastInvoices: ForecastInvoice[] = rows.map(({ invoice, client }) => ({
    id: invoice.id,
    number: invoice.number,
    clientName: client.name,
    issuedAt: invoice.issuedAt,
    dueAt: invoice.dueAt,
    balanceCents: invoice.balanceCents,
    promisedFor: promiseByInvoice.get(invoice.id)?.promisedFor ?? null,
    avgDaysToPay: client.avgDaysToPay,
    reliabilityScore: client.reliabilityScore,
    paidInvoiceCount: client.paidInvoiceCount,
  }));

  return buildForecast(forecastInvoices, asOf, weeks);
}

/** Persist the forecast so its accuracy can be audited later. */
export async function storeForecastSnapshot(firm: Firm): Promise<number> {
  const db = getDb();
  const forecast = await loadForecast(firm, 8);
  let written = 0;
  for (const week of forecast.weeks) {
    await db
      .insert(forecastSnapshots)
      .values({
        firmId: firm.id,
        weekStart: week.weekStart,
        expectedCents: week.expectedCents,
        confidenceBp: week.confidence * 100,
        basis: week.receipts.map((r) => ({
          invoiceId: r.invoiceId,
          number: r.number,
          clientName: r.clientName,
          expectedOn: r.expectedOn,
          amountCents: r.amountCents,
          confidence: r.confidence,
          basis: r.basis,
        })),
        computedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [forecastSnapshots.firmId, forecastSnapshots.weekStart],
        set: {
          expectedCents: week.expectedCents,
          confidenceBp: week.confidence * 100,
          basis: week.receipts.map((r) => ({
            invoiceId: r.invoiceId,
            number: r.number,
            clientName: r.clientName,
            expectedOn: r.expectedOn,
            amountCents: r.amountCents,
            confidence: r.confidence,
            basis: r.basis,
          })),
          computedAt: new Date(),
        },
      });
    written += 1;
  }
  return written;
}

/* --------------------------------------------------------------- clients --- */

export interface ClientRow {
  client: Client;
  behaviour: ClientBehaviour;
  outstandingCents: number;
  openCount: number;
  oldestDaysLate: number;
}

export async function loadClientRows(firm: Firm): Promise<ClientRow[]> {
  const db = getDb();
  const asOf = today();
  const clientRows = await db
    .select()
    .from(clients)
    .where(eq(clients.firmId, firm.id))
    .orderBy(clients.name);

  const invoiceRows = await db
    .select()
    .from(invoices)
    .where(eq(invoices.firmId, firm.id));

  const byClient = new Map<string, Invoice[]>();
  for (const invoice of invoiceRows) {
    const list = byClient.get(invoice.clientId) ?? [];
    list.push(invoice);
    byClient.set(invoice.clientId, list);
  }

  return clientRows.map((client) => {
    const list = byClient.get(client.id) ?? [];
    const open = list.filter((i) => OPEN_STATUSES.includes(i.status) && i.balanceCents > 0);
    const settled = list
      .filter((i) => i.status === "paid" && i.paidAt)
      .map((i) => ({ issuedAt: i.issuedAt, dueAt: i.dueAt, paidAt: i.paidAt! }));
    return {
      client,
      behaviour: clientBehaviour(settled),
      outstandingCents: open.reduce((sum, i) => sum + i.balanceCents, 0),
      openCount: open.length,
      oldestDaysLate: open.reduce((worst, i) => Math.max(worst, daysOverdue(i.dueAt, asOf)), 0),
    };
  });
}

/* -------------------------------------------------------- invoice detail --- */

export interface InvoiceDetail {
  invoice: Invoice;
  client: Client;
  run: SequenceRun | null;
  ladder: LadderStatusLine;
  timeline: Awaited<ReturnType<typeof loadMessages>>;
  promiseRows: PromiseRow[];
  replyRows: Reply[];
  paymentRows: Awaited<ReturnType<typeof loadPayments>>;
  stateLine: string;
  daysLate: number;
  asOf: IsoDate;
  planAllowsPromises: boolean;
}

async function loadMessages(invoiceId: string) {
  const db = getDb();
  return db
    .select()
    .from(messages)
    .where(eq(messages.invoiceId, invoiceId))
    .orderBy(messages.stepIndex);
}

async function loadPayments(invoiceId: string) {
  const db = getDb();
  return db.select().from(payments).where(eq(payments.invoiceId, invoiceId)).orderBy(payments.paidAt);
}

export async function loadInvoiceDetail(
  firm: Firm,
  invoiceId: string,
): Promise<InvoiceDetail | null> {
  const db = getDb();
  const asOf = today();
  const [row] = await db
    .select({ invoice: invoices, client: clients, run: sequenceRuns })
    .from(invoices)
    .innerJoin(clients, eq(clients.id, invoices.clientId))
    .leftJoin(sequenceRuns, eq(sequenceRuns.invoiceId, invoices.id))
    .where(and(eq(invoices.firmId, firm.id), eq(invoices.id, invoiceId)));
  if (!row) return null;

  const sequence = await activeSequence(firm.id);
  const promiseRows = await db
    .select()
    .from(promises)
    .where(eq(promises.invoiceId, invoiceId))
    .orderBy(promises.createdAt);
  const replyRows = await db
    .select()
    .from(replies)
    .where(eq(replies.invoiceId, invoiceId))
    .orderBy(replies.receivedAt);

  const ladder = statusLineFor(
    {
      firm,
      invoice: row.invoice,
      client: row.client,
      sequence,
      run:
        row.run ??
        ({ highestStepSent: -1, state: "scheduled", escalateAfterBrokenPromise: false } as SequenceRun),
      hasOpenPromise: promiseRows.some((p) => p.status === "open"),
    },
    asOf,
  );

  return {
    invoice: row.invoice,
    client: row.client,
    run: row.run ?? null,
    ladder,
    timeline: await loadMessages(invoiceId),
    promiseRows,
    replyRows,
    paymentRows: await loadPayments(invoiceId),
    stateLine: describeInvoiceState(row.invoice, asOf),
    daysLate: daysOverdue(row.invoice.dueAt, asOf),
    asOf,
    planAllowsPromises: plan(firm.plan).promiseTracking,
  };
}

/** Firms a Practice-tier login operates. Single-firm for Studio and Firm. */
export async function firmsForUser(firm: Firm): Promise<Firm[]> {
  if (!firm.firmGroupId) return [firm];
  const db = getDb();
  return db.select().from(firms).where(eq(firms.firmGroupId, firm.firmGroupId));
}

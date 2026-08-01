/**
 * Accounting sync: QuickBooks Online, Xero, and file import.
 *
 * There are no QuickBooks or Xero credentials in this environment, so the live
 * calls cannot be exercised here. The response to that is not to leave the
 * feature unbuilt — it is to make the provider a narrow interface with two
 * implementations:
 *
 *   - `quickbooksProvider` / `xeroProvider` — the real thing, plain `fetch`
 *     against the documented REST endpoints with token refresh.
 *   - `demoProvider` — a deterministic fake selected automatically when the
 *     provider's client id is absent, returning a plausible agency book.
 *
 * Everything *around* the call — pagination, upsert idempotency on
 * (firm, provider, external id), balance reconciliation, plan limits, client
 * behaviour recomputation, write-back bookkeeping, and what the product does when
 * a provider returns nonsense — is then fully testable and fully exercised. The
 * live HTTP request is the only unverified line, and the UI says so plainly
 * rather than pretending a demo connection is a real one.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  accountingConnections,
  clients,
  invoices,
  payments,
  type AccountingConnection,
  type AccountingProvider,
  type Firm,
} from "@/db/schema";
import { audit, SYSTEM } from "@/lib/audit";
import { addDays, today, type IsoDate } from "@/lib/dates";
import { env } from "@/lib/env";
import { clientBehaviour } from "@/lib/analytics";
import { invoiceCapacity } from "@/lib/plans";
import { activeSequence, ensureRun, stopRun } from "@/lib/sequences";
import { keepPromisesFor } from "@/lib/promises";
import { derivedStatus, OPEN_STATUSES } from "@/lib/invoices";
import type { ImportRow } from "@/lib/csv";

/* -------------------------------------------------------------- interface --- */

export interface RemoteClient {
  externalId: string;
  name: string;
  contactName: string | null;
  emails: string[];
}

export interface RemoteInvoice {
  externalId: string;
  clientExternalId: string;
  number: string;
  issuedAt: IsoDate;
  dueAt: IsoDate;
  amountCents: number;
  balanceCents: number;
  currency: string;
  pdfUrl: string | null;
}

export interface RemotePayment {
  externalId: string;
  invoiceExternalId: string;
  amountCents: number;
  paidAt: IsoDate;
}

export interface RemoteBook {
  clients: RemoteClient[];
  invoices: RemoteInvoice[];
  payments: RemotePayment[];
}

export interface AccountingProviderApi {
  id: AccountingProvider;
  label: string;
  /** False when the provider has no credentials configured in this environment. */
  live: boolean;
  /** Read the book: open invoices plus 12 months of history. */
  fetchBook(connection: AccountingConnection, since: IsoDate): Promise<RemoteBook>;
  /** Record a payment we took in the portal against the remote invoice. */
  pushPayment(
    connection: AccountingConnection,
    args: { invoiceExternalId: string; amountCents: number; paidAt: IsoDate; reference: string },
  ): Promise<{ externalId: string }>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

/* --------------------------------------------------------------- QuickBooks --- */

const QBO_BASE = "https://quickbooks.api.intuit.com/v3/company";
const QBO_MINOR_VERSION = "75";

async function qboQuery<T>(
  connection: AccountingConnection,
  query: string,
): Promise<{ QueryResponse?: T }> {
  if (!connection.accessToken || !connection.realmId) {
    throw new ProviderError("This QuickBooks connection needs to be re-authorised.", false);
  }
  const url = `${QBO_BASE}/${connection.realmId}/query?minorversion=${QBO_MINOR_VERSION}&query=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${connection.accessToken}`,
      Accept: "application/json",
    },
  });
  if (response.status === 401) {
    throw new ProviderError("QuickBooks rejected the access token; re-authorise the connection.", false);
  }
  if (response.status === 429 || response.status >= 500) {
    throw new ProviderError(`QuickBooks is rate-limiting or unavailable (${response.status}).`, true);
  }
  if (!response.ok) {
    throw new ProviderError(`QuickBooks returned ${response.status}.`, false);
  }
  return (await response.json()) as { QueryResponse?: T };
}

interface QboCustomer {
  Id: string;
  DisplayName?: string;
  CompanyName?: string;
  GivenName?: string;
  FamilyName?: string;
  PrimaryEmailAddr?: { Address?: string };
}

interface QboInvoice {
  Id: string;
  DocNumber?: string;
  TxnDate?: string;
  DueDate?: string;
  TotalAmt?: number;
  Balance?: number;
  CurrencyRef?: { value?: string };
  CustomerRef?: { value?: string };
}

interface QboPayment {
  Id: string;
  TotalAmt?: number;
  TxnDate?: string;
  Line?: { LinkedTxn?: { TxnId?: string; TxnType?: string }[] }[];
}

/** Amounts arrive as decimal dollars; they become cents once, here at the edge. */
function toCents(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export const quickbooksProvider: AccountingProviderApi = {
  id: "qbo",
  label: "QuickBooks Online",
  get live() {
    return Boolean(env.qbo.clientId && env.qbo.clientSecret);
  },
  async fetchBook(connection, since) {
    const customers = await qboQuery<{ Customer?: QboCustomer[] }>(
      connection,
      "select * from Customer maxresults 1000",
    );
    const invoiceRows = await qboQuery<{ Invoice?: QboInvoice[] }>(
      connection,
      `select * from Invoice where TxnDate >= '${since}' maxresults 1000`,
    );
    const paymentRows = await qboQuery<{ Payment?: QboPayment[] }>(
      connection,
      `select * from Payment where TxnDate >= '${since}' maxresults 1000`,
    );

    const remoteClients: RemoteClient[] = (customers.QueryResponse?.Customer ?? []).map((c) => ({
      externalId: c.Id,
      name: c.CompanyName || c.DisplayName || "Unnamed customer",
      contactName: [c.GivenName, c.FamilyName].filter(Boolean).join(" ") || null,
      emails: c.PrimaryEmailAddr?.Address ? [c.PrimaryEmailAddr.Address] : [],
    }));

    const remoteInvoices: RemoteInvoice[] = [];
    for (const row of invoiceRows.QueryResponse?.Invoice ?? []) {
      // A response missing the fields we need is a parse failure, not a zero.
      if (!row.Id || !row.CustomerRef?.value || !row.TxnDate) continue;
      const amountCents = toCents(row.TotalAmt);
      if (amountCents <= 0) continue;
      remoteInvoices.push({
        externalId: row.Id,
        clientExternalId: row.CustomerRef.value,
        number: row.DocNumber || row.Id,
        issuedAt: row.TxnDate,
        dueAt: row.DueDate || row.TxnDate,
        amountCents,
        balanceCents: Math.min(amountCents, Math.max(0, toCents(row.Balance))),
        currency: row.CurrencyRef?.value || "USD",
        pdfUrl: null,
      });
    }

    const remotePayments: RemotePayment[] = [];
    for (const row of paymentRows.QueryResponse?.Payment ?? []) {
      for (const line of row.Line ?? []) {
        const linked = line.LinkedTxn?.find((t) => t.TxnType === "Invoice");
        if (!linked?.TxnId || !row.TxnDate) continue;
        remotePayments.push({
          externalId: `${row.Id}:${linked.TxnId}`,
          invoiceExternalId: linked.TxnId,
          amountCents: toCents(row.TotalAmt),
          paidAt: row.TxnDate,
        });
      }
    }

    return { clients: remoteClients, invoices: remoteInvoices, payments: remotePayments };
  },
  async pushPayment(connection, args) {
    if (!connection.accessToken || !connection.realmId) {
      throw new ProviderError("This QuickBooks connection needs to be re-authorised.", false);
    }
    const response = await fetch(
      `${QBO_BASE}/${connection.realmId}/payment?minorversion=${QBO_MINOR_VERSION}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${connection.accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          TotalAmt: args.amountCents / 100,
          TxnDate: args.paidAt,
          PrivateNote: args.reference,
          Line: [
            {
              Amount: args.amountCents / 100,
              LinkedTxn: [{ TxnId: args.invoiceExternalId, TxnType: "Invoice" }],
            },
          ],
        }),
      },
    );
    if (!response.ok) {
      throw new ProviderError(
        `QuickBooks refused the payment write-back (${response.status}).`,
        response.status === 429 || response.status >= 500,
      );
    }
    const body = (await response.json()) as { Payment?: { Id?: string } };
    if (!body.Payment?.Id) {
      throw new ProviderError("QuickBooks accepted the write-back but returned no payment id.", false);
    }
    return { externalId: body.Payment.Id };
  },
};

/* --------------------------------------------------------------------- Xero --- */

const XERO_BASE = "https://api.xero.com/api.xro/2.0";

interface XeroContact {
  ContactID: string;
  Name?: string;
  FirstName?: string;
  LastName?: string;
  EmailAddress?: string;
}

interface XeroInvoice {
  InvoiceID: string;
  InvoiceNumber?: string;
  Type?: string;
  Date?: string;
  DueDate?: string;
  Total?: number;
  AmountDue?: number;
  CurrencyCode?: string;
  Contact?: { ContactID?: string };
}

/** Xero returns `/Date(1750000000000+0000)/` as well as ISO strings. */
export function parseXeroDate(value: string | undefined): IsoDate | null {
  if (!value) return null;
  const dotnet = /\/Date\((-?\d+)/.exec(value);
  if (dotnet) return new Date(Number(dotnet[1])).toISOString().slice(0, 10);
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return iso ? iso[1] : null;
}

async function xeroGet<T>(connection: AccountingConnection, path: string): Promise<T> {
  if (!connection.accessToken || !connection.realmId) {
    throw new ProviderError("This Xero connection needs to be re-authorised.", false);
  }
  const response = await fetch(`${XERO_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${connection.accessToken}`,
      "Xero-Tenant-Id": connection.realmId,
      Accept: "application/json",
    },
  });
  if (response.status === 401) {
    throw new ProviderError("Xero rejected the access token; re-authorise the connection.", false);
  }
  if (response.status === 429 || response.status >= 500) {
    throw new ProviderError(`Xero is rate-limiting or unavailable (${response.status}).`, true);
  }
  if (!response.ok) throw new ProviderError(`Xero returned ${response.status}.`, false);
  return (await response.json()) as T;
}

export const xeroProvider: AccountingProviderApi = {
  id: "xero",
  label: "Xero",
  get live() {
    return Boolean(env.xero.clientId && env.xero.clientSecret);
  },
  async fetchBook(connection, since) {
    const contacts = await xeroGet<{ Contacts?: XeroContact[] }>(connection, "/Contacts");
    const invoiceBody = await xeroGet<{ Invoices?: XeroInvoice[] }>(
      connection,
      `/Invoices?where=${encodeURIComponent(`Type=="ACCREC" AND Date>=DateTime(${since.replace(/-/g, ",")})`)}`,
    );

    const remoteClients: RemoteClient[] = (contacts.Contacts ?? []).map((c) => ({
      externalId: c.ContactID,
      name: c.Name || "Unnamed contact",
      contactName: [c.FirstName, c.LastName].filter(Boolean).join(" ") || null,
      emails: c.EmailAddress ? [c.EmailAddress] : [],
    }));

    const remoteInvoices: RemoteInvoice[] = [];
    const remotePayments: RemotePayment[] = [];
    for (const row of invoiceBody.Invoices ?? []) {
      const issuedAt = parseXeroDate(row.Date);
      if (!row.InvoiceID || !row.Contact?.ContactID || !issuedAt) continue;
      const amountCents = toCents(row.Total);
      if (amountCents <= 0) continue;
      const balanceCents = Math.min(amountCents, Math.max(0, toCents(row.AmountDue)));
      remoteInvoices.push({
        externalId: row.InvoiceID,
        clientExternalId: row.Contact.ContactID,
        number: row.InvoiceNumber || row.InvoiceID,
        issuedAt,
        dueAt: parseXeroDate(row.DueDate) ?? issuedAt,
        amountCents,
        balanceCents,
        currency: row.CurrencyCode || "USD",
        pdfUrl: null,
      });
      // Xero reports the remaining balance, not individual payments on this
      // endpoint; the difference is reconciled as one external payment so the
      // firm's numbers match theirs.
      const settled = amountCents - balanceCents;
      if (settled > 0) {
        remotePayments.push({
          externalId: `xero-settled:${row.InvoiceID}:${settled}`,
          invoiceExternalId: row.InvoiceID,
          amountCents: settled,
          paidAt: parseXeroDate(row.DueDate) ?? issuedAt,
        });
      }
    }
    return { clients: remoteClients, invoices: remoteInvoices, payments: remotePayments };
  },
  async pushPayment(connection, args) {
    if (!connection.accessToken || !connection.realmId) {
      throw new ProviderError("This Xero connection needs to be re-authorised.", false);
    }
    const response = await fetch(`${XERO_BASE}/Payments`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${connection.accessToken}`,
        "Xero-Tenant-Id": connection.realmId,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        Payments: [
          {
            Invoice: { InvoiceID: args.invoiceExternalId },
            Amount: args.amountCents / 100,
            Date: args.paidAt,
            Reference: args.reference,
          },
        ],
      }),
    });
    if (!response.ok) {
      throw new ProviderError(
        `Xero refused the payment write-back (${response.status}).`,
        response.status === 429 || response.status >= 500,
      );
    }
    const body = (await response.json()) as { Payments?: { PaymentID?: string }[] };
    const id = body.Payments?.[0]?.PaymentID;
    if (!id) throw new ProviderError("Xero accepted the write-back but returned no payment id.", false);
    return { externalId: id };
  },
};

/* ------------------------------------------------------------ demo provider --- */

/**
 * The deterministic fake. Selected when a provider has no credentials, so the
 * whole sync → aging → ladder path can be exercised end to end without an
 * Intuit sandbox. It is labelled as a demo everywhere it surfaces; a firm can
 * never mistake it for their own book.
 */
export function demoBook(asOf: IsoDate = today()): RemoteBook {
  const clientsList: RemoteClient[] = [
    { externalId: "demo-c1", name: "Meridian Co", contactName: "Dana Whitfield", emails: ["ap@meridian.co"] },
    { externalId: "demo-c2", name: "Harbourline Group", contactName: "Priya Raman", emails: ["accounts@harbourline.io"] },
    { externalId: "demo-c3", name: "Fable & Vine", contactName: "Owen Serra", emails: ["owen@fableandvine.com"] },
    { externalId: "demo-c4", name: "Northgate Partners", contactName: "Ruth Alcott", emails: ["finance@northgatepartners.com"] },
  ];

  const spec: Array<[string, string, number, number, number, number]> = [
    // client, number, issued days ago, terms, amount cents, paid cents
    ["demo-c1", "INV-2041", 101, 30, 1_240_000, 0],
    ["demo-c1", "INV-2062", 44, 30, 480_000, 0],
    ["demo-c1", "INV-1988", 190, 30, 960_000, 960_000],
    ["demo-c2", "INV-2044", 68, 30, 485_000, 285_000],
    ["demo-c2", "INV-2071", 22, 30, 720_000, 0],
    ["demo-c2", "INV-1990", 150, 30, 610_000, 610_000],
    ["demo-c3", "INV-2050", 52, 30, 960_000, 0],
    ["demo-c3", "INV-2066", 12, 45, 1_450_000, 0],
    ["demo-c4", "INV-2058", 35, 15, 320_000, 0],
    ["demo-c4", "INV-2011", 120, 15, 540_000, 540_000],
  ];

  const invoicesList: RemoteInvoice[] = [];
  const paymentsList: RemotePayment[] = [];
  spec.forEach(([client, number, issuedDaysAgo, terms, amountCents, paidCents], index) => {
    const issuedAt = addDays(asOf, -issuedDaysAgo);
    const dueAt = addDays(issuedAt, terms);
    invoicesList.push({
      externalId: `demo-i${index + 1}`,
      clientExternalId: client,
      number,
      issuedAt,
      dueAt,
      amountCents,
      balanceCents: amountCents - paidCents,
      currency: "USD",
      pdfUrl: null,
    });
    if (paidCents > 0) {
      paymentsList.push({
        externalId: `demo-p${index + 1}`,
        invoiceExternalId: `demo-i${index + 1}`,
        amountCents: paidCents,
        // Paid a plausible number of days after issue, so days-to-pay is real.
        paidAt: addDays(issuedAt, terms + (index % 3) * 9),
      });
    }
  });

  return { clients: clientsList, invoices: invoicesList, payments: paymentsList };
}

export function demoProvider(id: AccountingProvider, label: string): AccountingProviderApi {
  return {
    id,
    label: `${label} (demo data)`,
    live: false,
    async fetchBook() {
      return demoBook();
    },
    async pushPayment(_connection, args) {
      return { externalId: `demo-writeback-${args.invoiceExternalId}` };
    },
  };
}

export function providerFor(id: AccountingProvider): AccountingProviderApi {
  if (id === "qbo") return quickbooksProvider.live ? quickbooksProvider : demoProvider("qbo", "QuickBooks Online");
  if (id === "xero") return xeroProvider.live ? xeroProvider : demoProvider("xero", "Xero");
  // CSV and Stripe Invoicing are pushed to us; there is nothing to poll.
  return demoProvider(id, id === "csv" ? "File import" : "Stripe Invoicing");
}

export const PROVIDER_LABELS: Record<AccountingProvider, string> = {
  qbo: "QuickBooks Online",
  xero: "Xero",
  csv: "CSV import",
  stripe_invoicing: "Stripe Invoicing",
};

/* ------------------------------------------------------------------- upsert --- */

export interface SyncSummary {
  clientsUpserted: number;
  invoicesUpserted: number;
  paymentsUpserted: number;
  settled: number;
  skippedForPlan: number;
  runsCreated: number;
  error?: string;
}

interface UpsertArgs {
  firm: Firm;
  provider: AccountingProvider;
  book: RemoteBook;
  actor?: string;
}

/**
 * Write a fetched book into our tables.
 *
 * Idempotent on (firm, provider, external id) for both clients and invoices, so
 * a re-run — or a webhook arriving twice — updates rather than duplicates.
 * Invoices that the remote says are settled have their run stopped and their
 * promises marked kept in the same pass: sync is the moment we learn about money
 * that arrived by cheque or bank transfer without us.
 */
export async function upsertBook(args: UpsertArgs): Promise<SyncSummary> {
  const db = getDb();
  const summary: SyncSummary = {
    clientsUpserted: 0,
    invoicesUpserted: 0,
    paymentsUpserted: 0,
    settled: 0,
    skippedForPlan: 0,
    runsCreated: 0,
  };

  const clientIdByExternal = new Map<string, string>();
  for (const remote of args.book.clients) {
    const [row] = await db
      .insert(clients)
      .values({
        firmId: args.firm.id,
        provider: args.provider,
        externalId: remote.externalId,
        name: remote.name,
        contactName: remote.contactName,
        emails: remote.emails,
      })
      .onConflictDoUpdate({
        target: [clients.firmId, clients.provider, clients.externalId],
        set: { name: remote.name, contactName: remote.contactName, emails: remote.emails },
      })
      .returning();
    clientIdByExternal.set(remote.externalId, row.id);
    summary.clientsUpserted += 1;
  }

  // Plan capacity is checked against what is already open, so a sync cannot
  // silently exceed the firm's plan — and what it skipped is reported.
  const [openRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(invoices)
    .where(and(eq(invoices.firmId, args.firm.id), inArray(invoices.status, OPEN_STATUSES)));
  let capacity = invoiceCapacity(args.firm.plan, openRow?.count ?? 0).remaining;

  const invoiceIdByExternal = new Map<string, string>();
  for (const remote of args.book.invoices) {
    const clientId = clientIdByExternal.get(remote.clientExternalId);
    if (!clientId) continue;

    const [existing] = await db
      .select({ id: invoices.id })
      .from(invoices)
      .where(
        and(
          eq(invoices.firmId, args.firm.id),
          eq(invoices.provider, args.provider),
          eq(invoices.externalId, remote.externalId),
        ),
      );

    const isOpen = remote.balanceCents > 0;
    if (!existing && isOpen && capacity <= 0) {
      summary.skippedForPlan += 1;
      continue;
    }

    const status = derivedStatus({
      status: "open",
      balanceCents: remote.balanceCents,
      amountCents: remote.amountCents,
      dueAt: remote.dueAt,
    });

    const [row] = await db
      .insert(invoices)
      .values({
        firmId: args.firm.id,
        clientId,
        provider: args.provider,
        externalId: remote.externalId,
        number: remote.number,
        issuedAt: remote.issuedAt,
        dueAt: remote.dueAt,
        amountCents: remote.amountCents,
        balanceCents: remote.balanceCents,
        currency: remote.currency,
        status,
        pdfUrl: remote.pdfUrl,
      })
      .onConflictDoUpdate({
        target: [invoices.firmId, invoices.provider, invoices.externalId],
        set: {
          clientId,
          number: remote.number,
          issuedAt: remote.issuedAt,
          dueAt: remote.dueAt,
          amountCents: remote.amountCents,
          balanceCents: remote.balanceCents,
          currency: remote.currency,
          pdfUrl: remote.pdfUrl,
          updatedAt: new Date(),
        },
      })
      .returning();

    invoiceIdByExternal.set(remote.externalId, row.id);
    summary.invoicesUpserted += 1;
    if (!existing && isOpen) capacity -= 1;
  }

  for (const remote of args.book.payments) {
    const invoiceId = invoiceIdByExternal.get(remote.invoiceExternalId);
    if (!invoiceId) continue;
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
    if (!invoice) continue;
    const inserted = await db
      .insert(payments)
      .values({
        firmId: args.firm.id,
        invoiceId,
        clientId: invoice.clientId,
        amountCents: remote.amountCents,
        method: "external",
        externalId: `${args.provider}:${remote.externalId}`,
        paidAt: remote.paidAt,
        // Money that was already in the accounting system needs no write-back.
        recordedToAccountingAt: new Date(),
      })
      .onConflictDoNothing()
      .returning();
    if (inserted.length) summary.paymentsUpserted += 1;
  }

  // Reconcile status and stop anything the remote says is paid. Doing this after
  // the payment rows exist means "paid" always has evidence behind it.
  const sequence = await activeSequence(args.firm.id);
  for (const invoiceId of invoiceIdByExternal.values()) {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
    if (!invoice) continue;
    const status = derivedStatus(invoice);
    if (status !== invoice.status) {
      await db.update(invoices).set({ status }).where(eq(invoices.id, invoiceId));
    }
    if (invoice.balanceCents <= 0) {
      await db
        .update(invoices)
        .set({ paidAt: invoice.paidAt ?? today(), status: "paid" })
        .where(eq(invoices.id, invoiceId));
      await stopRun(invoiceId, "paid");
      await keepPromisesFor(invoiceId, args.firm.id);
      summary.settled += 1;
      continue;
    }
    // Every open invoice gets a run, so the ladder has something to advance.
    const run = await ensureRun(args.firm.id, invoice, sequence);
    if (run.highestStepSent === -1 && run.state === "scheduled") summary.runsCreated += 1;
  }

  await recomputeClientStats(args.firm.id);
  await audit(args.firm.id, args.actor ?? SYSTEM, "sync_completed", PROVIDER_LABELS[args.provider], {
    ...summary,
  });
  return summary;
}

/* -------------------------------------------------------------- connections --- */

export async function connectionsFor(firmId: string): Promise<AccountingConnection[]> {
  const db = getDb();
  return db.select().from(accountingConnections).where(eq(accountingConnections.firmId, firmId));
}

export async function upsertConnection(args: {
  firmId: string;
  provider: AccountingProvider;
  realmId?: string | null;
  displayName?: string | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  tokenExpiresAt?: Date | null;
}): Promise<AccountingConnection> {
  const db = getDb();
  const [row] = await db
    .insert(accountingConnections)
    .values({
      firmId: args.firmId,
      provider: args.provider,
      realmId: args.realmId ?? null,
      displayName: args.displayName ?? null,
      accessToken: args.accessToken ?? null,
      refreshToken: args.refreshToken ?? null,
      tokenExpiresAt: args.tokenExpiresAt ?? null,
      syncStatus: "never",
    })
    .onConflictDoUpdate({
      target: [accountingConnections.firmId, accountingConnections.provider],
      set: {
        realmId: args.realmId ?? null,
        displayName: args.displayName ?? null,
        accessToken: args.accessToken ?? null,
        refreshToken: args.refreshToken ?? null,
        tokenExpiresAt: args.tokenExpiresAt ?? null,
      },
    })
    .returning();
  return row;
}

/** Run one connection's sync, recording success or the exact failure. */
export async function syncConnection(
  firm: Firm,
  connection: AccountingConnection,
  monthsOfHistory = 12,
): Promise<SyncSummary> {
  const db = getDb();
  const api = providerFor(connection.provider);
  const since = addDays(today(), -Math.round(monthsOfHistory * 30.5));

  await db
    .update(accountingConnections)
    .set({ syncStatus: "syncing", syncError: null })
    .where(eq(accountingConnections.id, connection.id));

  try {
    const book = await api.fetchBook(connection, since);
    const summary = await upsertBook({ firm, provider: connection.provider, book });
    await db
      .update(accountingConnections)
      .set({ syncStatus: "ok", syncError: null, lastSyncedAt: new Date() })
      .where(eq(accountingConnections.id, connection.id));
    return summary;
  } catch (err) {
    const message =
      err instanceof ProviderError
        ? err.message
        : err instanceof Error
          ? err.message
          : "The sync failed for an unknown reason.";
    await db
      .update(accountingConnections)
      .set({ syncStatus: "error", syncError: message })
      .where(eq(accountingConnections.id, connection.id));
    return {
      clientsUpserted: 0,
      invoicesUpserted: 0,
      paymentsUpserted: 0,
      settled: 0,
      skippedForPlan: 0,
      runsCreated: 0,
      error: message,
    };
  }
}

/* ------------------------------------------------------------- file import --- */

/** Turn a validated CSV plan into a book, then upsert it like any other. */
export function bookFromImportRows(rows: readonly ImportRow[]): RemoteBook {
  const clientsByName = new Map<string, RemoteClient>();
  const invoicesList: RemoteInvoice[] = [];
  const paymentsList: RemotePayment[] = [];

  for (const row of rows) {
    const key = row.clientName.toLowerCase();
    const existing = clientsByName.get(key);
    if (existing) {
      if (row.clientEmail && !existing.emails.includes(row.clientEmail)) {
        existing.emails.push(row.clientEmail);
      }
      if (!existing.contactName && row.contactName) existing.contactName = row.contactName;
    } else {
      clientsByName.set(key, {
        externalId: `csv:${key}`,
        name: row.clientName,
        contactName: row.contactName,
        emails: row.clientEmail ? [row.clientEmail] : [],
      });
    }

    const externalId = `csv:${key}:${row.number.toLowerCase()}`;
    invoicesList.push({
      externalId,
      clientExternalId: `csv:${key}`,
      number: row.number,
      issuedAt: row.issuedAt,
      dueAt: row.dueAt,
      amountCents: row.amountCents,
      balanceCents: row.balanceCents,
      currency: row.currency,
      pdfUrl: null,
    });

    const settled = row.amountCents - row.balanceCents;
    if (settled > 0) {
      paymentsList.push({
        externalId: `csv-settled:${externalId}:${settled}`,
        invoiceExternalId: externalId,
        amountCents: settled,
        paidAt: row.dueAt,
      });
    }
  }

  return { clients: [...clientsByName.values()], invoices: invoicesList, payments: paymentsList };
}

/* ------------------------------------------------------- client behaviour --- */

/**
 * Recompute avg days-to-pay and reliability for every client of a firm, from
 * settled invoices. Cheap enough to run after each sync and after each payment.
 */
export async function recomputeClientStats(firmId: string): Promise<number> {
  const db = getDb();
  const settled = await db
    .select({
      clientId: invoices.clientId,
      issuedAt: invoices.issuedAt,
      dueAt: invoices.dueAt,
      paidAt: invoices.paidAt,
    })
    .from(invoices)
    .where(and(eq(invoices.firmId, firmId), eq(invoices.status, "paid")));

  const byClient = new Map<string, { issuedAt: IsoDate; dueAt: IsoDate; paidAt: IsoDate }[]>();
  for (const row of settled) {
    if (!row.paidAt) continue;
    const list = byClient.get(row.clientId) ?? [];
    list.push({ issuedAt: row.issuedAt, dueAt: row.dueAt, paidAt: row.paidAt });
    byClient.set(row.clientId, list);
  }

  const all = await db.select({ id: clients.id }).from(clients).where(eq(clients.firmId, firmId));
  let updated = 0;
  for (const client of all) {
    const behaviour = clientBehaviour(byClient.get(client.id) ?? []);
    await db
      .update(clients)
      .set({
        avgDaysToPay: behaviour.avgDaysToPay,
        reliabilityScore: behaviour.reliabilityScore,
        paidInvoiceCount: behaviour.paidInvoiceCount,
      })
      .where(eq(clients.id, client.id));
    updated += 1;
  }
  return updated;
}

/* --------------------------------------------------------------- write-back --- */

export interface WriteBackSummary {
  written: number;
  failed: number;
  skipped: number;
}

/**
 * Push portal payments back into the firm's accounting system.
 *
 * Only card/ACH payments we took ourselves are pushed; anything that arrived
 * with `method: "external"` was already there. A failure is stored on the payment
 * row and retried on the next sweep, because a payment missing from QuickBooks is
 * a bookkeeping problem the firm will otherwise find at month end.
 */
export async function writeBackPayments(firm: Firm, limit = 25): Promise<WriteBackSummary> {
  const db = getDb();
  const summary: WriteBackSummary = { written: 0, failed: 0, skipped: 0 };

  const connections = await connectionsFor(firm.id);
  const pushable = connections.filter((c) => c.provider === "qbo" || c.provider === "xero");
  if (pushable.length === 0) return summary;

  const pending = await db
    .select({ payment: payments, invoice: invoices })
    .from(payments)
    .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
    .where(
      and(
        eq(payments.firmId, firm.id),
        inArray(payments.method, ["card", "ach"]),
        sql`${payments.recordedToAccountingAt} is null`,
      ),
    )
    .limit(limit);

  for (const { payment, invoice } of pending) {
    const connection = pushable.find((c) => c.provider === invoice.provider) ?? pushable[0];
    if (invoice.provider !== connection.provider) {
      summary.skipped += 1;
      continue;
    }
    const api = providerFor(connection.provider);
    try {
      const result = await api.pushPayment(connection, {
        invoiceExternalId: invoice.externalId,
        amountCents: payment.amountCents,
        paidAt: payment.paidAt,
        reference: `PaidWell portal payment ${payment.id}`,
      });
      await db
        .update(payments)
        .set({ recordedToAccountingAt: new Date(), writeBackError: null, externalId: `${connection.provider}:${result.externalId}` })
        .where(eq(payments.id, payment.id));
      await audit(firm.id, SYSTEM, "payment_written_back", invoice.number, {
        paymentId: payment.id,
        provider: connection.provider,
      });
      summary.written += 1;
    } catch (err) {
      await db
        .update(payments)
        .set({ writeBackError: err instanceof Error ? err.message : "Write-back failed" })
        .where(eq(payments.id, payment.id));
      summary.failed += 1;
    }
  }
  return summary;
}

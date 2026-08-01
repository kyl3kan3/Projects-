/**
 * Invoices shown — and paid — inside the portal.
 *
 * The money never touches ClientDock. An invoice is raised on the *agency's own*
 * Stripe account through Connect, and the portal renders its hosted payment URL.
 * We keep a mirror row so the portal can list invoices without an API call on the
 * client's critical path, and so a portal still shows what is owed when Stripe is
 * unreachable.
 *
 * Without a connected account (and in development, where no Stripe credential
 * exists) an invoice can still be recorded with a payment URL the agency pastes
 * in — the portal is honest about it: no URL means "your studio will send the
 * payment link", not a dead button.
 */

import Stripe from "stripe";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { invoices, type Invoice, type InvoiceStatus, type Workspace } from "@/db/schema";
import { env, has } from "@/lib/env";
import { isUuid, touchPortal } from "@/lib/files";

export class InvoiceError extends Error {}

let _stripe: Stripe | null = null;

/** Shared Stripe client. Connect calls pass `{ stripeAccount }` per request. */
export function stripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(env.stripeSecretKey, {
      appInfo: { name: "ClientDock", url: "https://clientdock.app" },
    });
  }
  return _stripe;
}

export function stripeConfigured(): boolean {
  return has("STRIPE_SECRET_KEY");
}

/* --------------------------------------------------------------- create --- */

export interface InvoiceInput {
  portalId: string;
  number: string;
  amountCents: number;
  currency?: string;
  dueAt?: Date | null;
  hostedInvoiceUrl?: string | null;
  status?: InvoiceStatus;
}

export async function recordInvoice(input: InvoiceInput): Promise<Invoice> {
  const number = input.number.trim();
  if (!number) throw new InvoiceError("Invoices need a number the client can quote back");
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new InvoiceError("Enter an amount greater than zero");
  }
  if (input.hostedInvoiceUrl && !/^https:\/\//i.test(input.hostedInvoiceUrl)) {
    throw new InvoiceError("A payment link has to be an https:// URL");
  }

  const db = getDb();
  const [row] = await db
    .insert(invoices)
    .values({
      portalId: input.portalId,
      number: number.slice(0, 40),
      amountCents: input.amountCents,
      currency: (input.currency ?? "usd").toLowerCase().slice(0, 3),
      dueAt: input.dueAt ?? null,
      hostedInvoiceUrl: input.hostedInvoiceUrl?.trim() || null,
      status: input.status ?? "open",
    })
    .returning();

  await touchPortal(input.portalId);
  return row;
}

/**
 * Raise the invoice on the agency's connected Stripe account and mirror it.
 *
 * Untested against live Stripe in this environment — there is no API credential
 * here, so this path is exercised only by its guard clauses. `recordInvoice` is
 * the path that has actually been run end to end.
 */
export async function createConnectInvoice(input: {
  workspace: Workspace;
  portalId: string;
  customerEmail: string;
  number: string;
  amountCents: number;
  currency?: string;
  daysUntilDue?: number;
  description?: string;
}): Promise<Invoice> {
  if (!input.workspace.stripeConnectId) {
    throw new InvoiceError("Connect your Stripe account first, in Settings.");
  }
  if (!stripeConfigured()) {
    throw new InvoiceError("Stripe isn't configured on this deployment.");
  }
  const account = input.workspace.stripeConnectId;
  const currency = (input.currency ?? "usd").toLowerCase();
  const client = stripe();

  const customer = await client.customers.create(
    { email: input.customerEmail },
    { stripeAccount: account },
  );
  const draft = await client.invoices.create(
    {
      customer: customer.id,
      collection_method: "send_invoice",
      days_until_due: input.daysUntilDue ?? 14,
      auto_advance: false,
      metadata: { portalId: input.portalId, number: input.number },
    },
    { stripeAccount: account },
  );
  await client.invoiceItems.create(
    {
      customer: customer.id,
      invoice: draft.id,
      amount: input.amountCents,
      currency,
      description: input.description ?? `Invoice ${input.number}`,
    },
    { stripeAccount: account },
  );
  const finalized = await client.invoices.finalizeInvoice(draft.id!, undefined, {
    stripeAccount: account,
  });

  const db = getDb();
  const [row] = await db
    .insert(invoices)
    .values({
      portalId: input.portalId,
      number: input.number.slice(0, 40),
      amountCents: input.amountCents,
      currency,
      status: finalized.status === "paid" ? "paid" : "open",
      dueAt: finalized.due_date ? new Date(finalized.due_date * 1000) : null,
      stripeInvoiceId: finalized.id,
      hostedInvoiceUrl: finalized.hosted_invoice_url ?? null,
    })
    .returning();

  await touchPortal(input.portalId);
  return row;
}

/* ----------------------------------------------------------------- read --- */

export async function listInvoices(portalId: string): Promise<Invoice[]> {
  const db = getDb();
  return db
    .select()
    .from(invoices)
    .where(eq(invoices.portalId, portalId))
    .orderBy(desc(invoices.createdAt));
}

export async function getInvoiceScoped(portalId: string, invoiceId: string): Promise<Invoice | null> {
  if (!isUuid(invoiceId)) return null;
  const db = getDb();
  const [row] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.portalId, portalId)));
  return row ?? null;
}

export async function setInvoiceStatus(
  portalId: string,
  invoiceId: string,
  status: InvoiceStatus,
): Promise<Invoice | null> {
  if (!isUuid(invoiceId)) return null;
  const db = getDb();
  const [row] = await db
    .update(invoices)
    .set({ status, paidAt: status === "paid" ? new Date() : null })
    .where(and(eq(invoices.id, invoiceId), eq(invoices.portalId, portalId)))
    .returning();
  return row ?? null;
}

/** Called by the Stripe webhook when a connected-account invoice is paid. */
export async function markPaidByStripeId(stripeInvoiceId: string): Promise<void> {
  const db = getDb();
  await db
    .update(invoices)
    .set({ status: "paid", paidAt: new Date() })
    .where(eq(invoices.stripeInvoiceId, stripeInvoiceId));
}

/* -------------------------------------------------------------- derived --- */

export function outstandingCents(list: Invoice[]): number {
  return list
    .filter((i) => i.status === "open")
    .reduce((sum, i) => sum + i.amountCents, 0);
}

export function invoiceLabel(status: InvoiceStatus): string {
  switch (status) {
    case "paid":
      return "PAID";
    case "void":
      return "VOID";
    case "draft":
      return "DRAFT";
    default:
      return "DUE";
  }
}

/** Overdue only when it is open and the due date has passed. */
export function isOverdue(invoice: Invoice, now = new Date()): boolean {
  return invoice.status === "open" && Boolean(invoice.dueAt && invoice.dueAt.getTime() < now.getTime());
}

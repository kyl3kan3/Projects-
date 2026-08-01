/**
 * The client payment portal: signed, no-login links.
 *
 * The token in the URL *is* the credential. That is a deliberate trade: asking a
 * client's accounts-payable clerk to create an account before they can pay is
 * how an invoice stays unpaid for another month. The trade is made safe by
 * keeping the token narrow (one client, optionally one invoice, on one firm),
 * signing it with HMAC so it cannot be forged or widened, expiring it after 60
 * days, and never putting anything in the payload that a leaked link could use
 * beyond seeing and paying that client's own invoices.
 */

import { SignJWT, jwtVerify } from "jose";
import { and, eq, gt, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  clients,
  firms,
  invoices,
  payments,
  promises,
  type Client,
  type Firm,
  type Invoice,
  type Payment,
  type PromiseRow,
} from "@/db/schema";
import { env } from "@/lib/env";
import { today, type IsoDate } from "@/lib/dates";
import { OPEN_STATUSES } from "@/lib/invoices";
import { firmSettings } from "@/lib/settings";

const TOKEN_TTL_DAYS = 60;

export interface PortalScope {
  firmId: string;
  clientId: string;
  /** Present when the link came from a specific invoice's follow-up. */
  invoiceId?: string;
}

function secretKey(): Uint8Array {
  return new TextEncoder().encode(env.portalTokenSecret);
}

export async function createPortalToken(scope: PortalScope): Promise<string> {
  return new SignJWT({
    firmId: scope.firmId,
    clientId: scope.clientId,
    invoiceId: scope.invoiceId ?? null,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_TTL_DAYS}d`)
    .sign(secretKey());
}

export type TokenResult =
  | { ok: true; scope: PortalScope }
  | { ok: false; reason: "expired" | "invalid" };

export async function resolvePortalToken(token: string): Promise<TokenResult> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    const firmId = payload.firmId as string | undefined;
    const clientId = payload.clientId as string | undefined;
    if (!firmId || !clientId) return { ok: false, reason: "invalid" };
    return {
      ok: true,
      scope: {
        firmId,
        clientId,
        invoiceId: (payload.invoiceId as string | null) ?? undefined,
      },
    };
  } catch (err) {
    const code = (err as { code?: string })?.code;
    return { ok: false, reason: code === "ERR_JWT_EXPIRED" ? "expired" : "invalid" };
  }
}

export function portalUrl(token: string): string {
  return `${env.appUrl}/portal/${token}`;
}

/* --------------------------------------------------------------- context --- */

export interface PortalInvoice {
  invoice: Invoice;
  isFocus: boolean;
}

export interface PortalContext {
  firm: Firm;
  client: Client;
  focusInvoiceId: string | null;
  openInvoices: PortalInvoice[];
  paidInvoices: Invoice[];
  paymentHistory: Payment[];
  openPromise: PromiseRow | null;
  totalBalanceCents: number;
  partialFloorCents: number;
  asOf: IsoDate;
  /** True when the firm has connected Stripe, so a card can actually be taken. */
  canTakePayment: boolean;
}

/**
 * Everything the portal page renders, loaded from one scope. Deliberately shows
 * the client *all* their open invoices, not just the one that was chased: a payer
 * who is already in the payment screen is the best chance the firm will ever have
 * of clearing the rest of the balance too.
 */
export async function loadPortalContext(scope: PortalScope): Promise<PortalContext | null> {
  const db = getDb();
  const [firm] = await db.select().from(firms).where(eq(firms.id, scope.firmId));
  if (!firm) return null;
  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, scope.clientId), eq(clients.firmId, scope.firmId)));
  if (!client) return null;

  const open = await db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.firmId, scope.firmId),
        eq(invoices.clientId, scope.clientId),
        inArray(invoices.status, OPEN_STATUSES),
        gt(invoices.balanceCents, 0),
      ),
    )
    .orderBy(invoices.dueAt);

  const paid = await db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.firmId, scope.firmId),
        eq(invoices.clientId, scope.clientId),
        eq(invoices.status, "paid"),
      ),
    )
    .orderBy(invoices.paidAt)
    .limit(10);

  const history = await db
    .select()
    .from(payments)
    .where(and(eq(payments.firmId, scope.firmId), eq(payments.clientId, scope.clientId)))
    .orderBy(payments.paidAt)
    .limit(20);

  const focusInvoiceId =
    scope.invoiceId && open.some((i) => i.id === scope.invoiceId) ? scope.invoiceId : null;

  const [openPromise] = focusInvoiceId
    ? await db
        .select()
        .from(promises)
        .where(and(eq(promises.invoiceId, focusInvoiceId), eq(promises.status, "open")))
        .limit(1)
    : [];

  const settings = firmSettings(firm);

  return {
    firm,
    client,
    focusInvoiceId,
    openInvoices: open.map((invoice) => ({ invoice, isFocus: invoice.id === focusInvoiceId })),
    paidInvoices: paid,
    paymentHistory: history,
    openPromise: openPromise ?? null,
    totalBalanceCents: open.reduce((sum, i) => sum + i.balanceCents, 0),
    partialFloorCents: settings.partialFloorCents,
    asOf: today(),
    canTakePayment: Boolean(firm.stripeAccountId),
  };
}

"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { invoices } from "@/db/schema";
import { logPromise } from "@/lib/promises";
import { clampPartialPayment, formatMoney } from "@/lib/money";
import { loadPortalContext, resolvePortalToken } from "@/lib/portal";
import { createPortalPaymentIntent, stripeConfigured } from "@/lib/stripe";
import { firmSettings } from "@/lib/settings";

export interface PortalActionState {
  error?: string;
  notice?: string;
  clientSecret?: string;
}

/**
 * The promise widget. A client telling the firm a date is worth as much to a
 * cash-flow forecast as a payment, so it gets a first-class control on the
 * page they already have open — and it pauses the follow-up immediately.
 */
export async function portalPromiseAction(
  _prev: PortalActionState,
  formData: FormData,
): Promise<PortalActionState> {
  const token = String(formData.get("token") ?? "");
  const invoiceId = String(formData.get("invoiceId") ?? "");
  const promisedFor = String(formData.get("promisedFor") ?? "");

  const resolved = await resolvePortalToken(token);
  if (!resolved.ok) return { error: "This link has expired. Ask for a fresh one." };

  // The token scopes the write: a link for one client can only ever touch that
  // client's invoices, whatever is posted.
  const db = getDb();
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.id, invoiceId),
        eq(invoices.firmId, resolved.scope.firmId),
        eq(invoices.clientId, resolved.scope.clientId),
      ),
    );
  if (!invoice) return { error: "That invoice is not on this link." };

  const result = await logPromise({
    firmId: resolved.scope.firmId,
    invoiceId: invoice.id,
    promisedFor,
    source: "portal",
    actor: "client",
  });
  revalidatePath(`/portal/${token}`);
  return result.ok
    ? { notice: `Thank you — noted for ${promisedFor}. No further reminders before then.` }
    : { error: result.reason };
}

/**
 * Start a card or ACH payment on the firm's own connected Stripe account.
 *
 * Returns the client secret for Stripe Elements. Without Stripe credentials it
 * says so plainly rather than presenting a Pay button that cannot work.
 */
export async function startPaymentAction(
  _prev: PortalActionState,
  formData: FormData,
): Promise<PortalActionState> {
  const token = String(formData.get("token") ?? "");
  const invoiceId = String(formData.get("invoiceId") ?? "");
  const amountRaw = String(formData.get("amount") ?? "");

  const resolved = await resolvePortalToken(token);
  if (!resolved.ok) return { error: "This link has expired. Ask for a fresh one." };

  const context = await loadPortalContext(resolved.scope);
  if (!context) return { error: "This link no longer resolves to an account." };

  const target = context.openInvoices.find((row) => row.invoice.id === invoiceId)?.invoice;
  if (!target) return { error: "That invoice is not on this link, or it is already settled." };

  const requested = amountRaw.trim()
    ? Math.round(Number(amountRaw.replace(/[^\d.]/g, "")) * 100)
    : target.balanceCents;
  const clamped = clampPartialPayment(
    requested,
    target.balanceCents,
    firmSettings(context.firm).partialFloorCents,
  );
  if ("error" in clamped) return { error: clamped.error };

  if (!stripeConfigured() || !context.firm.stripeAccountId) {
    return {
      error: `${context.firm.name} has not finished connecting Stripe, so card and bank payments are not live yet. Reply to their email and they will send bank details for ${formatMoney(
        clamped.cents,
        target.currency,
      )}.`,
    };
  }

  try {
    const intent = await createPortalPaymentIntent({
      firmId: context.firm.id,
      firmName: context.firm.name,
      stripeAccountId: context.firm.stripeAccountId,
      clientId: context.client.id,
      invoiceId: target.id,
      invoiceNumber: target.number,
      amountCents: clamped.cents,
      currency: target.currency,
      allowAch: (target.currency || "USD").toUpperCase() === "USD",
    });
    return {
      clientSecret: intent.client_secret ?? undefined,
      notice: `Ready to take ${formatMoney(clamped.cents, target.currency)}.`,
    };
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? `Stripe could not start the payment: ${err.message}`
          : "Stripe could not start the payment.",
    };
  }
}

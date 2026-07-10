import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { env } from "@/lib/env";
import { quotaBytesFor } from "@/lib/plans";
import { scheduleForSession } from "@/lib/automations";
import { stripe } from "@/lib/stripe";

/**
 * One endpoint, two Stripe usages discriminated by metadata:
 *  - client Invoicing (deposit/balance): invoice.paid confirms the session
 *  - our own Billing (SaaS subs): plan + quota enforcement
 */
export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "No signature" }, { status: 400 });
  const raw = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(raw, signature, env.stripeWebhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "invoice.paid") {
    const inv = event.data.object as Stripe.Invoice;
    const lenscrmInvoiceId = inv.metadata?.lenscrmInvoiceId;
    if (lenscrmInvoiceId) {
      const invoice = await db.query.invoices.findFirst({ where: eq(schema.invoices.id, lenscrmInvoiceId) });
      if (invoice && invoice.status !== "paid") {
        await db.update(schema.invoices).set({ status: "paid", paidAt: new Date() }).where(eq(schema.invoices.id, invoice.id));
        await db.insert(schema.payments).values({ invoiceId: invoice.id, accountId: invoice.accountId, amountCents: invoice.totalCents, status: "succeeded", paidAt: new Date() });
        // Deposit clearing confirms the booking.
        if (invoice.kind === "deposit" && invoice.sessionId) {
          await db.update(schema.sessions).set({ status: "confirmed" }).where(eq(schema.sessions.id, invoice.sessionId));
          await scheduleForSession(invoice.accountId, invoice.sessionId);
        }
      }
    }
  } else if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const sub = event.data.object as Stripe.Subscription;
    const accountId = sub.metadata.accountId;
    const plan = (sub.metadata.plan as "solo" | "studio" | "pro" | undefined) ?? "solo";
    if (accountId) {
      const active = sub.status === "active" || sub.status === "trialing";
      await db
        .update(schema.accounts)
        .set({ plan: active ? plan : "trial", stripeSubscriptionId: sub.id, subscriptionStatus: sub.status, storageQuotaBytes: quotaBytesFor(active ? plan : "solo") })
        .where(eq(schema.accounts.id, accountId));
    }
  }

  return NextResponse.json({ received: true });
}

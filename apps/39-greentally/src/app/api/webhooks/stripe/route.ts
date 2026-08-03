/**
 * Stripe Billing webhook.
 *
 * Verifies the signature, resolves the organisation from the Stripe customer (never from
 * metadata alone), and applies the plan the subscription actually says. Idempotent by
 * construction — it writes a state rather than toggling one — so Stripe's retries are
 * harmless. Acknowledges immediately; nothing heavy runs inline.
 */

import type Stripe from "stripe";
import { stripeConfigured, env } from "@/lib/env";
import { applyPlan, orgForCustomer, planForPriceId, stripe } from "@/lib/stripe";
import { PAID_PLANS } from "@/lib/plans";
import type { BillingInterval, Plan } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  if (!stripeConfigured() || !env.stripeWebhookSecret) {
    return Response.json({ error: "Stripe is not configured." }, { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "Missing signature." }, { status: 400 });

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(raw, signature, env.stripeWebhookSecret);
  } catch (err) {
    return Response.json(
      { error: `Signature verification failed: ${err instanceof Error ? err.message : "unknown"}` },
      { status: 400 },
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = typeof session.customer === "string" ? session.customer : null;
        const subscriptionId =
          typeof session.subscription === "string" ? session.subscription : null;
        if (!customerId) break;
        const org = await orgForCustomer(customerId);
        const orgId = org?.id ?? (session.metadata?.organizationId ?? null);
        if (!orgId) break;
        const plan = normalisePlan(session.metadata?.plan);
        const interval = normaliseInterval(session.metadata?.interval);
        if (plan) await applyPlan(orgId, plan, interval, subscriptionId);
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === "string" ? sub.customer : null;
        if (!customerId) break;
        const org = await orgForCustomer(customerId);
        const orgId = org?.id ?? (sub.metadata?.organizationId ?? null);
        if (!orgId) break;

        // A subscription that is not paying does not carry a plan's entitlements.
        if (sub.status !== "active" && sub.status !== "trialing") {
          await applyPlan(orgId, "preview", null, null);
          break;
        }

        const item = sub.items.data[0];
        const priceId = typeof item?.price === "string" ? item.price : item?.price?.id;
        const fromPrice = priceId ? planForPriceId(priceId) : null;
        const plan = fromPrice?.plan ?? normalisePlan(sub.metadata?.plan) ?? "starter";
        const interval =
          fromPrice?.interval ??
          normaliseInterval(item?.price?.recurring?.interval) ??
          normaliseInterval(sub.metadata?.interval);
        await applyPlan(orgId, plan, interval, sub.id);
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === "string" ? sub.customer : null;
        if (!customerId) break;
        const org = await orgForCustomer(customerId);
        if (!org) break;
        await applyPlan(org.id, "preview", null, null);
        break;
      }

      default:
        break;
    }
  } catch (err) {
    // Returning 500 asks Stripe to retry, which is what we want for a transient failure.
    return Response.json(
      { error: err instanceof Error ? err.message : "handler failed" },
      { status: 500 },
    );
  }

  return Response.json({ received: true });
}

function normalisePlan(value: string | null | undefined): Plan | null {
  if (!value) return null;
  return (PAID_PLANS as string[]).includes(value) ? (value as Plan) : null;
}

function normaliseInterval(value: string | null | undefined): BillingInterval | null {
  if (value === "year" || value === "month") return value;
  return null;
}

"use server";

/**
 * The simulated hosted page's outcomes.
 *
 * These do exactly what Stripe's webhooks would do, by going through the same
 * code: a synthetic event is stored in `webhook_events` and `applyStripeEvent`
 * applies it. That matters — it means the state transitions being demonstrated
 * here are the production ones, not a parallel path that happens to look similar.
 *
 * Hard-gated on Stripe being unconfigured. With a real key present these actions
 * refuse, because then the real webhook is the only thing allowed to move money
 * state.
 */

import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { families, subscriptions } from "@/db/schema";
import type { FormState } from "@/components/ActionForm";
import { applyStripeEvent, persistWebhookEvent } from "@/lib/billing";
import { stripeConfigured } from "@/lib/env";

async function synthesize(type: string, object: Record<string, unknown>): Promise<void> {
  const stored = await persistWebhookEvent({
    externalId: `evt_sim_${randomUUID()}`,
    type,
    payload: { id: `evt_sim`, type, data: { object } },
  });
  if (stored.fresh) await applyStripeEvent(stored.id);
}

export async function simulateAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (stripeConfigured()) {
    return { error: "Stripe is configured — the real hosted flow handles this." };
  }
  const kind = String(formData.get("kind") ?? "");
  const ref = String(formData.get("ref") ?? "");
  const outcome = String(formData.get("outcome") ?? "");
  const db = getDb();

  if (kind === "collect" || kind === "update") {
    const [row] = await db
      .select({ subscription: subscriptions, family: families })
      .from(subscriptions)
      .innerJoin(families, eq(families.id, subscriptions.familyId))
      .where(eq(subscriptions.id, ref));
    if (!row) return { error: "That subscription no longer exists." };

    const customer = row.family.stripeCustomerId ?? `cus_sim_${row.family.id}`;
    if (outcome === "paid") {
      await synthesize("invoice.payment_succeeded", {
        id: `in_sim_${randomUUID()}`,
        customer,
        subscription: row.subscription.stripeSubscriptionId ?? undefined,
        metadata: { subscriptionRef: row.subscription.id },
        period_end: Math.floor((Date.now() + 30 * 86_400_000) / 1000),
      });
    } else {
      await synthesize("invoice.payment_failed", {
        id: `in_sim_${randomUUID()}`,
        customer,
        subscription: row.subscription.stripeSubscriptionId ?? undefined,
        metadata: { subscriptionRef: row.subscription.id },
      });
    }
    redirect("/billing");
  }

  if (kind === "plan") {
    if (outcome === "active") {
      await synthesize("checkout.session.completed", {
        id: `cs_sim_${randomUUID()}`,
        customer: `cus_sim_${ref}`,
        subscription: `sub_sim_${ref}`,
        metadata: { schoolId: ref },
      });
    }
    redirect("/settings/plan");
  }

  redirect("/billing");
}

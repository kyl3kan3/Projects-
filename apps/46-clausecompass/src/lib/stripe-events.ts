/**
 * src/lib/stripe-events.ts
 *
 * What each Stripe event means for an account, decided in one pure function.
 *
 * `decideStripeEffect` takes the shape of an event and returns the effect to apply, so
 * the webhook's decision-making is unit-testable with no Stripe key — this environment
 * has none, and "the webhook compiles" is not evidence that a $19 payment grants
 * exactly one credit.
 *
 * The applying half (`applyStripeEffect`) is the only part that touches the database,
 * and it is idempotent: `purchases.stripe_ref` is unique, so a redelivered event cannot
 * grant twice.
 */

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, stripeEvents, type Plan } from "@/db/schema";
import { grantCredits, grantSubscriptionCredits } from "@/lib/billing";
import { PLANS } from "@/lib/plans";
import { appendAudit } from "@/lib/audit";

export interface StripeEventShape {
  id: string;
  type: string;
  data: {
    object: {
      id?: string;
      mode?: string | null;
      customer?: string | null;
      client_reference_id?: string | null;
      amount_total?: number | null;
      metadata?: Record<string, string> | null;
      subscription?: string | null;
      status?: string | null;
      /** invoice.paid */
      lines?: { data?: Array<{ period?: { end?: number | null } | null }> } | null;
      /** customer.subscription.* */
      items?: { data?: Array<{ price?: { id?: string | null } | null }> } | null;
      current_period_end?: number | null;
      cancel_at_period_end?: boolean | null;
    };
  };
}

export type StripeEffect =
  | { kind: "ignore"; reason: string }
  | {
      kind: "grant_one_time";
      accountId: string;
      credits: number;
      amountCents: number;
      stripeRef: string;
      customerId: string | null;
    }
  | {
      kind: "start_subscription";
      accountId: string;
      plan: Plan;
      customerId: string | null;
      subscriptionId: string | null;
    }
  | {
      kind: "grant_period";
      accountId: string;
      plan: Plan;
      periodEnd: Date;
      stripeRef: string;
    }
  | { kind: "set_plan"; accountId: string; plan: Plan; subscriptionId: string | null };

function planFromMetadata(metadata: Record<string, string> | null | undefined): Plan | null {
  const raw = metadata?.plan;
  if (raw === "freelancer" || raw === "studio" || raw === "per_contract") return raw;
  return null;
}

/** Pure: event in, intended effect out. */
export function decideStripeEffect(event: StripeEventShape): StripeEffect {
  const object = event.data.object;
  const accountId = object.metadata?.accountId ?? object.client_reference_id ?? null;

  switch (event.type) {
    case "checkout.session.completed": {
      if (!accountId) return { kind: "ignore", reason: "no account id on the session" };
      if (object.mode === "subscription") {
        const plan = planFromMetadata(object.metadata) ?? "freelancer";
        return {
          kind: "start_subscription",
          accountId,
          plan,
          customerId: object.customer ?? null,
          subscriptionId: object.subscription ?? null,
        };
      }
      // One-time: exactly one credit, whatever the amount, and the session id is the
      // idempotency key.
      return {
        kind: "grant_one_time",
        accountId,
        credits: 1,
        amountCents: object.amount_total ?? PLANS.per_contract.perContractCents,
        stripeRef: object.id ?? `session:${event.id}`,
        customerId: object.customer ?? null,
      };
    }
    case "invoice.paid": {
      if (!accountId) return { kind: "ignore", reason: "no account id on the invoice" };
      const plan = planFromMetadata(object.metadata) ?? "freelancer";
      const periodEndSeconds = object.lines?.data?.[0]?.period?.end ?? null;
      // No period end means no expiry to attach, and a credit with no expiry on a
      // subscription would quietly roll over — the pricing page says it does not.
      if (!periodEndSeconds) return { kind: "ignore", reason: "invoice carried no period end" };
      return {
        kind: "grant_period",
        accountId,
        plan,
        periodEnd: new Date(periodEndSeconds * 1000),
        stripeRef: object.id ?? `invoice:${event.id}`,
      };
    }
    case "customer.subscription.deleted": {
      if (!accountId) return { kind: "ignore", reason: "no account id on the subscription" };
      // Already-granted credits keep their expiry; only the plan changes.
      return { kind: "set_plan", accountId, plan: "per_contract", subscriptionId: null };
    }
    case "customer.subscription.updated": {
      if (!accountId) return { kind: "ignore", reason: "no account id on the subscription" };
      const plan = planFromMetadata(object.metadata);
      if (!plan) return { kind: "ignore", reason: "subscription carried no plan metadata" };
      return { kind: "set_plan", accountId, plan, subscriptionId: object.id ?? null };
    }
    default:
      return { kind: "ignore", reason: `unhandled event type ${event.type}` };
  }
}

/** Apply an effect. Records the event id first, so a duplicate delivery is a no-op. */
export async function applyStripeEffect(
  event: StripeEventShape,
  effect: StripeEffect,
): Promise<{ applied: boolean; note: string }> {
  const db = getDb();
  const inserted = await db
    .insert(stripeEvents)
    .values({ id: event.id, type: event.type })
    .onConflictDoNothing()
    .returning();
  if (inserted.length === 0) return { applied: false, note: "event already processed" };

  switch (effect.kind) {
    case "ignore":
      return { applied: false, note: effect.reason };
    case "grant_one_time": {
      if (effect.customerId) await attachCustomer(effect.accountId, effect.customerId);
      await grantCredits({
        accountId: effect.accountId,
        kind: "one_time",
        credits: effect.credits,
        amountCents: effect.amountCents,
        stripeRef: effect.stripeRef,
        note: "One contract review",
      });
      return { applied: true, note: "granted 1 credit" };
    }
    case "start_subscription": {
      if (effect.customerId) await attachCustomer(effect.accountId, effect.customerId);
      await db
        .update(accounts)
        .set({ plan: effect.plan, stripeSubscriptionId: effect.subscriptionId })
        .where(eq(accounts.id, effect.accountId));
      await appendAudit({
        accountId: effect.accountId,
        actor: "stripe",
        action: "plan_changed",
        target: effect.plan,
        metadata: { subscriptionId: effect.subscriptionId },
      });
      return { applied: true, note: `plan set to ${effect.plan}` };
    }
    case "grant_period": {
      await grantSubscriptionCredits(
        effect.accountId,
        effect.plan,
        effect.periodEnd,
        effect.stripeRef,
      );
      return { applied: true, note: `granted ${PLANS[effect.plan].monthlyCredits} credits` };
    }
    case "set_plan": {
      await db
        .update(accounts)
        .set({ plan: effect.plan, stripeSubscriptionId: effect.subscriptionId })
        .where(eq(accounts.id, effect.accountId));
      await appendAudit({
        accountId: effect.accountId,
        actor: "stripe",
        action: "plan_changed",
        target: effect.plan,
        metadata: { subscriptionId: effect.subscriptionId },
      });
      return { applied: true, note: `plan set to ${effect.plan}` };
    }
  }
}

async function attachCustomer(accountId: string, customerId: string): Promise<void> {
  const db = getDb();
  await db.update(accounts).set({ stripeCustomerId: customerId }).where(eq(accounts.id, accountId));
}

/**
 * src/server/billing.ts
 *
 * ChairFlow's own subscription, on the platform Stripe account, plus the webhook
 * bookkeeping both Stripe endpoints share.
 *
 * The webhook law, from ARCHITECTURE flow 6: **verify signature -> insert
 * `webhook_events` by event id (a duplicate is an ack and a stop) -> apply -> ack
 * fast.** The routes do the verifying; the applying lives here so the platform and
 * Connect endpoints cannot drift.
 *
 * The state that matters is `subscription_status`, not `plan`. `plan` says what the
 * stylist bought; the status says whether it is still being paid for, and
 * `lib/plans.ts` reads both. A cancellation therefore takes access away by writing a
 * status — there is no "downgrade the plan column" step that could be missed.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { stylists, webhookEvents, type Stylist } from "@/db/schema";
import { audit } from "@/server/audit";
import { gateway, stripe } from "@/server/payments";
import { env } from "@/lib/env";
import type { BillablePlan, Plan } from "@/lib/plans";

export async function recordWebhookEvent(input: {
  provider: "stripe" | "twilio";
  externalId: string;
  type: string;
  payload: Record<string, unknown>;
}): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .insert(webhookEvents)
    .values(input)
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id });
  return rows.length > 0;
}

export async function markWebhookProcessed(
  provider: "stripe" | "twilio",
  externalId: string,
): Promise<void> {
  const db = getDb();
  await db
    .update(webhookEvents)
    .set({ processedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(webhookEvents.provider, provider), eq(webhookEvents.externalId, externalId)));
}

/** Find the stylist a Stripe object belongs to, by metadata first then customer id. */
export async function stylistForStripe(input: {
  stylistId?: string | null;
  customerId?: string | null;
  accountId?: string | null;
}): Promise<Stylist | null> {
  const db = getDb();
  if (input.stylistId) {
    const [found] = await db.select().from(stylists).where(eq(stylists.id, input.stylistId));
    if (found) return found;
  }
  if (input.customerId) {
    const [found] = await db
      .select()
      .from(stylists)
      .where(eq(stylists.stripeCustomerId, input.customerId));
    if (found) return found;
  }
  if (input.accountId) {
    const [found] = await db
      .select()
      .from(stylists)
      .where(eq(stylists.stripeAccountId, input.accountId));
    if (found) return found;
  }
  return null;
}

const PLAN_BY_PRICE_ENV: Array<{ plan: Plan; key: BillablePlan }> = [
  { plan: "chair", key: "chair" },
  { plan: "book", key: "book" },
];

function planForPrice(priceId: string | null, hint: string | null): Plan | null {
  if (hint === "chair" || hint === "book" || hint === "shop_member") return hint;
  if (!priceId) return null;
  const prices = env.stripePrices;
  for (const { plan, key } of PLAN_BY_PRICE_ENV) {
    if (prices[key] && prices[key] === priceId) return plan;
  }
  return null;
}

/**
 * Apply a subscription's state to a stylist, idempotently.
 *
 * Called from the webhook for every subscription event Stripe sends. Writing the status
 * verbatim is deliberate: `lib/plans.ts` decides what each status means, and keeping
 * that decision in one tested place is what stops "cancelled" quietly meaning "still
 * has everything".
 */
export async function applySubscription(input: {
  stylistId: string;
  subscriptionId: string | null;
  status: string;
  priceId?: string | null;
  planHint?: string | null;
  customerId?: string | null;
}): Promise<void> {
  const db = getDb();
  const plan = planForPrice(input.priceId ?? null, input.planHint ?? null);
  const patch: Partial<typeof stylists.$inferInsert> = {
    stripeSubscriptionId: input.subscriptionId,
    subscriptionStatus: input.status,
    updatedAt: new Date(),
  };
  if (plan) patch.plan = plan;
  if (input.customerId) patch.stripeCustomerId = input.customerId;

  await db.update(stylists).set(patch).where(eq(stylists.id, input.stylistId));
  await audit({
    actor: { kind: "system" },
    action: "billing.subscription",
    target: input.stylistId,
    stylistId: input.stylistId,
    metadata: { status: input.status, plan: plan ?? "unchanged", subscriptionId: input.subscriptionId },
  });
}

export type CheckoutOutcome =
  | { ok: true; url: string }
  | { ok: false; reason: string };

/**
 * Start a subscription. Returns a reason rather than throwing when Stripe is not
 * configured, so the billing screen can show the plans and say plainly that checkout is
 * unavailable instead of erroring.
 */
export async function startCheckout(input: {
  stylist: Stylist;
  email: string;
  plan: BillablePlan;
}): Promise<CheckoutOutcome> {
  const priceId = env.stripePrices[input.plan];
  if (!priceId) {
    return {
      ok: false,
      reason: `No Stripe price is configured for the ${input.plan} plan (STRIPE_PRICE_${input.plan.toUpperCase()}).`,
    };
  }
  const session = await gateway().createSubscriptionCheckout({
    stylistId: input.stylist.id,
    plan: input.plan,
    priceId,
    customerId: input.stylist.stripeCustomerId,
    email: input.email,
    successUrl: `${env.appUrl}/settings/billing?checkout=done`,
    cancelUrl: `${env.appUrl}/settings/billing`,
  });
  if (!session) {
    return {
      ok: false,
      reason: "Stripe is not configured in this environment, so checkout cannot open.",
    };
  }
  return { ok: true, url: session.url };
}

export async function openPortal(stylist: Stylist): Promise<CheckoutOutcome> {
  if (!stylist.stripeCustomerId) {
    return { ok: false, reason: "There is no Stripe customer for this account yet." };
  }
  const session = await gateway().createPortalSession({
    customerId: stylist.stripeCustomerId,
    returnUrl: `${env.appUrl}/settings/billing`,
  });
  if (!session) {
    return { ok: false, reason: "Stripe is not configured in this environment." };
  }
  return { ok: true, url: session.url };
}

/* ------------------------------------------------------------------ */
/* Connect Express onboarding                                          */
/* ------------------------------------------------------------------ */

export interface ConnectOutcome {
  url: string | null;
  simulated: boolean;
  message: string;
}

/**
 * Start (or resume) Express onboarding.
 *
 * The account is created once and stored; the link is short-lived and re-mintable, which
 * is how a stylist who abandoned KYC halfway picks it back up.
 */
export async function startConnectOnboarding(stylist: Stylist, email: string): Promise<ConnectOutcome> {
  const db = getDb();
  const gw = gateway();
  let accountId = stylist.stripeAccountId;
  if (!accountId) {
    const created = await gw.createExpressAccount({ email, displayName: stylist.displayName });
    accountId = created.accountId;
    await db
      .update(stylists)
      .set({ stripeAccountId: accountId, updatedAt: new Date() })
      .where(eq(stylists.id, stylist.id));
  }

  const link = await gw.createOnboardingLink({
    accountId,
    returnUrl: `${env.appUrl}/setup?connect=done`,
    refreshUrl: `${env.appUrl}/setup?connect=retry`,
  });

  if (gw.simulated) {
    // Nothing to onboard against: mark the account usable so the money spine can be
    // exercised, and say so wherever it shows.
    await db
      .update(stylists)
      .set({ connectStatus: "active", updatedAt: new Date() })
      .where(eq(stylists.id, stylist.id));
    return {
      url: null,
      simulated: true,
      message:
        "Stripe is not configured in this environment, so payouts are simulated: cards are recorded, never charged.",
    };
  }

  return { url: link.url, simulated: false, message: "" };
}

/**
 * Which card did a hosted Checkout session end up saving, and what are its last four?
 *
 * `mode: "setup"` leaves it on the SetupIntent; `mode: "payment"` with
 * `setup_future_usage: "off_session"` leaves it on the PaymentIntent. Both live on the stylist's
 * own Connect account, so every call carries `{ stripeAccount }`.
 *
 * Unexercised: there is no Stripe key in this environment, so no hosted session has ever
 * completed here.
 */
export async function resolveHostedCard(input: {
  accountId: string;
  setupIntentId: string | null;
  paymentIntentId: string | null;
}): Promise<{ paymentMethodId: string; last4: string } | null> {
  const options = { stripeAccount: input.accountId };
  let paymentMethodId: string | null = null;
  if (input.setupIntentId) {
    const intent = await stripe().setupIntents.retrieve(input.setupIntentId, options);
    paymentMethodId = typeof intent.payment_method === "string" ? intent.payment_method : null;
  } else if (input.paymentIntentId) {
    const intent = await stripe().paymentIntents.retrieve(input.paymentIntentId, options);
    paymentMethodId = typeof intent.payment_method === "string" ? intent.payment_method : null;
  }
  if (!paymentMethodId) return null;
  const method = await stripe().paymentMethods.retrieve(paymentMethodId, options);
  return { paymentMethodId, last4: method.card?.last4 ?? "----" };
}

/** Refresh `connect_status` from Stripe — called by the account.updated webhook. */
export async function refreshConnectStatus(stylistId: string, accountId: string): Promise<void> {
  const db = getDb();
  const ready = await gateway().accountReady(accountId);
  await db
    .update(stylists)
    .set({ connectStatus: ready ? "active" : "pending", updatedAt: new Date() })
    .where(eq(stylists.id, stylistId));
}

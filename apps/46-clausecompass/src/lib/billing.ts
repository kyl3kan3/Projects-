/**
 * src/lib/billing.ts
 *
 * Stripe billing and the credits ledger.
 *
 * The ledger is the single source of truth for "can this account run a review". There
 * is no `credits_remaining` counter on the account, deliberately: a cached number is
 * how a customer ends up looking out of credit after a refund, or in credit after an
 * expiry. Balance is derived from `purchases` every time it is asked for.
 *
 * Consumption is FIFO by expiry — soonest-expiring grant first — so a monthly
 * subscription credit is spent before a one-time purchase that never expires. Spending
 * the wrong one is invisible until the month rolls and the customer loses a credit they
 * paid cash for.
 *
 * A failed review refunds its credit. That is not a nicety: this product asks people to
 * hand over the contract they are afraid of, and charging them for a pipeline crash
 * would be the fastest possible way to lose them.
 */

import { and, asc, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import Stripe from "stripe";
import { getDb } from "@/db";
import { contracts, purchases, type Plan, type PurchaseKind } from "@/db/schema";
import { env, stripeConfigured } from "@/lib/env";
import { OVERAGE_CENTS, PLANS } from "@/lib/plans";
import { appendAudit } from "@/lib/audit";

export class BillingError extends Error {}
export class NoCreditsError extends BillingError {}

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripeConfigured()) throw new BillingError("Stripe is not configured");
  if (!_stripe) {
    // Constructed lazily so `next build`, which has no key, never builds one.
    // The version is pinned, never "latest": an account-level API upgrade must not
    // change what this code receives.
    _stripe = new Stripe(env.stripeSecretKey, { apiVersion: "2025-08-27.basil" });
  }
  return _stripe;
}

/* --------------------------------------------------------------- balance */

/** Grants that still have credits left and have not expired. */
function availableGrants(accountId: string) {
  const db = getDb();
  return db
    .select()
    .from(purchases)
    .where(
      and(
        eq(purchases.accountId, accountId),
        sql`${purchases.creditsUsed} < ${purchases.credits}`,
        // Expiry is compared by the database against its own clock. Passing a JS
        // Date into a raw fragment is the bug that has bitten five apps here.
        or(isNull(purchases.expiresAt), gt(purchases.expiresAt, sql`now()`)),
      ),
    )
    .orderBy(asc(purchases.expiresAt), asc(purchases.createdAt));
}

export async function creditBalance(accountId: string): Promise<number> {
  const rows = await availableGrants(accountId);
  return rows.reduce((sum, r) => sum + (r.credits - r.creditsUsed), 0);
}

export async function ledger(accountId: string, limit = 20) {
  const db = getDb();
  return db
    .select()
    .from(purchases)
    .where(eq(purchases.accountId, accountId))
    .orderBy(desc(purchases.createdAt))
    .limit(limit);
}

/* ---------------------------------------------------------------- grants */

export interface GrantInput {
  accountId: string;
  kind: PurchaseKind;
  credits: number;
  amountCents?: number;
  stripeRef?: string | null;
  note?: string;
  expiresAt?: Date | null;
}

/**
 * Record a credit grant. `stripeRef` is unique in the schema, so a webhook that
 * arrives twice cannot grant twice.
 */
export async function grantCredits(input: GrantInput): Promise<string | null> {
  const db = getDb();
  const [row] = await db
    .insert(purchases)
    .values({
      accountId: input.accountId,
      kind: input.kind,
      credits: input.credits,
      amountCents: input.amountCents ?? 0,
      stripeRef: input.stripeRef ?? null,
      note: input.note ?? null,
      expiresAt: input.expiresAt ?? null,
    })
    .onConflictDoNothing({ target: purchases.stripeRef })
    .returning();
  if (row) {
    await appendAudit({
      accountId: input.accountId,
      actor: "billing",
      action: "credits_granted",
      target: row.id,
      metadata: { kind: input.kind, credits: input.credits, amountCents: input.amountCents ?? 0 },
    });
  }
  return row?.id ?? null;
}

/** The monthly subscription grant: credits that expire with the period. */
export async function grantSubscriptionCredits(
  accountId: string,
  plan: Plan,
  periodEnd: Date,
  stripeRef: string,
): Promise<void> {
  const spec = PLANS[plan];
  if (spec.monthlyCredits <= 0) return;
  await grantCredits({
    accountId,
    kind: "subscription_grant",
    credits: spec.monthlyCredits,
    amountCents: spec.monthlyCents,
    stripeRef,
    note: `${spec.name} plan — ${spec.monthlyCredits} reviews this period`,
    expiresAt: periodEnd,
  });
}

/* ------------------------------------------------------------ consumption */

/**
 * Reserve one credit for a contract.
 *
 * The update is guarded by `credits_used < credits` in its WHERE clause, so two
 * simultaneous uploads cannot both claim the last credit — the second one finds no
 * row and moves to the next grant.
 */
export async function reserveCredit(accountId: string, contractId: string): Promise<string> {
  const db = getDb();
  const grants = await availableGrants(accountId);
  for (const grant of grants) {
    const claimed = await db
      .update(purchases)
      .set({ creditsUsed: sql`${purchases.creditsUsed} + 1` })
      .where(and(eq(purchases.id, grant.id), sql`${purchases.creditsUsed} < ${purchases.credits}`))
      .returning({ id: purchases.id });
    if (claimed.length > 0) {
      await db
        .update(contracts)
        .set({ creditPurchaseId: grant.id })
        .where(eq(contracts.id, contractId));
      return grant.id;
    }
  }
  throw new NoCreditsError("No review credits available");
}

/** Give the credit back. Called when a review fails, or when it is deleted unrun. */
export async function refundCredit(contractId: string): Promise<boolean> {
  const db = getDb();
  const [contract] = await db.select().from(contracts).where(eq(contracts.id, contractId));
  if (!contract?.creditPurchaseId) return false;
  const refunded = await db
    .update(purchases)
    .set({ creditsUsed: sql`greatest(${purchases.creditsUsed} - 1, 0)` })
    .where(and(eq(purchases.id, contract.creditPurchaseId), gt(purchases.creditsUsed, 0)))
    .returning({ id: purchases.id });
  await db.update(contracts).set({ creditPurchaseId: null }).where(eq(contracts.id, contractId));
  if (refunded.length > 0) {
    await appendAudit({
      accountId: contract.accountId,
      actor: "billing",
      action: "credit_refunded",
      target: contractId,
      metadata: { purchaseId: contract.creditPurchaseId, reason: contract.failureReason ?? "review failed" },
    });
  }
  return refunded.length > 0;
}

/* -------------------------------------------------------------- checkout */

/** The $19 one-time purchase. */
export async function createOneTimeCheckout(
  accountId: string,
  email: string,
  returnPath: string,
): Promise<string> {
  const stripe = getStripe();
  const price = env.stripePrices.perContract;
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: email,
    line_items: price
      ? [{ price, quantity: 1 }]
      : [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: PLANS.per_contract.perContractCents,
              product_data: { name: "ClauseCompass — one contract review" },
            },
          },
        ],
    client_reference_id: accountId,
    metadata: { accountId, kind: "one_time" },
    success_url: `${env.appUrl}${returnPath}?purchase=ok`,
    cancel_url: `${env.appUrl}${returnPath}?purchase=cancelled`,
  });
  if (!session.url) throw new BillingError("Stripe did not return a checkout URL");
  return session.url;
}

export async function createSubscriptionCheckout(
  accountId: string,
  email: string,
  plan: Exclude<Plan, "per_contract">,
  returnPath: string,
): Promise<string> {
  const stripe = getStripe();
  const price = plan === "freelancer" ? env.stripePrices.freelancer : env.stripePrices.studio;
  if (!price) {
    throw new BillingError(
      `No Stripe price id configured for the ${PLANS[plan].name} plan (STRIPE_PRICE_${plan.toUpperCase()})`,
    );
  }
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: email,
    line_items: [{ price, quantity: 1 }],
    client_reference_id: accountId,
    metadata: { accountId, plan },
    success_url: `${env.appUrl}${returnPath}?subscribed=ok`,
    cancel_url: `${env.appUrl}${returnPath}?subscribed=cancelled`,
  });
  if (!session.url) throw new BillingError("Stripe did not return a checkout URL");
  return session.url;
}

/**
 * An overage review. The charge is never silent: the caller must have shown the price
 * and taken a confirmation, and the invoice item is created before the credit exists.
 */
export async function chargeOverage(
  accountId: string,
  stripeCustomerId: string | null,
): Promise<void> {
  if (stripeConfigured()) {
    if (!stripeCustomerId) throw new BillingError("This account has no Stripe customer to bill");
    const stripe = getStripe();
    const item = await stripe.invoiceItems.create({
      customer: stripeCustomerId,
      amount: OVERAGE_CENTS,
      currency: "usd",
      description: "ClauseCompass — additional contract review",
    });
    await grantCredits({
      accountId,
      kind: "overage",
      credits: 1,
      amountCents: OVERAGE_CENTS,
      stripeRef: item.id,
      note: "Additional review, billed on your next invoice",
    });
    return;
  }
  throw new BillingError("Stripe is not configured, so an extra review cannot be billed");
}

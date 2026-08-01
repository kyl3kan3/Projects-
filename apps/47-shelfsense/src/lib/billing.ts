/**
 * Shopify Billing.
 *
 * App Store distribution requires app charges to run through Shopify Billing
 * (ARCHITECTURE.md records this as a deliberate deviation from the portfolio's
 * Stripe default), so there is no card form anywhere in this app — the charge
 * lands on the merchant's existing Shopify invoice.
 *
 * There is no Shopify credential in this environment, so the mutation itself is
 * unexercised. Everything around it is not: plan selection, the SKU cap, what
 * happens at the cap, trial arithmetic, and the `app_subscriptions/update`
 * downgrade path are all plain functions over the shop row.
 *
 * The cap rule is the part worth being careful about. Going over it must never
 * silently stop forecasting, and must never delete anything: SKUs beyond the cap
 * keep their history and stop being *recomputed*, in a defined order (least
 * recently selling first — see lib/forecast-run.ts), and the app says so with an
 * upgrade path. A merchant who imports 400 SKUs onto Counter should read a banner,
 * not discover the truncation by counting rows.
 */

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { shops, type Plan, type Shop } from "@/db/schema";
import { env } from "@/lib/env";
import { ValidationError } from "@/lib/errors";
import { capState, planForSkuCount, plan as planDef, TRIAL_DAYS, type CapState } from "@/lib/plans";
import { adminFor } from "@/lib/shopify-admin";

export interface BillingState {
  plan: Plan;
  planName: string;
  priceCents: number;
  trialEndsAt: Date | null;
  trialDaysLeft: number | null;
  trialActive: boolean;
  chargeId: string | null;
  cap: CapState;
  /** Set when Shopify Billing cannot be reached from this environment. */
  unavailableReason: string | null;
}

export function trialActive(shop: Pick<Shop, "trialEndsAt">, now: Date = new Date()): boolean {
  return shop.trialEndsAt !== null && shop.trialEndsAt.getTime() > now.getTime();
}

export function trialDaysLeft(
  shop: Pick<Shop, "trialEndsAt">,
  now: Date = new Date(),
): number | null {
  if (!shop.trialEndsAt) return null;
  const ms = shop.trialEndsAt.getTime() - now.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000);
}

export function billingState(shop: Shop, now: Date = new Date()): BillingState {
  const def = planDef(shop.plan);
  return {
    plan: shop.plan,
    planName: def.name,
    priceCents: def.priceCents,
    trialEndsAt: shop.trialEndsAt,
    trialDaysLeft: trialDaysLeft(shop, now),
    trialActive: trialActive(shop, now),
    chargeId: shop.shopifyChargeId,
    cap: capState(shop.plan, shop.skuCount),
    unavailableReason: shop.isDemo
      ? "This is the demo store, so no Shopify charge is created."
      : null,
  };
}

/** Start the trial clock. Called once, at install. */
export function trialEndFrom(now: Date = new Date()): Date {
  return new Date(now.getTime() + TRIAL_DAYS * 86_400_000);
}

/**
 * Ask Shopify to create the recurring charge and return the URL the merchant has
 * to approve at.
 *
 * The plan is *not* written to the shop here. Shopify's `appSubscriptionCreate`
 * returns a pending subscription and the merchant may never approve it; writing the
 * plan optimistically would give away a Warehouse plan to anyone who clicks
 * "Upgrade" and then closes the tab. The plan changes when the approval comes back
 * (`confirmSubscription`) or when `app_subscriptions/update` says it is active.
 */
export async function createSubscription(
  shop: Shop,
  plan: Plan,
): Promise<{ confirmationUrl: string | null; chargeId: string }> {
  if (shop.isDemo) {
    throw new ValidationError(
      "The demo store cannot be billed. Connect your own Shopify store to change plans.",
    );
  }
  const admin = adminFor(shop);
  const returnUrl = `${env.appUrl}/settings/billing?charge=confirm`;
  // Test charges outside production: a real charge on a development store is a
  // real charge.
  const handle = await admin.createSubscription(plan, returnUrl, process.env.NODE_ENV !== "production");
  return { confirmationUrl: handle.confirmationUrl, chargeId: handle.chargeId };
}

/**
 * Confirm a subscription after the merchant returns from Shopify's approval screen.
 *
 * Trusts Shopify's own view of the installation rather than the query string: the
 * `charge_id` in the return URL is attacker-supplied, so the plan is only written
 * after `currentAppInstallation.activeSubscriptions` says the charge is active.
 */
export async function confirmSubscription(shop: Shop): Promise<{ plan: Plan | null }> {
  const admin = adminFor(shop);
  const active = await admin.currentSubscription();
  if (!active || active.status.toUpperCase() !== "ACTIVE") return { plan: null };

  const plan = planFromSubscriptionName(active.planName);
  if (!plan) return { plan: null };

  const db = getDb();
  await db
    .update(shops)
    .set({ plan, shopifyChargeId: active.chargeId, updatedAt: new Date() })
    .where(eq(shops.id, shop.id));
  return { plan };
}

/** "ShelfSense Backroom" -> "backroom". Null for anything unrecognised. */
export function planFromSubscriptionName(name: string): Plan | null {
  const lower = (name ?? "").toLowerCase();
  if (lower.includes("warehouse")) return "warehouse";
  if (lower.includes("backroom")) return "backroom";
  if (lower.includes("counter")) return "counter";
  return null;
}

/**
 * Apply an `app_subscriptions/update` webhook.
 *
 * A cancelled or expired subscription drops the shop to Counter rather than
 * deactivating it: the merchant's history is theirs, and a dashboard that empties
 * itself on a failed card is a support ticket and a bad review.
 */
export async function applySubscriptionUpdate(
  shop: Shop,
  payload: { app_subscription?: { admin_graphql_api_id?: string; status?: string; name?: string } },
): Promise<{ plan: Plan; status: string }> {
  const sub = payload.app_subscription ?? {};
  const status = (sub.status ?? "").toUpperCase();
  const named = planFromSubscriptionName(sub.name ?? "");
  const chargeId = sub.admin_graphql_api_id?.split("/").pop() ?? shop.shopifyChargeId;

  const db = getDb();
  if (status === "ACTIVE" && named) {
    await db
      .update(shops)
      .set({ plan: named, shopifyChargeId: chargeId, updatedAt: new Date() })
      .where(eq(shops.id, shop.id));
    return { plan: named, status };
  }

  if (status === "CANCELLED" || status === "EXPIRED" || status === "FROZEN" || status === "DECLINED") {
    await db
      .update(shops)
      .set({ plan: "counter", shopifyChargeId: null, updatedAt: new Date() })
      .where(eq(shops.id, shop.id));
    return { plan: "counter", status };
  }

  return { plan: shop.plan, status: status || "PENDING" };
}

/**
 * The in-app message when a shop is over its cap. Never a silent failure, and
 * never a hard stop — the dashboard keeps working for the SKUs inside the cap.
 */
export function capMessage(shop: Shop): { headline: string; detail: string; upgradeTo: Plan } | null {
  const state = capState(shop.plan, shop.skuCount);
  if (!state.overCap) return null;
  const target = state.upgradeTo ?? planForSkuCount(shop.skuCount);
  return {
    headline: `${state.over.toLocaleString("en-US")} SKUs beyond your ${planDef(shop.plan).name} plan`,
    detail: target
      ? `Forecasting covers the ${state.cap.toLocaleString("en-US")} SKUs that sold most recently. ${target.name} covers ${target.skuCap.toLocaleString("en-US")}. Nothing has been deleted.`
      : `Forecasting covers the ${state.cap.toLocaleString("en-US")} SKUs that sold most recently. Get in touch and we will size a plan around your catalogue.`,
    upgradeTo: target?.plan ?? "warehouse",
  };
}

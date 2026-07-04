/**
 * src/lib/billing.ts
 *
 * Shopify Billing API integration (App Store apps must bill through
 * Shopify -- see ARCHITECTURE.md stack deviation note). Creates and
 * manages the recurring app subscription for the three plans.
 *
 * TODO:
 * - [ ] Plan catalog: counter $59 / backroom $99 / warehouse $199 with
 *       SKU caps (250 / 1,000 / 5,000) and 14-day trial.
 * - [ ] createSubscription(shop, plan): appSubscriptionCreate mutation,
 *       return confirmationUrl for merchant approval.
 * - [ ] handleApprovalCallback(chargeId): verify active, persist plan +
 *       shopify_charge_id on the shop.
 * - [ ] enforceSkuCap(shop): tracked-variant count vs plan cap; over-cap
 *       => in-app upgrade prompt (never a silent failure or data loss).
 * - [ ] Webhook app_subscriptions/update: downgrade/cancel handling.
 * - [ ] Test-charge flag wired to non-production environments.
 */

import type { Plan } from "../db/schema";

export interface PlanDef {
  plan: Plan;
  priceUsd: number;
  skuCap: number;
}

export function planCatalog(): PlanDef[] {
  throw new Error("Not implemented");
}

export function createSubscription(_shopId: string, _plan: Plan): Promise<string> {
  throw new Error("Not implemented");
}

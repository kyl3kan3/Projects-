/**
 * GitHub Marketplace plan sync.
 *
 * Primary billing, per README.md: one-click purchase, GitHub collects, we get a
 * `marketplace_purchase` event. Two details decide whether this is correct:
 *
 *  - **A cancellation does not downgrade now.** GitHub sends `cancelled` when the
 *    customer cancels, and `effective_date` is when the current period ends. The
 *    plan is left in force and `cancels_at` recorded; the downgrade happens when
 *    the period ends. Cutting reviews off at cancellation time would take away
 *    what the customer has already paid for.
 *  - **A plan change is not always an upgrade.** `changed` carries the new plan,
 *    which can be smaller. `effective_date` decides again: an upgrade is immediate,
 *    a downgrade waits.
 *
 * Marketplace plan ids are per-listing, so they come from env rather than being
 * hard-coded. An unrecognised plan id maps to free and is logged loudly, because
 * silently treating a paying customer as free is the worst failure here.
 */

import type { PlanId } from "../db/schema";
import { env } from "../lib/env";
import { log as rootLog } from "../lib/logger";

export type MarketplaceAction = "purchased" | "changed" | "cancelled" | "pending_change" | "pending_change_cancelled";

export interface MarketplacePurchasePayload {
  action: MarketplaceAction;
  effective_date?: string | null;
  marketplace_purchase: {
    account: { id?: number; login?: string; type?: string };
    billing_cycle?: string | null;
    unit_count?: number | null;
    on_free_trial?: boolean | null;
    free_trial_ends_on?: string | null;
    plan?: { id?: number; name?: string; monthly_price_in_cents?: number } | null;
  };
  previous_marketplace_purchase?: {
    plan?: { id?: number } | null;
    unit_count?: number | null;
  } | null;
}

export interface PlanSyncDecision {
  /** The plan the installation should be on after this event. */
  plan: PlanId;
  seatLimit: number;
  status: "active" | "canceled" | "pending_change";
  /** Set when the change takes effect later; the plan above is the current one. */
  cancelsAt: Date | null;
  /** The plan it will drop to at `cancelsAt`, if any. */
  pendingPlan: PlanId | null;
  note: string;
}

export function planForMarketplaceId(planId: number | undefined | null): PlanId {
  if (planId === undefined || planId === null) return "free";
  const ids = env.marketplacePlanIds;
  if (ids.business && String(planId) === ids.business) return "business";
  if (ids.team && String(planId) === ids.team) return "team";
  return "free";
}

const PLAN_RANK: Record<PlanId, number> = { free: 0, team: 1, business: 2 };

/**
 * Decide the effect of one marketplace event.
 *
 * Pure, so the ladder (purchase → upgrade → downgrade at period end →
 * cancellation → reinstatement) is testable without a webhook.
 */
export function syncMarketplacePurchase(
  payload: MarketplacePurchasePayload,
  currentPlan: PlanId,
  now: Date,
): PlanSyncDecision {
  const purchase = payload.marketplace_purchase;
  const nextPlan = planForMarketplaceId(purchase.plan?.id);
  const seatLimit = Math.max(0, purchase.unit_count ?? 0);
  const effective = payload.effective_date ? new Date(payload.effective_date) : null;
  const effectiveInFuture = effective !== null && effective.getTime() > now.getTime();

  switch (payload.action) {
    case "purchased":
      return {
        plan: nextPlan,
        seatLimit,
        status: "active",
        cancelsAt: null,
        pendingPlan: null,
        note: `purchased ${nextPlan} with ${seatLimit} seats`,
      };

    case "changed": {
      const isDowngrade = PLAN_RANK[nextPlan] < PLAN_RANK[currentPlan];
      if (isDowngrade && effectiveInFuture) {
        return {
          plan: currentPlan,
          seatLimit,
          status: "pending_change",
          cancelsAt: effective,
          pendingPlan: nextPlan,
          note: `downgrade to ${nextPlan} at ${effective.toISOString()}`,
        };
      }
      return {
        plan: nextPlan,
        seatLimit,
        status: "active",
        cancelsAt: null,
        pendingPlan: null,
        note: `changed to ${nextPlan} with ${seatLimit} seats`,
      };
    }

    case "pending_change":
      return {
        plan: currentPlan,
        seatLimit,
        status: "pending_change",
        cancelsAt: effective,
        pendingPlan: nextPlan,
        note: `pending change to ${nextPlan}`,
      };

    case "pending_change_cancelled":
      return {
        plan: currentPlan,
        seatLimit,
        status: "active",
        cancelsAt: null,
        pendingPlan: null,
        note: "pending change cancelled",
      };

    case "cancelled":
      // Keep the plan until the period ends; free reviews continue either way.
      return {
        plan: effectiveInFuture ? currentPlan : "free",
        seatLimit: effectiveInFuture ? seatLimit : 0,
        status: "canceled",
        cancelsAt: effective,
        pendingPlan: "free",
        note: effectiveInFuture
          ? `cancelled, ${currentPlan} until ${effective.toISOString()}`
          : "cancelled, downgraded to free",
      };
  }
}

/**
 * Apply a decision whose effective date has arrived.
 *
 * Called by the sweep so a scheduled downgrade actually happens: without this a
 * `pending_change` would sit in the table forever and the customer would keep a
 * plan they stopped paying for.
 */
export function pendingChangeDue(
  subscription: { cancelsAt: Date | null; plan: PlanId },
  pendingPlan: PlanId,
  now: Date,
): PlanId | null {
  if (subscription.cancelsAt === null) return null;
  if (subscription.cancelsAt.getTime() > now.getTime()) return null;
  if (pendingPlan === subscription.plan) return null;
  return pendingPlan;
}

export function logUnknownPlan(payload: MarketplacePurchasePayload): void {
  const id = payload.marketplace_purchase.plan?.id;
  if (planForMarketplaceId(id) === "free" && id !== undefined && id !== null) {
    rootLog.error(
      { marketplacePlanId: id, name: payload.marketplace_purchase.plan?.name },
      "marketplace plan id is not configured; installation treated as free",
    );
  }
}

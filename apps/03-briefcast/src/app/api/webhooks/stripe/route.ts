/**
 * src/app/api/webhooks/stripe/route.ts
 *
 * Stripe webhook receiver. Drives subscription state and plan entitlements.
 *
 * Events handled:
 * - checkout.session.completed        -> attach subscription to org
 * - customer.subscription.updated     -> plan/seat/status changes
 * - customer.subscription.deleted     -> downgrade org, stop bot scheduling
 * - invoice.payment_failed            -> mark past_due, trigger dunning email
 *
 * TODO:
 * - [ ] Verify signature with stripe.webhooks.constructEvent (raw body!) and
 *       STRIPE_WEBHOOK_SECRET
 * - [ ] Upsert subscriptions row keyed by stripe_subscription_id
 * - [ ] Update organizations.plan from the subscription's price metadata
 * - [ ] past_due: lock bot scheduling but never lock data access
 * - [ ] Return 200 for unhandled event types; log everything
 */

import { NextRequest, NextResponse } from "next/server";

export async function POST(_req: NextRequest): Promise<NextResponse> {
  throw new Error("Not implemented");
}

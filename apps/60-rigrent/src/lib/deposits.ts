/**
 * src/lib/deposits.ts
 *
 * The deposit hold, joined up: gateway + database + audit trail.
 *
 * The rule the product is sold on, implemented here and nowhere else: **money
 * moves only against a documented claim.** `releaseHold` cancels; `captureFor`
 * captures exactly the settled claim total and lets Stripe release the rest; and
 * there is no function in this file that captures an amount somebody typed.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, conditionPhotos, damageClaims, orders } from "@/db/schema";
import { applyDepositEvent } from "@/lib/billing";
import { audit } from "@/lib/audit";
import { depositGateway, depositsAreSimulated } from "@/lib/deposit-gateway";
import { env } from "@/lib/env";
import { getOrder } from "@/lib/orders";

export interface StartHoldResult {
  /** Send the customer here to authorise. Null when the hold is already in place. */
  redirectUrl: string | null;
  held: boolean;
  reason: string;
}

/**
 * Start the authorisation hold for an accepted order.
 *
 * With a real Stripe key this returns a hosted Checkout URL and the hold lands
 * when the customer finishes. Two independent paths then bring the result back —
 * the Connect webhook and the customer's own return to `/q/[token]?deposit=…` —
 * and both funnel into `applyDepositEvent`, which is idempotent. That redundancy
 * is deliberate: a hosted redirect whose only completion path is a webhook will,
 * sooner or later, drop a customer back onto a signed contract with no order
 * behind it.
 *
 * With no key the simulator marks the hold placed immediately and every screen
 * that shows it says "simulated".
 */
export async function startHold(
  accountId: string,
  orderId: string,
  /** The customer's own quote token, so Stripe returns them to their document. */
  quoteToken?: string | null,
): Promise<StartHoldResult> {
  const db = getDb();
  const full = await getOrder(accountId, orderId);
  if (!full) throw new Error("That order is not in this account.");
  const { order, customer } = full;

  if (order.depositCents <= 0) {
    await db
      .update(orders)
      .set({ depositStatus: "none", status: "confirmed", updatedAt: new Date() })
      .where(eq(orders.id, order.id));
    return { redirectUrl: null, held: false, reason: "No deposit is required on this order." };
  }
  if (order.depositStatus === "held") {
    return { redirectUrl: null, held: true, reason: "The deposit is already held." };
  }

  const [account] = await db.select().from(accounts).where(eq(accounts.id, accountId));
  // Stripe substitutes the session id into the success URL, which is how the
  // return leg knows what to confirm without trusting anything in the query
  // string. Without a customer token (a staff-initiated retry) the redirect
  // lands on the order screen instead.
  const base = quoteToken
    ? `${env.appUrl}/q/${quoteToken}`
    : `${env.appUrl}/orders/${order.id}`;
  const gateway = depositGateway();
  const result = await gateway.createHold({
    orderId: order.id,
    orderNumber: order.number,
    amountCents: order.depositCents,
    currency: "usd",
    customerEmail: customer.email,
    docHash: order.docHash,
    connectAccountId: account?.stripeAccountId ?? null,
    returnUrl: `${base}?deposit=done&session={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${base}?deposit=cancelled`,
  });

  if (result.held && result.paymentIntentId) {
    await applyDepositEvent({
      orderId: order.id,
      kind: "held",
      paymentIntentId: result.paymentIntentId,
      amountCents: order.depositCents,
      actor: "system:simulated-gateway",
    });
    return {
      redirectUrl: null,
      held: true,
      reason: depositsAreSimulated()
        ? "Simulated hold placed — no card was contacted, because no Stripe key is configured."
        : "Hold placed.",
    };
  }

  if (result.paymentIntentId) {
    await db
      .update(orders)
      .set({ depositPaymentIntentId: result.paymentIntentId, updatedAt: new Date() })
      .where(eq(orders.id, order.id));
  }

  return {
    redirectUrl: result.redirectUrl,
    held: false,
    reason: "Send the customer to the card page to authorise the hold.",
  };
}

/**
 * Confirm a hold that went through a hosted redirect. Called by the customer's
 * return leg; safe to call again, and safe to call after the webhook already did
 * the same work.
 */
export async function confirmHoldFromRedirect(
  orderId: string,
  sessionId: string,
): Promise<{ held: boolean; note: string }> {
  const db = getDb();
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) return { held: false, note: "no such order" };
  if (order.depositStatus === "held") return { held: true, note: "already held" };

  const [account] = await db.select().from(accounts).where(eq(accounts.id, order.accountId));
  const gateway = depositGateway();
  const confirmation = await gateway.confirmFromRedirect(
    sessionId,
    account?.stripeAccountId ?? null,
  );
  if (!confirmation.held || !confirmation.paymentIntentId) {
    return { held: false, note: "the authorisation has not landed yet" };
  }
  const applied = await applyDepositEvent({
    orderId,
    kind: "held",
    paymentIntentId: confirmation.paymentIntentId,
    amountCents: confirmation.amountCents,
    actor: "customer:checkout-return",
  });
  return { held: true, note: applied.note };
}

/**
 * Release the hold. Called automatically on a clean return, and by hand when a
 * yard waives every claim. No money moved, and the audit line says so.
 */
export async function releaseHold(
  accountId: string,
  orderId: string,
  actor: string,
): Promise<{ released: boolean; note: string }> {
  const db = getDb();
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.accountId, accountId), eq(orders.id, orderId)));
  if (!order) throw new Error("That order is not in this account.");
  if (order.depositStatus === "released") return { released: true, note: "Already released." };
  if (order.depositStatus !== "held") {
    return { released: false, note: `Nothing to release — the deposit is ${order.depositStatus}.` };
  }

  const [account] = await db.select().from(accounts).where(eq(accounts.id, accountId));
  if (order.depositPaymentIntentId) {
    try {
      await depositGateway().cancel(
        order.depositPaymentIntentId,
        account?.stripeAccountId ?? null,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "the card network refused the release";
      await db
        .update(orders)
        .set({ depositError: message, updatedAt: new Date() })
        .where(eq(orders.id, order.id));
      return { released: false, note: `Stripe would not cancel the hold: ${message}` };
    }
  }
  await applyDepositEvent({ orderId, kind: "released", actor });
  return { released: true, note: "Hold released. Nothing was charged." };
}

/**
 * Capture against settled claims. `amountCents` comes from
 * `planSettlement` — never from a form field — and can never exceed the hold,
 * because the plan clamps it.
 *
 * Photo keys ride into Stripe metadata so the evidence is attached to the charge
 * itself. When a customer disputes six weeks later, the yard's argument is in the
 * dispute record rather than in somebody's phone.
 */
export async function captureFor(input: {
  accountId: string;
  orderId: string;
  amountCents: number;
  claimIds: string[];
  actor: string;
}): Promise<{ captureId: string | null; capturedCents: number; note: string }> {
  const db = getDb();
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.accountId, input.accountId), eq(orders.id, input.orderId)));
  if (!order) throw new Error("That order is not in this account.");
  if (order.depositStatus !== "held") {
    throw new Error(
      `The deposit on order #${order.number} is ${order.depositStatus}, so there is nothing to capture. Settle this one by invoice.`,
    );
  }
  if (!order.depositPaymentIntentId) {
    throw new Error("There is no card authorisation on this order to capture.");
  }
  const amount = Math.min(Math.max(0, Math.trunc(input.amountCents)), order.depositCents);
  if (amount <= 0) throw new Error("There is nothing to capture — release the hold instead.");

  const [account] = await db.select().from(accounts).where(eq(accounts.id, input.accountId));

  const photoKeys: string[] = [];
  for (const claimId of input.claimIds) {
    const [claim] = await db.select().from(damageClaims).where(eq(damageClaims.id, claimId));
    if (!claim) continue;
    for (const photoId of claim.photoIds) {
      const [photo] = await db
        .select({ key: conditionPhotos.r2Key })
        .from(conditionPhotos)
        .where(eq(conditionPhotos.id, photoId));
      if (photo) photoKeys.push(photo.key);
    }
  }

  const capture = await depositGateway().capture(
    order.depositPaymentIntentId,
    amount,
    account?.stripeAccountId ?? null,
    {
      rigrentOrderId: order.id,
      rigrentOrderNumber: String(order.number),
      rigrentClaimIds: input.claimIds.join(","),
      // Stripe metadata values cap at 500 characters; the keys are the evidence
      // pointer, and the claims themselves hold the full list.
      rigrentPhotoKeys: photoKeys.join(",").slice(0, 480),
    },
  );

  await applyDepositEvent({
    orderId: order.id,
    kind: "captured",
    amountCents: capture.capturedCents,
    captureId: capture.captureId,
    actor: input.actor,
  });

  return {
    captureId: capture.captureId,
    capturedCents: capture.capturedCents,
    note: depositsAreSimulated()
      ? "Simulated capture — no card was charged, because no Stripe key is configured."
      : "Captured against the hold; the remainder was released.",
  };
}

/**
 * Re-place a hold that will lapse before the gear is back: cancel the old
 * authorisation and start a new one. Stripe requires the customer to be told, so
 * the caller emails them; a failure lands on the order rather than in a log,
 * because a lapsed hold on a three-week marquee rental is a real exposure.
 */
export async function reauthorize(
  accountId: string,
  orderId: string,
): Promise<{ ok: boolean; note: string; redirectUrl: string | null }> {
  const db = getDb();
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.accountId, accountId), eq(orders.id, orderId)));
  if (!order) return { ok: false, note: "no such order", redirectUrl: null };

  const [account] = await db.select().from(accounts).where(eq(accounts.id, accountId));
  if (order.depositPaymentIntentId) {
    try {
      await depositGateway().cancel(
        order.depositPaymentIntentId,
        account?.stripeAccountId ?? null,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "the old authorisation would not cancel";
      await db
        .update(orders)
        .set({ depositError: message, depositStatus: "expired", updatedAt: new Date() })
        .where(eq(orders.id, order.id));
      return { ok: false, note: message, redirectUrl: null };
    }
  }

  await db
    .update(orders)
    .set({
      depositStatus: "none",
      depositPaymentIntentId: null,
      depositAuthorizedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, order.id));

  const started = await startHold(accountId, orderId);

  /**
   * A re-authorisation that only got as far as "the customer has to visit a card
   * page" is not finished, and the sweep will never look at this order again — it
   * only considers holds that are `held`. So the state is recorded on the order,
   * where the retry control on the order screen picks it up. Deferring this to a
   * timestamp nobody queries is how a hold silently disappears.
   */
  if (!started.held) {
    await db
      .update(orders)
      .set({
        depositError:
          "The deposit hold was cancelled for re-authorisation and the new one has not landed yet. Send the customer back to their quote link, or settle this order by invoice.",
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id));
  }

  await audit(accountId, "system:reauth", "deposit.reauthorized", orderId, {
    held: started.held,
    number: order.number,
  });
  return {
    ok: started.held || Boolean(started.redirectUrl),
    note: started.reason,
    redirectUrl: started.redirectUrl,
  };
}

/** Mark a hold whose authorisation has run out. A person has to look at these. */
export async function markHoldExpired(orderId: string): Promise<void> {
  await getDb()
    .update(orders)
    .set({
      depositStatus: "expired",
      depositError:
        "The card authorisation ran out before the gear came back. Re-authorise it or settle by invoice.",
      updatedAt: new Date(),
    })
    .where(eq(orders.id, orderId));
}

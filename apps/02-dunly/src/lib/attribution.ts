/**
 * Recovered-revenue attribution — conservative, in priority order:
 *   1. payment intent matches one of our recovery_attempts  -> retry
 *   2. card updated via our page, or paid within 24h of our
 *      message click/delivery                               -> email|sms
 *   3. anything else (Stripe auto-retry, direct payment)    -> baseline
 * Baseline is DISPLAYED but never counted in "recovered by Dunly" and
 * never billed on the Performance plan. That honesty is the product.
 */

import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";

const MESSAGE_WINDOW_MS = 24 * 3600_000;

export async function attributeRecovery(opts: {
  paymentFailureId: string;
  organizationId: string;
  amountCents: number;
  currency: string;
  paymentIntentId: string | null;
  cardUpdatedViaDunly: boolean;
}): Promise<void> {
  const { paymentFailureId, organizationId, amountCents, currency } = opts;

  let attributedTo: "retry" | "email" | "sms" | "baseline" = "baseline";
  let recoveryAttemptId: string | null = null;
  let messageId: string | null = null;
  let resolution: "dunly_retry" | "dunly_message" | "stripe_auto" = "stripe_auto";

  // 1. our retry?
  if (opts.paymentIntentId) {
    const attempt = await db.query.recoveryAttempts.findFirst({
      where: and(
        eq(schema.recoveryAttempts.paymentFailureId, paymentFailureId),
        eq(schema.recoveryAttempts.stripePaymentIntentId, opts.paymentIntentId),
      ),
    });
    if (attempt) {
      attributedTo = "retry";
      recoveryAttemptId = attempt.id;
      resolution = "dunly_retry";
    }
  }

  // 2. our message? (card updated through our page, or recent click/delivery)
  if (attributedTo === "baseline") {
    const recent = await db.query.messages.findFirst({
      where: and(
        eq(schema.messages.paymentFailureId, paymentFailureId),
        inArray(schema.messages.status, ["delivered", "clicked", "sent"]),
        gte(schema.messages.sentAt, new Date(Date.now() - MESSAGE_WINDOW_MS)),
      ),
      orderBy: desc(schema.messages.sentAt),
    });
    // A click (or a card updated through our page) is a confident last touch.
    if (opts.cardUpdatedViaDunly || recent?.status === "clicked") {
      attributedTo = recent?.channel === "sms" ? "sms" : "email";
      messageId = recent?.id ?? null;
      resolution = "dunly_message";
    }
  }

  await db.insert(schema.recoveredRevenueEvents).values({
    organizationId,
    paymentFailureId,
    amountCents,
    currency,
    kind: "recovery",
    attributedTo,
    recoveryAttemptId,
    messageId,
  });

  await db
    .update(schema.paymentFailures)
    .set({
      status: "recovered",
      resolvedAt: new Date(),
      resolution,
      updatedAt: new Date(),
    })
    .where(eq(schema.paymentFailures.id, paymentFailureId));
}

/** Dashboard aggregates for a period. */
export async function recoverySummary(organizationId: string, sinceDays: number) {
  const since = new Date(Date.now() - sinceDays * 86400_000);
  const rows = await db
    .select({
      attributedTo: schema.recoveredRevenueEvents.attributedTo,
      kind: schema.recoveredRevenueEvents.kind,
      total: sql<number>`coalesce(sum(${schema.recoveredRevenueEvents.amountCents}), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(schema.recoveredRevenueEvents)
    .where(
      and(
        eq(schema.recoveredRevenueEvents.organizationId, organizationId),
        gte(schema.recoveredRevenueEvents.recoveredAt, since),
      ),
    )
    .groupBy(
      schema.recoveredRevenueEvents.attributedTo,
      schema.recoveredRevenueEvents.kind,
    );

  let byDunly = 0;
  let baseline = 0;
  let prevented = 0;
  let recoveredCount = 0;
  for (const r of rows) {
    const total = Number(r.total);
    if (r.kind === "prevented") prevented += total;
    else if (r.attributedTo === "baseline") baseline += total;
    else {
      byDunly += total;
      recoveredCount += Number(r.count);
    }
  }
  return { byDunlyCents: byDunly, baselineCents: baseline, preventedCents: prevented, recoveredCount };
}

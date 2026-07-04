/**
 * Dunly worker — long-lived Node process. Everything that touches a
 * connected Stripe account or sends a message runs here, never inline
 * in a webhook response.
 *
 * Queues:
 *   events   — process-webhook (fan out from raw webhook_events rows)
 *   retries  — execute-retry (delayed jobs = the retry schedule)
 *   messages — send-message (delayed jobs = the dunning sequence)
 *   cron     — pre-dunning daily scan
 */

import { Worker, type Job } from "bullmq";
import { and, eq } from "drizzle-orm";
import type Stripe from "stripe";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { attributeRecovery } from "@/lib/attribution";
import { activeCampaign } from "@/lib/campaigns";
import { env } from "@/lib/env";
import { sendDunningEmail } from "@/lib/messages";
import {
  queue,
  redis,
  type ExecuteRetryJob,
  type OffScheduleRetryJob,
  type ProcessWebhookJob,
  type SendMessageJob,
} from "@/lib/queue";
import { computeRetryPlan, shouldSuppressRetries } from "@/lib/retries";
import { isHardDecline, mrrCentsForSubscription, onAccount, stripe } from "@/lib/stripe";

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

/* Stripe API-version tolerance: webhook payloads follow the connected
   account's pinned version, so both the legacy and Basil shapes appear. */
function invoiceSubscriptionId(inv: Stripe.Invoice): string | null {
  const legacy = (inv as { subscription?: string | { id: string } | null }).subscription;
  if (typeof legacy === "string") return legacy;
  if (legacy && typeof legacy === "object") return legacy.id;
  const parent = inv.parent?.subscription_details?.subscription;
  return typeof parent === "string" ? parent : (parent?.id ?? null);
}

function invoicePaymentIntentId(inv: Stripe.Invoice): string | null {
  const legacy = (inv as { payment_intent?: string | { id: string } | null }).payment_intent;
  if (typeof legacy === "string") return legacy;
  if (legacy && typeof legacy === "object") return legacy.id;
  const payment = inv.payments?.data?.[0]?.payment;
  const pi = payment && payment.type === "payment_intent" ? payment.payment_intent : null;
  return typeof pi === "string" ? pi : (pi?.id ?? null);
}

function subscriptionPeriodEnd(sub: Stripe.Subscription): Date | null {
  const legacy = (sub as { current_period_end?: number }).current_period_end;
  const ts = legacy ?? sub.items?.data?.[0]?.current_period_end;
  return ts ? new Date(ts * 1000) : null;
}

async function orgForStripeAccount(stripeAccountId: string) {
  const account = await db.query.stripeAccounts.findFirst({
    where: eq(schema.stripeAccounts.stripeAccountId, stripeAccountId),
  });
  return account ?? null;
}

async function upsertCustomer(accountRowId: string, c: Stripe.Customer) {
  const [row] = await db
    .insert(schema.customers)
    .values({
      stripeAccountId: accountRowId,
      stripeCustomerId: c.id,
      email: c.email,
      phone: c.phone,
      name: c.name,
      delinquent: !!c.delinquent,
    })
    .onConflictDoUpdate({
      target: [schema.customers.stripeAccountId, schema.customers.stripeCustomerId],
      set: {
        email: c.email,
        phone: c.phone,
        name: c.name,
        delinquent: !!c.delinquent,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}

async function upsertSubscription(customerRowId: string, s: Stripe.Subscription) {
  const [row] = await db
    .insert(schema.subscriptions)
    .values({
      customerId: customerRowId,
      stripeSubscriptionId: s.id,
      status: s.status,
      mrrCents: mrrCentsForSubscription(s),
      currentPeriodEnd: subscriptionPeriodEnd(s),
      cancelAtPeriodEnd: s.cancel_at_period_end,
    })
    .onConflictDoUpdate({
      target: schema.subscriptions.stripeSubscriptionId,
      set: {
        status: s.status,
        mrrCents: mrrCentsForSubscription(s),
        currentPeriodEnd: subscriptionPeriodEnd(s),
        cancelAtPeriodEnd: s.cancel_at_period_end,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}

/* ------------------------------------------------------------------ */
/* event processing                                                    */
/* ------------------------------------------------------------------ */

async function handleInvoicePaymentFailed(accountRow: typeof schema.stripeAccounts.$inferSelect, invoice: Stripe.Invoice) {
  const subscriptionId = invoiceSubscriptionId(invoice);
  if (!invoice.customer || !subscriptionId || !invoice.id) return;

  const s = stripe();
  const stripeCustomer = (await s.customers.retrieve(
    invoice.customer as string,
    onAccount(accountRow.stripeAccountId),
  )) as Stripe.Customer;
  const customer = await upsertCustomer(accountRow.id, stripeCustomer);

  const stripeSub = await s.subscriptions.retrieve(
    subscriptionId,
    onAccount(accountRow.stripeAccountId),
  );
  const sub = await upsertSubscription(customer.id, stripeSub);

  const declineCode =
    invoice.last_finalization_error?.decline_code ??
    (invoice.last_finalization_error?.code as string | undefined) ??
    null;

  // Stripe Smart Retries active? next_payment_attempt is set when Stripe
  // itself will retry — our engine defers (never double-charge).
  const smartRetriesActive = invoice.next_payment_attempt != null;

  const [failure] = await db
    .insert(schema.paymentFailures)
    .values({
      organizationId: accountRow.organizationId,
      subscriptionId: sub.id,
      customerId: customer.id,
      stripeInvoiceId: invoice.id,
      amountDueCents: invoice.amount_due,
      currency: invoice.currency,
      declineCode,
      failureReason: invoice.last_finalization_error?.message ?? null,
      status: "recovering",
      stripeSmartRetriesActive: smartRetriesActive,
      firstFailedAt: new Date((invoice.created ?? Date.now() / 1000) * 1000),
    })
    .onConflictDoUpdate({
      target: schema.paymentFailures.stripeInvoiceId,
      set: { stripeSmartRetriesActive: smartRetriesActive, updatedAt: new Date() },
    })
    .returning();

  await audit(accountRow.organizationId, "system", "failure.detected", invoice.id, {
    amount: invoice.amount_due,
    declineCode,
  });

  const campaign = await activeCampaign(accountRow.organizationId, "dunning");
  if (!campaign) return;

  // Schedule retries (suppressed for hard declines / active Stripe retries)
  const suppression = shouldSuppressRetries({
    stripeSmartRetriesActive: smartRetriesActive,
    hardDecline: isHardDecline(declineCode),
  });
  if (suppression.retries) {
    const plan = computeRetryPlan(failure.firstFailedAt, campaign.retrySchedule);
    for (let i = 0; i < plan.length; i++) {
      const [attempt] = await db
        .insert(schema.recoveryAttempts)
        .values({
          paymentFailureId: failure.id,
          attemptNumber: i + 1,
          scheduledFor: plan[i],
        })
        .returning();
      const job = await queue("retries").add(
        "execute-retry",
        { recoveryAttemptId: attempt.id } satisfies ExecuteRetryJob,
        { delay: Math.max(0, plan[i].getTime() - Date.now()), jobId: `retry-${attempt.id}` },
      );
      await db
        .update(schema.recoveryAttempts)
        .set({ bullmqJobId: job.id ?? null })
        .where(eq(schema.recoveryAttempts.id, attempt.id));
    }
  } else {
    await audit(accountRow.organizationId, "system", "retries.suppressed", invoice.id, suppression);
  }

  // Schedule the message sequence
  for (let i = 0; i < campaign.steps.length; i++) {
    const step = campaign.steps[i];
    if (step.channel === "sms") continue; // SMS is post-MVP
    const at = failure.firstFailedAt.getTime() + step.offsetHours * 3600_000;
    await queue("messages").add(
      "send-message",
      {
        organizationId: accountRow.organizationId,
        customerId: customer.id,
        paymentFailureId: failure.id,
        campaignId: campaign.id,
        stepIndex: i,
      } satisfies SendMessageJob,
      { delay: Math.max(0, at - Date.now()), jobId: `msg-${failure.id}-${i}` },
    );
  }
}

async function handleInvoicePaid(accountRow: typeof schema.stripeAccounts.$inferSelect, invoice: Stripe.Invoice) {
  if (!invoice.id) return;
  const failure = await db.query.paymentFailures.findFirst({
    where: eq(schema.paymentFailures.stripeInvoiceId, invoice.id),
  });
  if (!failure || failure.status === "recovered") return;

  // Cancel outstanding retries + message steps.
  const attempts = await db.query.recoveryAttempts.findMany({
    where: and(
      eq(schema.recoveryAttempts.paymentFailureId, failure.id),
      eq(schema.recoveryAttempts.result, "pending"),
    ),
  });
  for (const a of attempts) {
    if (a.bullmqJobId) await queue("retries").remove(a.bullmqJobId).catch(() => {});
    await db
      .update(schema.recoveryAttempts)
      .set({ result: "canceled" })
      .where(eq(schema.recoveryAttempts.id, a.id));
  }
  const campaign = await activeCampaign(accountRow.organizationId, "dunning");
  if (campaign) {
    for (let i = 0; i < campaign.steps.length; i++) {
      await queue("messages").remove(`msg-${failure.id}-${i}`).catch(() => {});
    }
  }

  // Card updated through our hosted page recently?
  const cardUpdated = await redis().get(`card-updated:${failure.customerId}`);

  await attributeRecovery({
    paymentFailureId: failure.id,
    organizationId: failure.organizationId,
    amountCents: invoice.amount_paid || failure.amountDueCents,
    currency: invoice.currency,
    paymentIntentId: invoicePaymentIntentId(invoice),
    cardUpdatedViaDunly: !!cardUpdated,
  });

  await audit(failure.organizationId, "system", "failure.recovered", invoice.id, {
    amount: invoice.amount_paid,
  });
}

async function handlePaymentMethodEvent(accountRow: typeof schema.stripeAccounts.$inferSelect, pm: Stripe.PaymentMethod) {
  if (!pm.customer || pm.type !== "card" || !pm.card) return;
  const customer = await db.query.customers.findFirst({
    where: and(
      eq(schema.customers.stripeAccountId, accountRow.id),
      eq(schema.customers.stripeCustomerId, pm.customer as string),
    ),
  });
  if (!customer) return;
  await db
    .insert(schema.paymentMethods)
    .values({
      customerId: customer.id,
      stripePaymentMethodId: pm.id,
      brand: pm.card.brand,
      last4: pm.card.last4,
      expMonth: pm.card.exp_month,
      expYear: pm.card.exp_year,
    })
    .onConflictDoUpdate({
      target: schema.paymentMethods.stripePaymentMethodId,
      set: {
        brand: pm.card.brand,
        last4: pm.card.last4,
        expMonth: pm.card.exp_month,
        expYear: pm.card.exp_year,
        updatedAt: new Date(),
      },
    });
}

async function processWebhook(job: Job<ProcessWebhookJob>) {
  const row = await db.query.webhookEvents.findFirst({
    where: eq(schema.webhookEvents.id, job.data.webhookEventId),
  });
  if (!row || row.processedAt) return;

  try {
    const event = row.payload as unknown as Stripe.Event;
    const accountRow = row.stripeAccountId ? await orgForStripeAccount(row.stripeAccountId) : null;

    if (accountRow) {
      switch (event.type) {
        case "invoice.payment_failed":
          await handleInvoicePaymentFailed(accountRow, event.data.object as Stripe.Invoice);
          break;
        case "invoice.paid":
        case "invoice.payment_succeeded":
          await handleInvoicePaid(accountRow, event.data.object as Stripe.Invoice);
          break;
        case "payment_method.attached":
        case "payment_method.updated":
        case "payment_method.automatically_updated":
          await handlePaymentMethodEvent(accountRow, event.data.object as Stripe.PaymentMethod);
          break;
        case "customer.updated": {
          const c = event.data.object as Stripe.Customer;
          await upsertCustomer(accountRow.id, c);
          break;
        }
        case "checkout.session.completed": {
          const cs = event.data.object as Stripe.Checkout.Session;
          if (cs.mode === "setup" && cs.metadata?.dunly === "card_update") {
            await handleCardUpdated(accountRow, cs);
          }
          break;
        }
        case "customer.subscription.updated":
        case "customer.subscription.deleted": {
          const s = event.data.object as Stripe.Subscription;
          const customer = await db.query.customers.findFirst({
            where: and(
              eq(schema.customers.stripeAccountId, accountRow.id),
              eq(schema.customers.stripeCustomerId, s.customer as string),
            ),
          });
          if (customer) await upsertSubscription(customer.id, s);
          break;
        }
      }
    }

    await db
      .update(schema.webhookEvents)
      .set({ processedAt: new Date(), error: null })
      .where(eq(schema.webhookEvents.id, row.id));
  } catch (err) {
    await db
      .update(schema.webhookEvents)
      .set({ error: err instanceof Error ? err.message : String(err) })
      .where(eq(schema.webhookEvents.id, row.id));
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/* retry execution                                                     */
/* ------------------------------------------------------------------ */

async function executeRetry(job: Job<ExecuteRetryJob>) {
  const attempt = await db.query.recoveryAttempts.findFirst({
    where: eq(schema.recoveryAttempts.id, job.data.recoveryAttemptId),
  });
  if (!attempt || attempt.result !== "pending") return;

  const failure = await db.query.paymentFailures.findFirst({
    where: eq(schema.paymentFailures.id, attempt.paymentFailureId),
  });
  if (!failure || failure.status !== "recovering") {
    await db
      .update(schema.recoveryAttempts)
      .set({ result: "skipped", executedAt: new Date() })
      .where(eq(schema.recoveryAttempts.id, attempt.id));
    return;
  }

  const customer = await db.query.customers.findFirst({
    where: eq(schema.customers.id, failure.customerId),
  });
  const accountRow = customer
    ? await db.query.stripeAccounts.findFirst({
        where: eq(schema.stripeAccounts.id, customer.stripeAccountId),
      })
    : null;
  if (!accountRow) return;

  if (env.dryRun) {
    await db
      .update(schema.recoveryAttempts)
      .set({ result: "skipped", executedAt: new Date(), declineCode: "dry_run" })
      .where(eq(schema.recoveryAttempts.id, attempt.id));
    return;
  }

  try {
    const invoice = await stripe().invoices.pay(
      failure.stripeInvoiceId,
      {},
      {
        ...onAccount(accountRow.stripeAccountId),
        idempotencyKey: `dunly-retry-${attempt.id}`,
      },
    );
    await db
      .update(schema.recoveryAttempts)
      .set({
        result: "succeeded",
        executedAt: new Date(),
        stripePaymentIntentId: invoicePaymentIntentId(invoice),
      })
      .where(eq(schema.recoveryAttempts.id, attempt.id));
    await audit(failure.organizationId, "system", "retry.succeeded", failure.stripeInvoiceId, {
      attempt: attempt.attemptNumber,
    });
    // invoice.paid webhook completes attribution.
  } catch (err) {
    const stripeErr = err as { code?: string; decline_code?: string; message?: string };
    const declineCode = stripeErr.decline_code ?? stripeErr.code ?? "unknown";
    await db
      .update(schema.recoveryAttempts)
      .set({ result: "failed", executedAt: new Date(), declineCode })
      .where(eq(schema.recoveryAttempts.id, attempt.id));
    await audit(failure.organizationId, "system", "retry.failed", failure.stripeInvoiceId, {
      attempt: attempt.attemptNumber,
      declineCode,
    });

    if (isHardDecline(declineCode)) {
      // Short-circuit remaining retries; lean on messages.
      const pending = await db.query.recoveryAttempts.findMany({
        where: and(
          eq(schema.recoveryAttempts.paymentFailureId, failure.id),
          eq(schema.recoveryAttempts.result, "pending"),
        ),
      });
      for (const p of pending) {
        if (p.bullmqJobId) await queue("retries").remove(p.bullmqJobId).catch(() => {});
        await db
          .update(schema.recoveryAttempts)
          .set({ result: "canceled" })
          .where(eq(schema.recoveryAttempts.id, p.id));
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* message sending                                                     */
/* ------------------------------------------------------------------ */

async function sendMessage(job: Job<SendMessageJob>) {
  const { paymentFailureId, campaignId, stepIndex } = job.data;

  // Re-check state at send time — never message a recovered customer.
  if (paymentFailureId) {
    const failure = await db.query.paymentFailures.findFirst({
      where: eq(schema.paymentFailures.id, paymentFailureId),
    });
    if (!failure || failure.status !== "recovering") return;

    const campaign = await db.query.recoveryCampaigns.findFirst({
      where: eq(schema.recoveryCampaigns.id, campaignId),
    });
    const step = campaign?.steps[stepIndex];
    if (!campaign || !step || !campaign.active) return;

    const pm = await db.query.paymentMethods.findFirst({
      where: and(
        eq(schema.paymentMethods.customerId, failure.customerId),
        eq(schema.paymentMethods.isDefault, true),
      ),
    });

    await sendDunningEmail({
      organizationId: job.data.organizationId,
      customerId: job.data.customerId,
      paymentFailureId,
      campaignId,
      stepIndex,
      templateKey: step.templateKey,
      amountCents: failure.amountDueCents,
      currency: failure.currency,
      last4: pm?.last4 ?? undefined,
    });

    // Final step: apply the org's configured end-of-sequence action.
    if (stepIndex === campaign.steps.length - 1) {
      await queue("messages").add(
        "sequence-exhausted",
        { paymentFailureId },
        { delay: 48 * 3600_000, jobId: `exhaust-${paymentFailureId}` },
      );
    }
  }
}

async function sequenceExhausted(job: Job<{ paymentFailureId: string }>) {
  const failure = await db.query.paymentFailures.findFirst({
    where: eq(schema.paymentFailures.id, job.data.paymentFailureId),
  });
  if (!failure || failure.status !== "recovering") return;
  await db
    .update(schema.paymentFailures)
    .set({ status: "lost", resolvedAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.paymentFailures.id, failure.id));
  await audit(failure.organizationId, "system", "failure.lost", failure.stripeInvoiceId);
}

/* Off-schedule retry right after a card update — the golden moment. */
async function offScheduleRetry(job: Job<OffScheduleRetryJob>) {
  const failure = await db.query.paymentFailures.findFirst({
    where: eq(schema.paymentFailures.id, job.data.paymentFailureId),
  });
  if (!failure || failure.status !== "recovering") return;

  const [attempt] = await db
    .insert(schema.recoveryAttempts)
    .values({
      paymentFailureId: failure.id,
      attemptNumber: 99, // off-schedule marker; display maps it to "after card update"
      scheduledFor: new Date(),
    })
    .returning();
  await executeRetry({ data: { recoveryAttemptId: attempt.id } } as Job<ExecuteRetryJob>);
}

/* ------------------------------------------------------------------ */
/* pre-dunning daily scan                                              */
/* ------------------------------------------------------------------ */

async function preDunningScan() {
  const now = new Date();
  const thisMonth = { y: now.getUTCFullYear(), m: now.getUTCMonth() + 1 };
  const next = new Date(Date.UTC(thisMonth.y, thisMonth.m, 1));
  const nextMonth = { y: next.getUTCFullYear(), m: next.getUTCMonth() + 1 };

  const expiring = await db
    .select({
      pm: schema.paymentMethods,
      customer: schema.customers,
      account: schema.stripeAccounts,
    })
    .from(schema.paymentMethods)
    .innerJoin(schema.customers, eq(schema.paymentMethods.customerId, schema.customers.id))
    .innerJoin(schema.stripeAccounts, eq(schema.customers.stripeAccountId, schema.stripeAccounts.id))
    .where(and(eq(schema.paymentMethods.isDefault, true)));

  for (const row of expiring) {
    const { pm, customer, account } = row;
    if (!pm.expYear || !pm.expMonth) continue;
    const expiresThisWindow =
      (pm.expYear === thisMonth.y && pm.expMonth === thisMonth.m) ||
      (pm.expYear === nextMonth.y && pm.expMonth === nextMonth.m);
    if (!expiresThisWindow) continue;

    const campaign = await activeCampaign(account.organizationId, "pre_dunning");
    if (!campaign) continue;

    // one active pre-dunning sequence per customer per expiry window
    const dedupeKey = `predun:${customer.id}:${pm.expYear}-${pm.expMonth}`;
    const already = await redis().set(dedupeKey, "1", "EX", 60 * 86400, "NX");
    if (already !== "OK") continue;

    for (let i = 0; i < campaign.steps.length; i++) {
      const step = campaign.steps[i];
      if (step.channel === "sms") continue;
      await queue("messages").add(
        "send-predunning",
        {
          organizationId: account.organizationId,
          customerId: customer.id,
          paymentFailureId: null,
          campaignId: campaign.id,
          stepIndex: i,
        } satisfies SendMessageJob,
        { delay: step.offsetHours * 3600_000, jobId: `predun-${customer.id}-${pm.expYear}${pm.expMonth}-${i}` },
      );
    }
    await audit(account.organizationId, "system", "predunning.started", customer.stripeCustomerId, {
      expires: `${pm.expYear}-${pm.expMonth}`,
      last4: pm.last4,
    });
  }
}

async function sendPreDunning(job: Job<SendMessageJob>) {
  const campaign = await db.query.recoveryCampaigns.findFirst({
    where: eq(schema.recoveryCampaigns.id, job.data.campaignId),
  });
  const step = campaign?.steps[job.data.stepIndex];
  if (!campaign || !step || !campaign.active) return;

  const pm = await db.query.paymentMethods.findFirst({
    where: and(
      eq(schema.paymentMethods.customerId, job.data.customerId),
      eq(schema.paymentMethods.isDefault, true),
    ),
  });
  // Card already replaced? Sequence is done — that's a prevented failure.
  if (!pm || !pm.expYear || !pm.expMonth) return;
  const now = new Date();
  const stillExpiring =
    pm.expYear < now.getUTCFullYear() + 1 &&
    pm.expYear * 12 + pm.expMonth <= now.getUTCFullYear() * 12 + now.getUTCMonth() + 2;
  if (!stillExpiring) return;

  const sub = await db.query.subscriptions.findFirst({
    where: eq(schema.subscriptions.customerId, job.data.customerId),
  });

  await sendDunningEmail({
    organizationId: job.data.organizationId,
    customerId: job.data.customerId,
    paymentFailureId: null,
    campaignId: campaign.id,
    stepIndex: job.data.stepIndex,
    templateKey: step.templateKey,
    amountCents: sub?.mrrCents ?? 0,
    currency: "usd",
    last4: pm.last4 ?? undefined,
  });
}

/* Card updated via our hosted page: set default, mark the golden
   window for attribution, and retry immediately. */
async function handleCardUpdated(
  accountRow: typeof schema.stripeAccounts.$inferSelect,
  cs: Stripe.Checkout.Session,
) {
  const customerId = cs.metadata?.customerId;
  const paymentFailureId = cs.metadata?.paymentFailureId || null;
  if (!customerId) return;

  // Set the new payment method as the customer's default.
  if (cs.setup_intent) {
    const si = await stripe().setupIntents.retrieve(
      cs.setup_intent as string,
      onAccount(accountRow.stripeAccountId),
    );
    const pmId = si.payment_method as string | null;
    const customer = await db.query.customers.findFirst({
      where: eq(schema.customers.id, customerId),
    });
    if (pmId && customer) {
      await stripe().customers.update(
        customer.stripeCustomerId,
        { invoice_settings: { default_payment_method: pmId } },
        onAccount(accountRow.stripeAccountId),
      );
      await db
        .update(schema.paymentMethods)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(eq(schema.paymentMethods.customerId, customerId));
      const pm = await stripe().paymentMethods.retrieve(pmId, onAccount(accountRow.stripeAccountId));
      if (pm.card) {
        await db
          .insert(schema.paymentMethods)
          .values({
            customerId,
            stripePaymentMethodId: pm.id,
            brand: pm.card.brand,
            last4: pm.card.last4,
            expMonth: pm.card.exp_month,
            expYear: pm.card.exp_year,
            isDefault: true,
          })
          .onConflictDoUpdate({
            target: schema.paymentMethods.stripePaymentMethodId,
            set: { isDefault: true, updatedAt: new Date() },
          });
      }
    }
  }

  // 48h attribution window: "the customer fixed their card through us".
  await redis().set(`card-updated:${customerId}`, "1", "EX", 48 * 3600);
  await audit(accountRow.organizationId, "system", "card.updated_via_dunly", customerId);

  if (paymentFailureId) {
    await queue("messages").add(
      "off-schedule-retry",
      { paymentFailureId } satisfies OffScheduleRetryJob,
      { delay: 30_000 }, // give Stripe a beat to settle the default PM
    );
  } else {
    // Pre-dunning success: a prevented failure, reported separately.
    const sub = await db.query.subscriptions.findFirst({
      where: eq(schema.subscriptions.customerId, customerId),
    });
    if (sub && sub.mrrCents > 0) {
      await db.insert(schema.recoveredRevenueEvents).values({
        organizationId: accountRow.organizationId,
        amountCents: sub.mrrCents,
        currency: "usd",
        kind: "prevented",
        attributedTo: "email",
      });
    }
  }
}

/* 90-day historical backfill: the "here's your leak" moment. */
async function backfillAccount(job: Job<{ stripeAccountId: string }>) {
  const accountRow = await orgForStripeAccount(job.data.stripeAccountId);
  if (!accountRow || accountRow.backfillCompletedAt) return;

  const s = stripe();
  const since = Math.floor(Date.now() / 1000) - 90 * 86400;
  let mrrTotal = 0;

  // Mirror active subscriptions (MRR under management).
  for await (const sub of s.subscriptions.list(
    { status: "active", limit: 100, expand: ["data.customer"] },
    onAccount(accountRow.stripeAccountId),
  )) {
    const custObj = sub.customer as Stripe.Customer | Stripe.DeletedCustomer | null;
    if (!custObj || ("deleted" in custObj && custObj.deleted)) continue;
    const customer = await upsertCustomer(accountRow.id, custObj as Stripe.Customer);
    await upsertSubscription(customer.id, sub);
    mrrTotal += mrrCentsForSubscription(sub);
  }

  // Import failed invoices from the window (open/uncollectible = the leak).
  for await (const invoice of s.invoices.list(
    { status: "open", created: { gte: since }, limit: 100 },
    onAccount(accountRow.stripeAccountId),
  )) {
    if (!invoice.customer || !invoice.id || !invoiceSubscriptionId(invoice) || invoice.amount_due === 0) continue;
    const retrieved = await s.customers.retrieve(
      invoice.customer as string,
      onAccount(accountRow.stripeAccountId),
    );
    if ("deleted" in retrieved && retrieved.deleted) continue;
    const customer = await upsertCustomer(accountRow.id, retrieved as Stripe.Customer);
    await db
      .insert(schema.paymentFailures)
      .values({
        organizationId: accountRow.organizationId,
        customerId: customer.id,
        stripeInvoiceId: invoice.id,
        amountDueCents: invoice.amount_due,
        currency: invoice.currency,
        status: "open",
        stripeSmartRetriesActive: invoice.next_payment_attempt != null,
        firstFailedAt: new Date(invoice.created * 1000),
      })
      .onConflictDoNothing({ target: schema.paymentFailures.stripeInvoiceId });
  }

  await db
    .update(schema.organizations)
    .set({ mrrUnderManagementCents: mrrTotal, updatedAt: new Date() })
    .where(eq(schema.organizations.id, accountRow.organizationId));
  await db
    .update(schema.stripeAccounts)
    .set({ backfillCompletedAt: new Date() })
    .where(eq(schema.stripeAccounts.id, accountRow.id));
  await audit(accountRow.organizationId, "system", "backfill.completed", accountRow.stripeAccountId, {
    mrrCents: mrrTotal,
  });
}

/* ------------------------------------------------------------------ */
/* boot                                                                */
/* ------------------------------------------------------------------ */

function boot() {
  const connection = redis();
  const opts = { connection, concurrency: 5 };

  new Worker("events", processWebhook, opts);
  new Worker("retries", executeRetry, opts);
  new Worker(
    "messages",
    async (job) => {
      if (job.name === "send-message") return sendMessage(job as Job<SendMessageJob>);
      if (job.name === "send-predunning") return sendPreDunning(job as Job<SendMessageJob>);
      if (job.name === "sequence-exhausted") return sequenceExhausted(job as Job<{ paymentFailureId: string }>);
      if (job.name === "off-schedule-retry") return offScheduleRetry(job as Job<OffScheduleRetryJob>);
    },
    opts,
  );

  // Pre-dunning scan daily at 09:00 UTC.
  new Worker("cron", async (job) => {
    if (job.name === "predunning-scan") return preDunningScan();
    if (job.name === "backfill-account") return backfillAccount(job as Job<{ stripeAccountId: string }>);
  }, opts);
  void queue("cron").add(
    "predunning-scan",
    {},
    { repeat: { pattern: "0 9 * * *" }, jobId: "predunning-daily" },
  );

  console.log("[dunly-worker] queues live: events, retries, messages, cron");
}

boot();

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    console.log(`[dunly-worker] ${sig} — shutting down`);
    process.exit(0);
  });
}

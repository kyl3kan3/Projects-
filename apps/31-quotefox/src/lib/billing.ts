/**
 * Stripe event handling — the only code allowed to change a plan or mark a deposit
 * paid.
 *
 * Events arrive from two places and must not be confused:
 *
 *  - **Platform events** (`checkout.session.completed` in subscription mode,
 *    `customer.subscription.*`, `invoice.paid`) are QuoteFox's own billing. They
 *    set `organizations.plan` and reset the quote meter at the start of a period.
 *  - **Connected-account events** (the same event types with an `account` on the
 *    envelope, in payment mode) are a homeowner paying a contractor's deposit.
 *    Those mark the deposit paid, win the job, cancel the follow-ups and send both
 *    receipts.
 *
 * Replay tolerance is a stored event id plus a status check on the deposit row.
 * Stripe retries, and a retried deposit event that emailed the homeowner a second
 * receipt — or worse, marked a second deposit paid — is the kind of bug that
 * costs a contractor their customer's trust.
 */

import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  deposits,
  jobs,
  organizations,
  proposals,
  webhookEvents,
  type Plan,
} from "@/db/schema";
import { audit, SYSTEM } from "@/lib/audit";
import { markDepositPaid, markDepositRefunded } from "@/lib/deposits";
import { contractorAlertMail, depositReceiptMail, sendMail } from "@/lib/email";
import { env } from "@/lib/env";
import { PLAN_ORDER } from "@/lib/plans";
import { appendEvent, cancelNudges, loadProposal, snapshotPdf } from "@/lib/proposals";
import { mintProposalToken, proposalUrl } from "@/lib/tokens";
import { resetQuoteMeter } from "@/lib/walkthroughs";

/** Record the event id. Returns false when we have already handled it. */
export async function claimEvent(event: Stripe.Event): Promise<boolean> {
  const db = getDb();
  const inserted = await db
    .insert(webhookEvents)
    .values({ id: event.id, source: "stripe", type: event.type })
    .onConflictDoNothing()
    .returning();
  return inserted.length > 0;
}

export async function markEventProcessed(eventId: string, error?: string): Promise<void> {
  const db = getDb();
  await db
    .update(webhookEvents)
    .set({ processedAt: new Date(), error: error ?? null })
    .where(eq(webhookEvents.id, eventId));
}

function planFrom(value: unknown): Plan | null {
  return PLAN_ORDER.includes(value as Plan) ? (value as Plan) : null;
}

export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  const connectedAccount = (event as { account?: string }).account ?? null;

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === "payment") {
        await settleDeposit(session, connectedAccount);
        return;
      }
      await applyPlanFromSession(session);
      return;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      await applyPlanFromSubscription(event.data.object as Stripe.Subscription);
      return;
    }
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const organizationId = subscription.metadata?.organizationId;
      if (!organizationId) return;
      const db = getDb();
      await db
        .update(organizations)
        .set({
          subscriptionStatus: "canceled",
          billingStripeSubscriptionId: null,
          updatedAt: new Date(),
        })
        .where(eq(organizations.id, organizationId));
      await audit(organizationId, SYSTEM, "plan_changed", "subscription cancelled");
      return;
    }
    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = typeof invoice.customer === "string" ? invoice.customer : null;
      if (!customerId) return;
      const db = getDb();
      const [org] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.billingStripeCustomerId, customerId));
      if (!org) return;
      // A new billing period: the metered allowance starts again.
      await resetQuoteMeter(org.id);
      await db
        .update(organizations)
        .set({ subscriptionStatus: "active", updatedAt: new Date() })
        .where(eq(organizations.id, org.id));
      await audit(org.id, SYSTEM, "plan_changed", "billing period renewed — quote meter reset");
      return;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = typeof invoice.customer === "string" ? invoice.customer : null;
      if (!customerId) return;
      const db = getDb();
      const [org] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.billingStripeCustomerId, customerId));
      if (!org) return;
      await db
        .update(organizations)
        .set({ subscriptionStatus: "past_due", updatedAt: new Date() })
        .where(eq(organizations.id, org.id));
      await audit(org.id, SYSTEM, "plan_changed", "invoice payment failed — past due");
      return;
    }
    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      const intentId = typeof charge.payment_intent === "string" ? charge.payment_intent : null;
      if (intentId) await markDepositRefunded(intentId);
      return;
    }
    case "account.updated": {
      const account = event.data.object as Stripe.Account;
      const organizationId = account.metadata?.organizationId;
      if (!organizationId) return;
      const db = getDb();
      await db
        .update(organizations)
        .set({
          stripeConnectAccountId: account.id,
          stripeConnectReady: Boolean(account.charges_enabled),
          updatedAt: new Date(),
        })
        .where(eq(organizations.id, organizationId));
      await audit(organizationId, SYSTEM, "stripe_connected", account.id, {
        chargesEnabled: Boolean(account.charges_enabled),
      });
      return;
    }
    default:
      return;
  }
}

/* ------------------------------------------------------------ our billing --- */

async function applyPlanFromSession(session: Stripe.Checkout.Session): Promise<void> {
  const organizationId = session.metadata?.organizationId ?? session.client_reference_id;
  const planId = planFrom(session.metadata?.plan);
  if (!organizationId || !planId) return;
  const db = getDb();
  await db
    .update(organizations)
    .set({
      plan: planId,
      subscriptionStatus: "active",
      billingStripeCustomerId: typeof session.customer === "string" ? session.customer : null,
      billingStripeSubscriptionId:
        typeof session.subscription === "string" ? session.subscription : null,
      quoteCountCurrentPeriod: 0,
      periodStartedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, organizationId));
  await audit(organizationId, SYSTEM, "plan_changed", `→ ${planId}`);
}

async function applyPlanFromSubscription(subscription: Stripe.Subscription): Promise<void> {
  const organizationId = subscription.metadata?.organizationId;
  const planId = planFrom(subscription.metadata?.plan);
  if (!organizationId) return;
  const active = subscription.status === "active" || subscription.status === "trialing";
  const db = getDb();
  const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId));
  if (!org) return;
  await db
    .update(organizations)
    .set({
      plan: active && planId ? planId : org.plan,
      subscriptionStatus:
        subscription.status === "past_due"
          ? "past_due"
          : subscription.status === "canceled"
            ? "canceled"
            : active
              ? "active"
              : org.subscriptionStatus,
      billingStripeSubscriptionId: subscription.id,
      billingStripeCustomerId:
        typeof subscription.customer === "string" ? subscription.customer : org.billingStripeCustomerId,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, organizationId));
  await audit(
    organizationId,
    SYSTEM,
    "plan_changed",
    `${subscription.status} → ${active && planId ? planId : org.plan}`,
  );
}

/* ---------------------------------------------------------------- deposits --- */

/**
 * A homeowner paid a deposit on the contractor's own account.
 *
 * Everything after the payment is one transition: deposit paid → proposal
 * `deposit_paid` → job `won` → nudges cancelled → receipts out. It is guarded by
 * `markDepositPaid`, which only moves a row out of `pending`, so a replayed event
 * does nothing at all — no second receipt, no second "won".
 */
async function settleDeposit(
  session: Stripe.Checkout.Session,
  connectedAccount: string | null,
): Promise<void> {
  const depositId = session.metadata?.quotefoxDepositId;
  const proposalId = session.metadata?.quotefoxProposalId;
  if (!depositId || !proposalId) return;

  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : null;
  const outcome = await markDepositPaid({
    depositId,
    paymentIntentId,
    connectedAccountId: connectedAccount,
    amountCents: Number(session.amount_total ?? 0),
  });
  if (!outcome.applied) return;

  const bundle = await loadProposal(proposalId);
  if (!bundle) return;
  const db = getDb();

  await db
    .update(proposals)
    .set({ status: "deposit_paid", updatedAt: new Date() })
    .where(eq(proposals.id, proposalId));
  await db
    .update(jobs)
    .set({ status: "won", updatedAt: new Date() })
    .where(eq(jobs.id, bundle.job.id));
  await appendEvent(bundle.proposal, "deposit_paid", {
    amountCents: bundle.proposal.depositCents,
    paymentIntentId,
  });
  await cancelNudges(proposalId, "deposit_paid");
  await snapshotPdf(proposalId);
  await audit(bundle.org.id, SYSTEM, "deposit_paid", bundle.job.title, {
    proposalId,
    amountCents: bundle.proposal.depositCents,
  });

  const token = await mintProposalToken(proposalId, bundle.proposal.tokenId);
  const url = proposalUrl(token);

  if (bundle.job.customerEmail) {
    await sendMail(
      depositReceiptMail({
        companyName: bundle.org.name,
        companyPhone: bundle.org.phone,
        customerName: bundle.job.customerName,
        customerEmail: bundle.job.customerEmail,
        jobTitle: bundle.job.title,
        depositCents: bundle.proposal.depositCents,
        totalCents: bundle.proposal.totalCents,
        url,
        paidAt: new Date(),
      }),
    );
  }

  const [deposit] = await db.select().from(deposits).where(eq(deposits.id, depositId));
  await sendMail(
    contractorAlertMail({
      companyName: bundle.org.name,
      to: await teamEmailsFor(bundle.org.id),
      jobTitle: bundle.job.title,
      customerName: bundle.job.customerName,
      event: "deposit_paid",
      totalCents: bundle.proposal.totalCents,
      depositCents: deposit?.amountCents ?? bundle.proposal.depositCents,
      dashboardUrl: `${env.appUrl}/proposals/${proposalId}`,
    }),
  );
}

async function teamEmailsFor(organizationId: string): Promise<string[]> {
  const db = getDb();
  const { users } = await import("@/db/schema");
  const rows = await db.select().from(users).where(eq(users.organizationId, organizationId));
  return rows.map((row) => row.email);
}

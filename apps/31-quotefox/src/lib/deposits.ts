/**
 * Deposits.
 *
 * The commercial promise in README is that QuoteFox takes **no percentage of a
 * contractor's deposits**: the Checkout session is created on their own connected
 * account, with no `application_fee_amount`, so the money, the statement
 * descriptor, the fees and the dispute liability are all theirs. That is enforced
 * here, in the one place Stripe is called for a deposit.
 *
 * The arithmetic (percent or fixed, clamped, with the state-cap warnings) is pure
 * and sits at the top of the file, because it is the part that has to be right
 * whether or not Stripe is configured — and because home-improvement deposit caps
 * are real law in several states, not a nicety.
 */

import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { deposits, proposals, type DepositType } from "@/db/schema";
import { audit, SYSTEM } from "@/lib/audit";
import { env } from "@/lib/env";
import { formatMoney, roundHalfUp } from "@/lib/money";
import { appendEvent, loadProposal } from "@/lib/proposals";
import { stripe, stripeConfigured } from "@/lib/stripe";

/** Compute the deposit for a total. Percent is whole percent; fixed is cents. */
export function computeDepositCents(
  totalCents: number,
  type: DepositType,
  value: number,
): number {
  const total = Math.max(0, Math.round(totalCents) || 0);
  if (type === "none" || total === 0) return 0;
  if (type === "fixed") return Math.min(total, Math.max(0, Math.round(value)));
  const pct = Math.min(100, Math.max(0, value));
  return Math.min(total, roundHalfUp((total * pct) / 100));
}

export interface DepositCap {
  state: string;
  /** Percent cap, when the state expresses one. */
  maxPercent?: number;
  /** Absolute cap in cents, when the state expresses one. */
  maxCents?: number;
  note: string;
}

/**
 * State deposit caps on home-improvement contracts, as of 2026.
 *
 * This is a warning surface, not legal advice, and it says so in the UI: the rule
 * is that whichever of the two limits is *lower* applies, and a contractor who
 * exceeds it can be facing a licensing complaint rather than a bounced payment.
 */
export const DEPOSIT_CAPS: Record<string, DepositCap> = {
  CA: {
    state: "CA",
    maxPercent: 10,
    maxCents: 100_000,
    note: "California caps a home-improvement down payment at 10% of the contract or $1,000, whichever is less.",
  },
  MD: {
    state: "MD",
    maxPercent: 33,
    note: "Maryland caps a home-improvement deposit at one third of the contract price.",
  },
  NV: {
    state: "NV",
    maxPercent: 10,
    maxCents: 100_000,
    note: "Nevada caps a residential deposit at 10% of the contract or $1,000, whichever is less.",
  },
  PA: {
    state: "PA",
    maxPercent: 33,
    note: "Pennsylvania caps a home-improvement deposit at one third of the contract price.",
  },
  MA: {
    state: "MA",
    maxPercent: 33,
    note: "Massachusetts caps a home-improvement deposit at one third of the contract price.",
  },
};

export interface DepositWarning {
  message: string;
  suggestedCents: number;
}

/** Warn when a deposit exceeds the job's state cap. Null when it is fine. */
export function depositWarning(
  depositCents: number,
  totalCents: number,
  stateCode: string | null | undefined,
): DepositWarning | null {
  if (!stateCode) return null;
  const cap = DEPOSIT_CAPS[stateCode.toUpperCase()];
  if (!cap || depositCents <= 0) return null;

  const limits: number[] = [];
  if (cap.maxPercent !== undefined) limits.push(roundHalfUp((totalCents * cap.maxPercent) / 100));
  if (cap.maxCents !== undefined) limits.push(cap.maxCents);
  const limit = Math.min(...limits);
  if (depositCents <= limit) return null;
  return {
    message: `${cap.note} That is ${formatMoney(limit)} on this job — this deposit is ${formatMoney(depositCents)}.`,
    suggestedCents: limit,
  };
}

export function describeDeposit(type: DepositType, value: number, totalCents: number): string {
  if (type === "none") return "No deposit";
  if (type === "fixed") return `${formatMoney(computeDepositCents(totalCents, type, value))} fixed`;
  return `${value}% (${formatMoney(computeDepositCents(totalCents, type, value))})`;
}

/* ------------------------------------------------------------- checkout --- */

export type DepositCheckout =
  | { ok: true; url: string; depositId: string; amountCents: number }
  | {
      ok: false;
      code: "no_deposit" | "not_connected" | "stripe_unconfigured" | "not_accepted" | "error";
      message: string;
    };

/**
 * Create a Checkout session for the deposit **on the contractor's connected
 * account**.
 *
 * The idempotency key is derived from the deposit row, so a homeowner who taps Pay
 * twice gets one session and one charge. When Stripe is not configured — or the
 * shop has not connected an account — this returns a typed refusal the proposal
 * page renders as "the contractor will follow up for the deposit", rather than
 * pretending money moved.
 */
export async function createDepositCheckout(proposalId: string): Promise<DepositCheckout> {
  const bundle = await loadProposal(proposalId);
  if (!bundle) return { ok: false, code: "error", message: "This proposal is no longer available." };
  if (bundle.proposal.depositCents <= 0) {
    return { ok: false, code: "no_deposit", message: "This proposal has no deposit." };
  }
  if (bundle.proposal.status !== "accepted" && bundle.proposal.status !== "deposit_paid") {
    return {
      ok: false,
      code: "not_accepted",
      message: "Accept the proposal first, then the deposit step appears.",
    };
  }
  if (!stripeConfigured()) {
    return {
      ok: false,
      code: "stripe_unconfigured",
      message:
        "Card payments are not switched on for this contractor yet. They will follow up with deposit instructions.",
    };
  }
  if (!bundle.org.stripeConnectAccountId) {
    return {
      ok: false,
      code: "not_connected",
      message:
        "This contractor has not connected a payment account yet, so the deposit cannot be paid online. They will follow up.",
    };
  }

  const db = getDb();
  const amountCents = bundle.proposal.depositCents;

  // Reuse a pending deposit row rather than stacking one per tap.
  const existing = bundle.deposit && bundle.deposit.status === "pending" ? bundle.deposit : null;
  const depositRow =
    existing ??
    (
      await db
        .insert(deposits)
        .values({
          organizationId: bundle.org.id,
          proposalId,
          amountCents,
          currency: "usd",
          status: "pending",
          stripeAccountId: bundle.org.stripeConnectAccountId,
        })
        .returning()
    )[0];

  try {
    const session = await stripe().checkout.sessions.create(
      {
        mode: "payment",
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: amountCents,
              product_data: {
                name: `Deposit — ${bundle.job.title}`,
                description: `${bundle.org.name} · contract total ${formatMoney(bundle.proposal.totalCents)}`,
              },
            },
          },
        ],
        customer_email: bundle.job.customerEmail ?? undefined,
        payment_intent_data: {
          // No application_fee_amount: QuoteFox takes nothing from a deposit.
          description: `${bundle.org.name} — deposit for ${bundle.job.title}`,
          metadata: {
            quotefoxProposalId: proposalId,
            quotefoxDepositId: depositRow.id,
            quotefoxOrgId: bundle.org.id,
          },
        },
        metadata: {
          quotefoxProposalId: proposalId,
          quotefoxDepositId: depositRow.id,
          quotefoxOrgId: bundle.org.id,
        },
        success_url: `${env.appUrl}/p/paid?deposit=${depositRow.id}`,
        cancel_url: `${env.appUrl}/p/paid?cancelled=${depositRow.id}`,
      },
      {
        stripeAccount: bundle.org.stripeConnectAccountId,
        idempotencyKey: `deposit:${depositRow.id}`,
      },
    );

    await db
      .update(deposits)
      .set({ stripeCheckoutSessionId: session.id, updatedAt: new Date() })
      .where(eq(deposits.id, depositRow.id));
    await appendEvent(bundle.proposal, "deposit_initiated", { amountCents, sessionId: session.id });
    await audit(bundle.org.id, SYSTEM, "deposit_initiated", bundle.job.title, {
      proposalId,
      amountCents,
    });

    if (!session.url) {
      return { ok: false, code: "error", message: "Stripe did not return a payment page." };
    }
    return { ok: true, url: session.url, depositId: depositRow.id, amountCents };
  } catch (err) {
    return {
      ok: false,
      code: "error",
      message: err instanceof Error ? err.message : "The payment page could not be created.",
    };
  }
}

/**
 * Mark a deposit paid from a webhook. Idempotent by design: the deposit row is
 * only moved out of `pending`, so a replayed event is a no-op.
 */
export async function markDepositPaid(args: {
  depositId: string;
  paymentIntentId: string | null;
  connectedAccountId: string | null;
  amountCents: number;
}): Promise<{ applied: boolean; proposalId: string | null }> {
  const db = getDb();
  const [deposit] = await db.select().from(deposits).where(eq(deposits.id, args.depositId));
  if (!deposit) return { applied: false, proposalId: null };
  if (deposit.status === "paid") return { applied: false, proposalId: deposit.proposalId };

  // A deposit must have landed on the org's own connected account.
  if (args.connectedAccountId && deposit.stripeAccountId && args.connectedAccountId !== deposit.stripeAccountId) {
    await audit(deposit.organizationId, SYSTEM, "deposit_paid", "rejected: wrong connected account", {
      depositId: deposit.id,
      connectedAccountId: args.connectedAccountId,
    });
    return { applied: false, proposalId: deposit.proposalId };
  }

  await db
    .update(deposits)
    .set({
      status: "paid",
      paidAt: new Date(),
      stripePaymentIntentId: args.paymentIntentId,
      amountCents: args.amountCents || deposit.amountCents,
      updatedAt: new Date(),
    })
    .where(eq(deposits.id, deposit.id));
  return { applied: true, proposalId: deposit.proposalId };
}

export async function markDepositRefunded(paymentIntentId: string): Promise<string | null> {
  const db = getDb();
  const [deposit] = await db
    .select()
    .from(deposits)
    .where(eq(deposits.stripePaymentIntentId, paymentIntentId));
  if (!deposit) return null;
  await db
    .update(deposits)
    .set({ status: "refunded", updatedAt: new Date() })
    .where(eq(deposits.id, deposit.id));
  const [proposal] = await db.select().from(proposals).where(eq(proposals.id, deposit.proposalId));
  if (proposal) {
    await appendEvent(proposal, "deposit_refunded", { paymentIntentId });
    await audit(deposit.organizationId, SYSTEM, "deposit_refunded", proposal.id, {
      amountCents: deposit.amountCents,
    });
  }
  return deposit.proposalId;
}

export type { Stripe };

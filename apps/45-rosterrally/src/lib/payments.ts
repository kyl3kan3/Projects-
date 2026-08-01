/**
 * The payment gateway, behind one narrow interface with two implementations.
 *
 * `StripeGateway` is the real thing: Checkout on the club's own connected
 * account, with our $1.50 per paid registration riding as an
 * `application_fee_amount`. Registration money lands in the club's balance and
 * never touches ours (README risk 2).
 *
 * `TestGateway` is selected automatically when `STRIPE_SECRET_KEY` is unset. It
 * returns a URL to an in-app page that is clearly labelled a test gateway and,
 * when confirmed, calls exactly the same settlement function the Stripe webhook
 * calls. That is what makes the whole registration flow — cart, discounts,
 * capacity, waitlist, receipts, the household link — exercisable end to end
 * without a Stripe account, and it is why the settlement path has only one
 * implementation to get right.
 *
 * The live Stripe calls are the one part of this file that cannot be exercised
 * here; everything around them is.
 */

import Stripe from "stripe";
import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";

let _stripe: Stripe | null = null;

/** The platform Stripe client, or null when no key is configured. */
export function getPlatformStripe(): Stripe | null {
  if (!env.stripeSecretKey) return null;
  if (!_stripe) {
    _stripe = new Stripe(env.stripeSecretKey, { apiVersion: "2025-08-27.basil" });
  }
  return _stripe;
}

export interface CheckoutRequest {
  clubId: string;
  clubName: string;
  householdId: string;
  householdEmail: string;
  /** What the family is paying for, one line per child. */
  lines: { registrationId: string; label: string; amountCents: number }[];
  /** Our fee, already computed. Zero for flat-plan clubs and scholarships. */
  platformFeeCents: number;
  /** True when the club pays our fee out of its own fee rather than the parent. */
  absorbPlatformFee: boolean;
  /** The club's Connect account, when it has finished onboarding. */
  connectedAccountId: string | null;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutResult {
  url: string;
  /** Provider reference we can recognise when the money comes back. */
  reference: string;
  gateway: "stripe" | "test";
}

export interface RefundRequest {
  connectedAccountId: string | null;
  paymentIntentId: string | null;
  amountCents: number;
  /** Refund our fee too, proportionally: we do not keep a fee on a refund. */
  platformFeeRefundCents: number;
}

export interface Gateway {
  readonly kind: "stripe" | "test";
  createCheckout(req: CheckoutRequest): Promise<CheckoutResult>;
  refund(req: RefundRequest): Promise<{ refundId: string }>;
  /** Charge an installment against whatever the family used at checkout. */
  chargeInstallment(req: {
    connectedAccountId: string | null;
    amountCents: number;
    idempotencyKey: string;
    description: string;
    /** The intent the deposit was taken on; its method is reused. */
    originalPaymentIntentId: string | null;
  }): Promise<{ paymentIntentId: string; status: "succeeded" | "requires_action" | "failed"; error?: string }>;
}

/* ------------------------------------------------------------ real Stripe --- */

class StripeGateway implements Gateway {
  readonly kind = "stripe" as const;
  constructor(private readonly stripe: Stripe) {}

  async createCheckout(req: CheckoutRequest): Promise<CheckoutResult> {
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = req.lines
      .filter((l) => l.amountCents > 0)
      .map((l) => ({
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: l.amountCents,
          product_data: { name: l.label },
        },
      }));

    // The parent sees one honest total. When the club passes our fee through it
    // is its own line, named, never folded into the registration fee.
    if (!req.absorbPlatformFee && req.platformFeeCents > 0) {
      lineItems.push({
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: req.platformFeeCents,
          product_data: { name: "Registration processing (RosterRally)" },
        },
      });
    }

    const session = await this.stripe.checkout.sessions.create(
      {
        mode: "payment",
        customer_email: req.householdEmail,
        line_items: lineItems,
        success_url: req.successUrl,
        cancel_url: req.cancelUrl,
        payment_intent_data:
          req.platformFeeCents > 0
            ? { application_fee_amount: req.platformFeeCents }
            : undefined,
        metadata: {
          clubId: req.clubId,
          householdId: req.householdId,
          registrationIds: req.lines.map((l) => l.registrationId).join(","),
          platformFeeCents: String(req.platformFeeCents),
        },
      },
      // Charge on the club's account: their money, their payouts, their refunds.
      req.connectedAccountId ? { stripeAccount: req.connectedAccountId } : undefined,
    );
    if (!session.url) throw new Error("Stripe did not return a checkout URL");
    return { url: session.url, reference: session.id, gateway: "stripe" };
  }

  async refund(req: RefundRequest): Promise<{ refundId: string }> {
    if (!req.paymentIntentId) throw new Error("No card payment to refund");
    const refund = await this.stripe.refunds.create(
      {
        payment_intent: req.paymentIntentId,
        amount: req.amountCents,
        refund_application_fee: req.platformFeeRefundCents > 0,
      },
      req.connectedAccountId ? { stripeAccount: req.connectedAccountId } : undefined,
    );
    return { refundId: refund.id };
  }

  async chargeInstallment(req: {
    connectedAccountId: string | null;
    amountCents: number;
    idempotencyKey: string;
    description: string;
    originalPaymentIntentId: string | null;
  }) {
    if (!req.originalPaymentIntentId) {
      return {
        paymentIntentId: "",
        status: "failed" as const,
        error: "No saved payment method for this family",
      };
    }
    const original = await this.stripe.paymentIntents.retrieve(
      req.originalPaymentIntentId,
      undefined,
      req.connectedAccountId ? { stripeAccount: req.connectedAccountId } : undefined,
    );
    const method =
      typeof original.payment_method === "string"
        ? original.payment_method
        : original.payment_method?.id;
    if (!method || !original.customer) {
      return {
        paymentIntentId: "",
        status: "failed" as const,
        error: "The card used at checkout was not saved for later payments",
      };
    }
    try {
      const intent = await this.stripe.paymentIntents.create(
        {
          amount: req.amountCents,
          currency: "usd",
          customer: typeof original.customer === "string" ? original.customer : original.customer.id,
          payment_method: method,
          off_session: true,
          confirm: true,
          description: req.description,
        },
        {
          idempotencyKey: req.idempotencyKey,
          ...(req.connectedAccountId ? { stripeAccount: req.connectedAccountId } : {}),
        },
      );
      return {
        paymentIntentId: intent.id,
        status: intent.status === "succeeded" ? ("succeeded" as const) : ("requires_action" as const),
      };
    } catch (err) {
      return {
        paymentIntentId: "",
        status: "failed" as const,
        error: err instanceof Error ? err.message : "Card declined",
      };
    }
  }
}

/* ------------------------------------------------------------ test gateway --- */

interface TestCheckoutClaims {
  clubId: string;
  householdId: string;
  registrationIds: string[];
  amountCents: number;
  platformFeeCents: number;
  successUrl: string;
}

export async function signTestCheckout(claims: TestCheckoutClaims): Promise<string> {
  return new SignJWT({ ...claims, kind: "test_checkout" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(new TextEncoder().encode(env.linkTokenSecret));
}

export async function verifyTestCheckout(token: string): Promise<TestCheckoutClaims | null> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(env.linkTokenSecret));
    if (payload.kind !== "test_checkout") return null;
    return {
      clubId: String(payload.clubId),
      householdId: String(payload.householdId),
      registrationIds: (payload.registrationIds as string[]) ?? [],
      amountCents: Number(payload.amountCents),
      platformFeeCents: Number(payload.platformFeeCents),
      successUrl: String(payload.successUrl),
    };
  } catch {
    return null;
  }
}

class TestGateway implements Gateway {
  readonly kind = "test" as const;

  async createCheckout(req: CheckoutRequest): Promise<CheckoutResult> {
    const amountCents =
      req.lines.reduce((s, l) => s + l.amountCents, 0) +
      (req.absorbPlatformFee ? 0 : req.platformFeeCents);
    const token = await signTestCheckout({
      clubId: req.clubId,
      householdId: req.householdId,
      registrationIds: req.lines.map((l) => l.registrationId),
      amountCents,
      platformFeeCents: req.platformFeeCents,
      successUrl: req.successUrl,
    });
    return {
      url: `${env.appUrl}/checkout/${token}`,
      reference: `test_${token.slice(-12)}`,
      gateway: "test",
    };
  }

  async refund(req: RefundRequest): Promise<{ refundId: string }> {
    return { refundId: `test_re_${Date.now()}_${req.amountCents}` };
  }

  async chargeInstallment(req: {
    amountCents: number;
    idempotencyKey: string;
  }): Promise<{ paymentIntentId: string; status: "succeeded"; error?: string }> {
    return { paymentIntentId: `test_pi_${req.idempotencyKey}`, status: "succeeded" };
  }
}

/** The gateway this deployment uses. Stripe when there is a key, test when not. */
export function getGateway(): Gateway {
  const stripe = getPlatformStripe();
  return stripe ? new StripeGateway(stripe) : new TestGateway();
}

export function gatewayIsLive(): boolean {
  return getGateway().kind === "stripe";
}

/* ---------------------------------------------------------- our own plan --- */

/**
 * The flat plan ($49/mo) for clubs that would rather not pass a per-registration
 * fee to parents. Without a Stripe key this switches the plan directly and says
 * so — the plan is what gates our fee, and a club must be able to choose it in a
 * self-hosted or pre-Stripe environment.
 */
export async function createFlatPlanCheckout(args: {
  clubId: string;
  clubName: string;
  email: string;
  returnUrl: string;
}): Promise<{ url: string | null; note: string }> {
  const stripe = getPlatformStripe();
  if (!stripe || !env.stripeFlatPriceId) {
    return {
      url: null,
      note: "Stripe billing is not configured on this deployment, so the plan was switched directly. Add STRIPE_SECRET_KEY and STRIPE_PRICE_FLAT to collect the $49/mo.",
    };
  }
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: args.email,
    line_items: [{ price: env.stripeFlatPriceId, quantity: 1 }],
    success_url: `${args.returnUrl}?plan=flat`,
    cancel_url: args.returnUrl,
    metadata: { clubId: args.clubId },
  });
  return { url: session.url, note: "" };
}

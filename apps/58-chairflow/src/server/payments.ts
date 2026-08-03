/**
 * src/server/payments.ts
 *
 * The payment gateway, behind one narrow interface with two implementations.
 *
 * ChairFlow's load-bearing decision is that client money never touches the platform's
 * balance sheet: deposits and fees are created on the *stylist's own* Stripe Connect
 * Express account, with `{ stripeAccount }` on every call. ChairFlow's own
 * subscription is plain Stripe Billing on the platform account. Both live here.
 *
 * **Card collection is a Stripe-hosted Checkout session, not Stripe.js.** A booking
 * page opened from an Instagram bio has one job, and a third-party script on the
 * critical path is the thing most likely to stop it doing that job. `mode: "setup"`
 * saves a card off-session; `mode: "payment"` with `setup_future_usage: "off_session"`
 * takes the deposit and saves the same card in one step. Neither needs a publishable
 * key in the page.
 *
 * The second implementation, `recordedGateway`, is selected automatically when
 * `STRIPE_SECRET_KEY` is absent (or `DRY_RUN=1`). It is deterministic and offline, so
 * the whole money spine — deposit held, no-show marked, deposit applied first,
 * remainder charged, decline surfaced, waive recorded — is exercisable without a
 * Stripe account. What it does not do is pretend: every id it mints carries `_sim_`,
 * every row it produces is flagged `simulated`, and every screen showing one says so.
 * A ledger that quietly counts imaginary money is worse than no ledger.
 *
 * A card whose last four are `0002` — Stripe's own always-declines test number —
 * declines here too. That is how the failure branch gets driven in a browser.
 */

import Stripe from "stripe";
import { env, stripeConfigured } from "@/lib/env";

export interface SavedCard {
  customerId: string;
  paymentMethodId: string;
  last4: string;
}

export type ChargeResult =
  | { ok: true; paymentIntentId: string; simulated: boolean }
  | { ok: false; code: string; message: string; simulated: boolean };

/** What collecting a card produced: either it is on file, or Stripe must be visited. */
export type CardCollection =
  | {
      kind: "saved";
      card: SavedCard;
      /** The deposit's PaymentIntent, when a deposit was taken. */
      depositPaymentIntentId: string | null;
      simulated: boolean;
    }
  | { kind: "hosted"; url: string; customerId: string };

export interface PaymentGateway {
  readonly simulated: boolean;

  createExpressAccount(input: { email: string; displayName: string }): Promise<{ accountId: string }>;
  createOnboardingLink(input: {
    accountId: string;
    returnUrl: string;
    refreshUrl: string;
  }): Promise<{ url: string }>;
  /** Has the account finished KYC and can it take charges? */
  accountReady(accountId: string): Promise<boolean>;

  /**
   * Put a card on file for later off-session use, taking the deposit at the same time
   * when the service asks for one.
   */
  collectCard(input: {
    accountId: string;
    clientName: string;
    phone: string;
    email: string | null;
    /** What the client typed into the demo card field. Recorded gateway only. */
    cardHint?: string;
    depositCents: number;
    description: string;
    metadata: Record<string, string>;
    successUrl: string;
    cancelUrl: string;
  }): Promise<CardCollection>;

  /** Charge a fee off-session against the card on file, per the agreed policy. */
  chargeFee(input: {
    accountId: string;
    customerId: string;
    paymentMethodId: string;
    amountCents: number;
    description: string;
    metadata: Record<string, string>;
    idempotencyKey: string;
  }): Promise<ChargeResult>;

  /** A hosted link the stylist can send when an off-session charge is refused. */
  hostedRetryLink(input: {
    accountId: string;
    amountCents: number;
    description: string;
    metadata: Record<string, string>;
  }): Promise<{ url: string } | null>;

  /** ChairFlow's own subscription checkout, on the platform account. */
  createSubscriptionCheckout(input: {
    stylistId: string;
    plan: string;
    priceId: string;
    customerId: string | null;
    email: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ url: string } | null>;
  createPortalSession(input: { customerId: string; returnUrl: string }): Promise<{ url: string } | null>;

  /** A rent payment link on the shop owner's own account. */
  createRentPaymentLink(input: {
    accountId: string | null;
    amountCents: number;
    description: string;
    metadata: Record<string, string>;
  }): Promise<{ id: string; url: string } | null>;
}

/* ------------------------------------------------------------------ */
/* The real one                                                        */
/* ------------------------------------------------------------------ */

let _stripe: Stripe | null = null;

/** Pinned to the API version the installed major expects. */
export function stripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(env.stripeSecretKey, { apiVersion: "2025-08-27.basil" });
  }
  return _stripe;
}

function decodeStripeError(err: unknown): { code: string; message: string } {
  if (err instanceof Stripe.errors.StripeError) {
    return { code: err.code ?? err.type ?? "stripe_error", message: err.message };
  }
  return { code: "unknown", message: err instanceof Error ? err.message : String(err) };
}

const realGateway: PaymentGateway = {
  simulated: false,

  async createExpressAccount({ email, displayName }) {
    const account = await stripe().accounts.create({
      type: "express",
      email,
      business_type: "individual",
      business_profile: { name: displayName, product_description: "Hair and barbering services" },
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
    });
    return { accountId: account.id };
  },

  async createOnboardingLink({ accountId, returnUrl, refreshUrl }) {
    const link = await stripe().accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      return_url: returnUrl,
      refresh_url: refreshUrl,
    });
    return { url: link.url };
  },

  async accountReady(accountId) {
    const account = await stripe().accounts.retrieve(accountId);
    return Boolean(account.charges_enabled);
  },

  async collectCard(input) {
    const customer = await stripe().customers.create(
      { name: input.clientName, phone: input.phone, email: input.email ?? undefined },
      { stripeAccount: input.accountId },
    );
    const common = {
      customer: customer.id,
      metadata: input.metadata,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    };
    const session =
      input.depositCents > 0
        ? await stripe().checkout.sessions.create(
            {
              ...common,
              mode: "payment",
              payment_intent_data: {
                setup_future_usage: "off_session",
                description: input.description,
                metadata: input.metadata,
              },
              line_items: [
                {
                  quantity: 1,
                  price_data: {
                    currency: "usd",
                    unit_amount: input.depositCents,
                    product_data: { name: `Deposit — ${input.description}` },
                  },
                },
              ],
            },
            { stripeAccount: input.accountId },
          )
        : await stripe().checkout.sessions.create(
            { ...common, mode: "setup", payment_method_types: ["card"] },
            { stripeAccount: input.accountId },
          );
    return { kind: "hosted", url: session.url ?? input.cancelUrl, customerId: customer.id };
  },

  async chargeFee(input) {
    try {
      const intent = await stripe().paymentIntents.create(
        {
          amount: input.amountCents,
          currency: "usd",
          customer: input.customerId,
          payment_method: input.paymentMethodId,
          off_session: true,
          confirm: true,
          description: input.description,
          metadata: input.metadata,
        },
        { stripeAccount: input.accountId, idempotencyKey: input.idempotencyKey },
      );
      if (intent.status === "succeeded" || intent.status === "requires_capture") {
        return { ok: true, paymentIntentId: intent.id, simulated: false };
      }
      return {
        ok: false,
        code: intent.status,
        message: `Stripe left the payment ${intent.status}.`,
        simulated: false,
      };
    } catch (err) {
      return { ok: false, ...decodeStripeError(err), simulated: false };
    }
  },

  async hostedRetryLink({ accountId, amountCents, description, metadata }) {
    const link = await stripe().paymentLinks.create(
      {
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: amountCents,
              product_data: { name: description },
            },
          },
        ],
        metadata,
      },
      { stripeAccount: accountId },
    );
    return { url: link.url };
  },

  async createSubscriptionCheckout(input) {
    const session = await stripe().checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: input.priceId, quantity: 1 }],
      customer: input.customerId ?? undefined,
      customer_email: input.customerId ? undefined : input.email,
      client_reference_id: input.stylistId,
      metadata: { stylistId: input.stylistId, plan: input.plan },
      subscription_data: { metadata: { stylistId: input.stylistId, plan: input.plan } },
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    });
    return session.url ? { url: session.url } : null;
  },

  async createPortalSession({ customerId, returnUrl }) {
    const session = await stripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
    return { url: session.url };
  },

  async createRentPaymentLink({ accountId, amountCents, description, metadata }) {
    const options = accountId ? { stripeAccount: accountId } : undefined;
    const link = await stripe().paymentLinks.create(
      {
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: amountCents,
              product_data: { name: description },
            },
          },
        ],
        metadata,
      },
      options,
    );
    return { id: link.id, url: link.url };
  },
};

/* ------------------------------------------------------------------ */
/* The recorded stand-in                                               */
/* ------------------------------------------------------------------ */

function simId(prefix: string): string {
  return `${prefix}_sim_${Math.random().toString(36).slice(2, 12)}`;
}

export const recordedGateway: PaymentGateway = {
  simulated: true,

  async createExpressAccount() {
    return { accountId: simId("acct") };
  },

  async createOnboardingLink({ returnUrl }) {
    // There is nothing to onboard against, so the link returns where it came from and
    // the caller marks the account ready. The screen says it was simulated.
    return { url: returnUrl };
  },

  async accountReady() {
    return true;
  },

  async collectCard(input) {
    const digits = (input.cardHint ?? "").replace(/\D/g, "");
    const last4 = digits.length >= 4 ? digits.slice(-4) : "4242";
    const declines = last4 === "0002";
    const card: SavedCard = {
      customerId: simId("cus"),
      paymentMethodId: declines ? simId("pm_decline") : simId("pm"),
      last4,
    };
    if (input.depositCents > 0 && declines) {
      // A deposit is on-session: a declined card cannot book with one.
      throw new PaymentDeclined("That card was declined. Try another card.");
    }
    return {
      kind: "saved",
      card,
      depositPaymentIntentId: input.depositCents > 0 ? simId("pi") : null,
      simulated: true,
    };
  },

  async chargeFee(input) {
    if (input.paymentMethodId.includes("decline")) {
      return { ok: false, code: "card_declined", message: "The card was declined.", simulated: true };
    }
    if (input.amountCents <= 0) {
      return { ok: false, code: "amount_too_small", message: "Nothing to charge.", simulated: true };
    }
    return { ok: true, paymentIntentId: simId("pi"), simulated: true };
  },

  async hostedRetryLink() {
    return null;
  },

  async createSubscriptionCheckout() {
    return null;
  },

  async createPortalSession() {
    return null;
  },

  async createRentPaymentLink() {
    return null;
  },
};

/** Thrown when an on-session payment is refused at booking time. */
export class PaymentDeclined extends Error {}

/**
 * Which gateway is in play. Read at call time rather than at module load, so a process
 * that gains a key does not need restarting to notice.
 */
export function gateway(): PaymentGateway {
  return stripeConfigured() ? realGateway : recordedGateway;
}
